const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { hasSmtpConfig, sendContactEmail } = require('../services/mailService');
const {
  normalizeBody,
  validateSubmission,
  getRequestMetadata,
  createSubmission,
  markEmailSent,
  markEmailFailed,
  getContactEmailHistoryPage,
  getContactEmailHistoryCsvRows,
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
  const loadEmailHistory = overrides.getContactEmailHistoryPage || getContactEmailHistoryPage;
  const loadEmailHistoryCsvRows =
    overrides.getContactEmailHistoryCsvRows || getContactEmailHistoryCsvRows;
  const smtpConfigured =
    typeof overrides.hasSmtpConfig === 'boolean' ? overrides.hasSmtpConfig : hasSmtpConfig;

  const escapeCsv = (value) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

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

  router.get('/api/contact-email-history', requireAuth, async (req, res) => {
    try {
      const payload = await loadEmailHistory({
        page: req.query.page,
        pageSize: req.query.pageSize,
        limit: req.query.limit,
        email: req.query.email,
      });
      return res.status(200).send(payload);
    } catch (error) {
      console.error('Failed to load contact email history:', error);
      return res.status(500).send({ error: 'Unable to load email history.' });
    }
  });

  router.get('/api/contact-email-history/export.csv', requireAuth, async (req, res) => {
    try {
      const rows = await loadEmailHistoryCsvRows({
        email: req.query.email,
      });
      const header = 'createdAt,firstname,lastname,email,phone_number,comment,emailSent,emailError';
      const lines = rows.map((row) =>
        [
          escapeCsv(row.createdAt),
          escapeCsv(row.firstname),
          escapeCsv(row.lastname),
          escapeCsv(row.email),
          escapeCsv(row.phone_number),
          escapeCsv(row.comment),
          escapeCsv(row.emailSent),
          escapeCsv(row.emailError),
        ].join(',')
      );
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="contact-email-history.csv"');
      return res.status(200).send(csv);
    } catch (error) {
      console.error('Failed to export contact email history:', error);
      return res.status(500).send({ error: 'Unable to export email history.' });
    }
  });

  return router;
}

module.exports = {
  createContactRouter,
  emailLimiter,
};
