const { dbPool } = require('./database');

const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const attemptMap = new Map();
const invalidBeforeByUser = new Map();

function keyFor(username, ip) {
  return `${String(username || '').toLowerCase()}::${String(ip || '')}`;
}

function nowMs() {
  return Date.now();
}

function prune(entry, now = nowMs()) {
  entry.attempts = entry.attempts.filter((ts) => now - ts <= WINDOW_MS);
}

function canAttempt(username, ip) {
  const key = keyFor(username, ip);
  const entry = attemptMap.get(key);
  if (!entry) return { ok: true };
  const now = nowMs();
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { ok: false, retryAt: entry.lockedUntil };
  }
  prune(entry, now);
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    entry.lockedUntil = 0;
  }
  return { ok: true };
}

function recordFailedAttempt(username, ip) {
  const key = keyFor(username, ip);
  const now = nowMs();
  const entry = attemptMap.get(key) || { attempts: [], lockedUntil: 0 };
  prune(entry, now);
  entry.attempts.push(now);
  if (entry.attempts.length >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    entry.attempts = [];
  }
  attemptMap.set(key, entry);
  return entry.lockedUntil || 0;
}

function recordSuccessfulAttempt(username, ip) {
  attemptMap.delete(keyFor(username, ip));
}

function logoutAllForUser(username) {
  invalidBeforeByUser.set(String(username || ''), Math.floor(Date.now() / 1000));
}

function isTokenRevoked(decoded) {
  const user = String(decoded?.sub || '');
  const invalidBefore = invalidBeforeByUser.get(user);
  if (!invalidBefore) return false;
  const iat = Number(decoded?.iat || 0);
  return iat <= invalidBefore;
}

async function logAuthSecurityEvent({
  username = '',
  ip = null,
  action,
  detail = null,
} = {}) {
  if (!action) return;
  try {
    await dbPool.query(
      `
        INSERT INTO auth_security_events (username, ip, action, detail, created_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW())
      `,
      [username, ip, action, JSON.stringify(detail || {})]
    );
  } catch (_error) {
    // no-op
  }
}

module.exports = {
  canAttempt,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  logoutAllForUser,
  isTokenRevoked,
  logAuthSecurityEvent,
};

