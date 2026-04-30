const { dbPool } = require('./database');
let ensureAuditSchemaPromise = null;

async function ensureAuditSchema() {
  if (!ensureAuditSchemaPromise) {
    ensureAuditSchemaPromise = (async () => {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS audit_events (
          id BIGSERIAL PRIMARY KEY,
          actor TEXT NOT NULL DEFAULT 'system',
          action TEXT NOT NULL,
          target TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          ip TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_events_action_created_at
          ON audit_events (action, created_at DESC);
      `);
      await dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
          ON audit_events (created_at DESC);
      `);
    })().catch((error) => {
      ensureAuditSchemaPromise = null;
      throw error;
    });
  }

  return ensureAuditSchemaPromise;
}

async function logAuditEvent({
  actor = 'system',
  action,
  target = null,
  metadata = null,
  ip = null,
} = {}) {
  if (!action) return;
  try {
    await ensureAuditSchema();
    await dbPool.query(
      `
        INSERT INTO audit_events (actor, action, target, metadata, ip, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
      `,
      [actor, action, target, JSON.stringify(metadata || {}), ip]
    );
  } catch (_error) {
    // no-op: audit logging must not break primary flows
  }
}

function normalizePagination(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

async function getAuditEvents({
  page = 1,
  pageSize = 25,
  action,
  actor,
  from,
  to,
} = {}) {
  await ensureAuditSchema();
  const safePage = normalizePagination(page, 1);
  const safeSize = Math.min(normalizePagination(pageSize, 25), 100);
  const where = [];
  const params = [];
  let idx = 1;

  if (action) {
    where.push(`action = $${idx++}`);
    params.push(String(action));
  }
  if (actor) {
    where.push(`actor = $${idx++}`);
    params.push(String(actor));
  }
  if (from) {
    where.push(`created_at >= $${idx++}::timestamptz`);
    params.push(String(from));
  }
  if (to) {
    where.push(`created_at <= $${idx++}::timestamptz`);
    params.push(String(to));
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalSql = `SELECT COUNT(*)::int AS total FROM audit_events ${whereSql};`;
  const rowsSql = `
    SELECT actor, action, target, metadata, ip, created_at
    FROM audit_events
    ${whereSql}
    ORDER BY created_at DESC
    OFFSET $${idx++}
    LIMIT $${idx++};
  `;
  const offset = (safePage - 1) * safeSize;
  const rowsParams = [...params, offset, safeSize];

  let totalResult;
  let rowsResult;
  try {
    [totalResult, rowsResult] = await Promise.all([
      dbPool.query(totalSql, params),
      dbPool.query(rowsSql, rowsParams),
    ]);
  } catch (error) {
    // If migrations haven't been applied yet, avoid hard-failing the page.
    if (error && error.code === '42P01') {
      return {
        records: [],
        page: safePage,
        pageSize: safeSize,
        total: 0,
        totalPages: 1,
      };
    }
    throw error;
  }

  const total = totalResult.rows[0]?.total || 0;
  const totalPages = Math.max(Math.ceil(total / safeSize), 1);

  return {
    records: rowsResult.rows.map((row) => ({
      actor: row.actor,
      action: row.action,
      target: row.target,
      metadata: row.metadata || {},
      ip: row.ip,
      createdAt: row.created_at,
    })),
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages,
  };
}

module.exports = {
  logAuditEvent,
  getAuditEvents,
};
