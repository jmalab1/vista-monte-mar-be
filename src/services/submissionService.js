const { dbPool } = require('./database');

function normalizeBody(body) {
  return {
    firstname: String(body.firstname || '').trim(),
    lastname: String(body.lastname || '').trim(),
    email: String(body.email || '').trim(),
    phone_number: String(body.phone_number || '').trim(),
    comment: String(body.comment || '').trim(),
  };
}

function validateSubmission(payload) {
  return payload.firstname && payload.lastname && payload.email && payload.comment;
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || '';
}

function getRequestMetadata(req) {
  return {
    referrer: String(req.headers.referer || req.headers.referrer || ''),
    userAgent: String(req.headers['user-agent'] || ''),
    ipAddress: getClientIp(req),
  };
}

async function createSubmission(payload, metadata) {
  const insertResult = await dbPool.query(
    `
      INSERT INTO form_submissions
        (firstname, lastname, email, phone_number, comment, referrer, user_agent, ip)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id;
    `,
    [
      payload.firstname,
      payload.lastname,
      payload.email,
      payload.phone_number || null,
      payload.comment,
      metadata.referrer || null,
      metadata.userAgent || null,
      metadata.ipAddress || null,
    ]
  );

  return insertResult.rows[0].id;
}

async function markEmailSent(submissionId) {
  await dbPool.query(
    'UPDATE form_submissions SET email_sent = TRUE, email_error = NULL WHERE id = $1',
    [submissionId]
  );
}

async function markEmailFailed(submissionId, error) {
  await dbPool.query(
    'UPDATE form_submissions SET email_sent = FALSE, email_error = $2 WHERE id = $1',
    [submissionId, String(error)]
  );
}

module.exports = {
  normalizeBody,
  validateSubmission,
  getRequestMetadata,
  createSubmission,
  markEmailSent,
  markEmailFailed,
};
