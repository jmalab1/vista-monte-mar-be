const { dbPool } = require('./database');

function normalizeTrackedPath(pathValue) {
  const path = String(pathValue || '').trim();
  if (!path) return '/';
  if (path.startsWith('/')) return path;
  return `/${path}`;
}

function deriveTrackedPathFromRequest(req) {
  const explicitPath = String(req.headers['x-page-path'] || req.body?.path || '').trim();
  if (explicitPath) {
    return normalizeTrackedPath(explicitPath);
  }

  const referer = String(req.headers.referer || req.headers.referrer || '').trim();
  if (!referer) {
    return '/';
  }

  try {
    const parsed = new URL(referer);
    return normalizeTrackedPath(parsed.pathname || '/');
  } catch {
    return '/';
  }
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || '';
}

async function saveVisitorEvent(req, trackedPathOverride) {
  const trackedPath = normalizeTrackedPath(trackedPathOverride || deriveTrackedPathFromRequest(req));
  const referrer = String(req.headers.referer || req.headers.referrer || req.body?.referrer || '').trim();
  const userAgent = String(req.headers['user-agent'] || '').trim();
  const ipAddress = getClientIp(req);

  const result = await dbPool.query(
    `
      INSERT INTO visitors (path, referrer, user_agent, ip)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [trackedPath, referrer || null, userAgent || null, ipAddress || null]
  );

  return result.rows[0].id;
}

async function getVisitorHistory(limit = 500) {
  const result = await dbPool.query(
    `
      SELECT created_at, path, referrer, user_agent, ip
      FROM visitors
      ORDER BY created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    createdAt: row.created_at,
    path: row.path,
    referrer: row.referrer,
    userAgent: row.user_agent,
    ip: row.ip,
  }));
}

module.exports = {
  normalizeTrackedPath,
  deriveTrackedPathFromRequest,
  getClientIp,
  saveVisitorEvent,
  getVisitorHistory,
};
