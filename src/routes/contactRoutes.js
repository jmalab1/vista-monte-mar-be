const express = require('express');
const rateLimit = require('express-rate-limit');
const { hasSmtpConfig, sendContactEmail } = require('../services/mailService');
const {
  normalizeBody,
  validateSubmission,
  getRequestMetadata,
  createSubmission,
  markEmailSent,
  markEmailFailed,
} = require('../services/submissionService');

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'The limit to sending a message has been reached. Please try again later.',
});

function createContactRouter(overrides = {}) {
  const router = express.Router();

  const limiter = overrides.emailLimiter || emailLimiter;
  const normalize = overrides.normalizeBody || normalizeBody;
  const validate = overrides.validateSubmission || validateSubmission;
  const requestMetadata = overrides.getRequestMetadata || getRequestMetadata;
  const insertSubmission = overrides.createSubmission || createSubmission;
  const sendEmail = overrides.sendContactEmail || sendContactEmail;
  const updateEmailSent = overrides.markEmailSent || markEmailSent;
  const updateEmailFailed = overrides.markEmailFailed || markEmailFailed;
  const smtpConfigured =
    typeof overrides.hasSmtpConfig === 'boolean' ? overrides.hasSmtpConfig : hasSmtpConfig;

  router.post('/api/send-email', limiter, async (req, res) => {
    const payload = normalize(req.body || {});

    if (!validate(payload)) {
      return res.status(400).send({
        error: 'Missing required fields. Required: firstname, lastname, email, comment.',
      });
    }

    const metadata = requestMetadata(req);

    let submissionId;
    try {
      submissionId = await insertSubmission(payload, metadata);
    } catch (dbError) {
      console.error('Failed to save form submission:', dbError);
      return res.status(500).send({ error: 'Unable to save form submission.' });
    }

    try {
      const info = await sendEmail(payload);
      await updateEmailSent(submissionId);

      return res.status(200).send({
        message: smtpConfigured
          ? 'Email sent successfully and submission saved.'
          : 'Submission saved (email running in local mock mode).',
        submissionId,
        info,
      });
    } catch (mailError) {
      await updateEmailFailed(submissionId, mailError);
      return res.status(502).send({
        error: 'Submission was saved, but sending email failed.',
        submissionId,
        details: String(mailError),
      });
    }
  });

  return router;
}

module.exports = {
  createContactRouter,
  emailLimiter,
};
