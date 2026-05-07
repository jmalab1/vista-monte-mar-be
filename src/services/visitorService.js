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

function normalizePaginationValue(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizePeriod(period) {
  if (period === 'month' || period === 'year') {
    return period;
  }
  return 'day';
}

async function getVisitorHistoryPage({
  page = 1,
  pageSize = 25,
  period = 'day',
  path,
  referrer,
  ip,
  from,
  to,
  uaContains,
} = {}) {
  const safePage = normalizePaginationValue(page, 1);
  const safePageSize = Math.min(normalizePaginationValue(pageSize, 25), 100);
  const safePeriod = normalizePeriod(period);
  const offset = (safePage - 1) * safePageSize;

  const where = [];
  const params = [];
  let paramIdx = 1;
  if (path) {
    where.push(`path = $${paramIdx++}`);
    params.push(String(path));
  }
  if (referrer) {
    where.push(`referrer ILIKE $${paramIdx++}`);
    params.push(`%${String(referrer)}%`);
  }
  if (ip) {
    where.push(`ip = $${paramIdx++}`);
    params.push(String(ip));
  }
  if (from) {
    where.push(`created_at >= $${paramIdx++}::timestamptz`);
    params.push(String(from));
  }
  if (to) {
    where.push(`created_at <= $${paramIdx++}::timestamptz`);
    params.push(String(to));
  }
  if (uaContains) {
    where.push(`user_agent ILIKE $${paramIdx++}`);
    params.push(`%${String(uaContains)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [totalResult, recordsResult] = await Promise.all([
    dbPool.query(`SELECT COUNT(*)::int AS total FROM visitors ${whereSql};`, params),
    dbPool.query(
      `
        SELECT created_at, path, referrer, user_agent, ip
        FROM visitors
        ${whereSql}
        ORDER BY created_at DESC
        OFFSET $${paramIdx}
        LIMIT $${paramIdx + 1};
      `,
      [...params, offset, safePageSize]
    ),
  ]);

  const total = totalResult.rows[0]?.total || 0;
  const totalPages = Math.max(Math.ceil(total / safePageSize), 1);

  const truncExpr =
    safePeriod === 'year'
      ? "to_char(date_trunc('year', created_at), 'YYYY')"
      : safePeriod === 'month'
        ? "to_char(date_trunc('month', created_at), 'YYYY-MM')"
        : "to_char(date_trunc('day', created_at), 'YYYY-MM-DD')";

  const seriesResult = await dbPool.query(
    `
      SELECT ${truncExpr} AS bucket, COUNT(*)::int AS count
      FROM visitors
      ${whereSql}
      GROUP BY bucket
      ORDER BY bucket ASC;
    `,
    params
  );

  return {
    records: recordsResult.rows.map((row) => ({
      createdAt: row.created_at,
      path: row.path,
      referrer: row.referrer,
      userAgent: row.user_agent,
      ip: row.ip,
    })),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
    period: safePeriod,
    series: seriesResult.rows.map((row) => ({
      bucket: row.bucket,
      count: row.count,
    })),
  };
}

async function getVisitorHistoryCsvRows(filters = {}) {
  const payload = await getVisitorHistoryPage({
    ...filters,
    page: 1,
    pageSize: 10000,
    period: 'day',
  });
  return payload.records;
}

module.exports = {
  normalizeTrackedPath,
  deriveTrackedPathFromRequest,
  getClientIp,
  saveVisitorEvent,
  getVisitorHistoryPage,
  getVisitorHistoryCsvRows,
};
