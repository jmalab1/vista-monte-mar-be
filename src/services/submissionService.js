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

function normalizePaginationValue(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function mapSubmissionRow(row) {
  return {
    id: row.id,
    firstname: row.firstname,
    lastname: row.lastname,
    email: row.email,
    phone_number: row.phone_number,
    comment: row.comment,
    emailSent: row.email_sent,
    emailError: row.email_error,
    createdAt: row.created_at,
  };
}

function buildSubmissionHistoryWhere({ email } = {}) {
  const where = [];
  const params = [];

  if (email) {
    where.push('email ILIKE $1');
    params.push(`%${String(email)}%`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

async function getContactEmailHistoryPage({ page = 1, pageSize, limit, email } = {}) {
  const safePage = normalizePaginationValue(page, 1);
  const requestedPageSize = pageSize ?? limit ?? 10;
  const safePageSize = Math.min(normalizePaginationValue(requestedPageSize, 10), 100);
  const offset = (safePage - 1) * safePageSize;
  const { whereSql, params } = buildSubmissionHistoryWhere({ email });
  const nextParam = params.length + 1;

  const [totalResult, recordsResult] = await Promise.all([
    dbPool.query(`SELECT COUNT(*)::int AS total FROM form_submissions ${whereSql};`, params),
    dbPool.query(
      `
        SELECT id, firstname, lastname, email, phone_number, comment, email_sent, email_error, created_at
        FROM form_submissions
        ${whereSql}
        ORDER BY created_at DESC
        OFFSET $${nextParam}
        LIMIT $${nextParam + 1};
      `,
      [...params, offset, safePageSize]
    ),
  ]);

  const total = totalResult.rows[0]?.total || 0;
  const totalPages = Math.max(Math.ceil(total / safePageSize), 1);

  return {
    records: recordsResult.rows.map(mapSubmissionRow),
    total,
    page: safePage,
    pageSize: safePageSize,
    limit: safePageSize,
    totalPages,
  };
}

async function getContactEmailHistoryCsvRows(filters = {}) {
  const { whereSql, params } = buildSubmissionHistoryWhere(filters);
  const result = await dbPool.query(
    `
      SELECT id, firstname, lastname, email, phone_number, comment, email_sent, email_error, created_at
      FROM form_submissions
      ${whereSql}
      ORDER BY created_at DESC;
    `,
    params
  );

  return result.rows.map(mapSubmissionRow);
}

module.exports = {
  normalizeBody,
  validateSubmission,
  getRequestMetadata,
  createSubmission,
  markEmailSent,
  markEmailFailed,
  getContactEmailHistoryPage,
  getContactEmailHistoryCsvRows,
};
