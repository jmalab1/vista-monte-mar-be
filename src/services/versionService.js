const crypto = require('crypto');
const { dbPool } = require('./database');
const { getJsonValue, setJsonValue } = require('./kvService');
let ensureVersioningSchemaPromise = null;

function checksumJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

async function ensureVersioningSchema() {
  if (!ensureVersioningSchemaPromise) {
    ensureVersioningSchemaPromise = (async () => {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS app_kv_versions (
          id BIGSERIAL PRIMARY KEY,
          domain TEXT NOT NULL,
          key TEXT NOT NULL,
          actor TEXT NOT NULL DEFAULT 'system',
          before_value JSONB,
          after_value JSONB,
          before_checksum TEXT,
          after_checksum TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_app_kv_versions_key_created_at
          ON app_kv_versions (key, created_at DESC);
      `);
      await dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_app_kv_versions_domain_created_at
          ON app_kv_versions (domain, created_at DESC);
      `);
    })().catch((error) => {
      ensureVersioningSchemaPromise = null;
      throw error;
    });
  }

  return ensureVersioningSchemaPromise;
}

async function saveVersion({
  domain,
  key,
  actor = 'system',
  beforeValue,
  afterValue,
  metadata = null,
} = {}) {
  if (!domain || !key) return;

  try {
    await ensureVersioningSchema();
    await dbPool.query(
      `
        INSERT INTO app_kv_versions (
          domain, key, actor, before_value, after_value, before_checksum, after_checksum, metadata, created_at
        ) VALUES (
          $1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb, NOW()
        )
      `,
      [
        domain,
        key,
        actor,
        JSON.stringify(beforeValue ?? null),
        JSON.stringify(afterValue ?? null),
        checksumJson(beforeValue),
        checksumJson(afterValue),
        JSON.stringify(metadata || {}),
      ]
    );
  } catch (_error) {
    // no-op: versioning should not block writes
  }
}

function normalizePagination(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

async function listVersions({ domain, page = 1, pageSize = 25 } = {}) {
  await ensureVersioningSchema();
  const safePage = normalizePagination(page, 1);
  const safeSize = Math.min(normalizePagination(pageSize, 25), 100);
  const offset = (safePage - 1) * safeSize;

  const params = [];
  let whereSql = '';
  if (domain) {
    params.push(String(domain));
    whereSql = `WHERE domain = $1`;
  }

  const totalQuery = `SELECT COUNT(*)::int AS total FROM app_kv_versions ${whereSql};`;
  const listQuery = `
    SELECT id, domain, key, actor, before_value, after_value, before_checksum, after_checksum, metadata, created_at
    FROM app_kv_versions
    ${whereSql}
    ORDER BY created_at DESC
    OFFSET $${params.length + 1}
    LIMIT $${params.length + 2};
  `;

  let totalResult;
  let listResult;
  try {
    [totalResult, listResult] = await Promise.all([
      dbPool.query(totalQuery, params),
      dbPool.query(listQuery, [...params, offset, safeSize]),
    ]);
  } catch (error) {
    // If migrations are not applied yet, return a safe empty response.
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
    records: listResult.rows.map((row) => ({
      id: row.id,
      domain: row.domain,
      key: row.key,
      actor: row.actor,
      beforeValue: row.before_value,
      afterValue: row.after_value,
      beforeChecksum: row.before_checksum,
      afterChecksum: row.after_checksum,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    })),
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages,
  };
}

async function restoreVersion(id) {
  await ensureVersioningSchema();
  let result;
  try {
    result = await dbPool.query(
      `
        SELECT id, key, after_value
        FROM app_kv_versions
        WHERE id = $1
        LIMIT 1;
      `,
      [id]
    );
  } catch (error) {
    // Missing version table means there is nothing to restore yet.
    if (error && error.code === '42P01') {
      return { restored: false, reason: 'not_found' };
    }
    throw error;
  }
  const row = result.rows[0];
  if (!row) return { restored: false, reason: 'not_found' };

  await setJsonValue(row.key, row.after_value);
  const current = await getJsonValue(row.key, null);
  return { restored: true, key: row.key, value: current };
}

module.exports = {
  saveVersion,
  listVersions,
  restoreVersion,
};
