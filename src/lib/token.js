const crypto = require('crypto');
const env = require('../config/env');

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64').toString('utf8');
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function createToken(subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: subject,
      exp: now + env.TOKEN_TTL_SECONDS,
      iat: now,
    })
  );
  const signature = toBase64Url(
    crypto.createHmac('sha256', env.AUTH_SECRET).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = toBase64Url(
    crypto.createHmac('sha256', env.AUTH_SECRET).update(`${header}.${payload}`).digest()
  );

  if (!safeEqual(signature, expected)) return null;

  try {
    const decoded = JSON.parse(fromBase64Url(payload));
    if (!decoded.exp || Number(decoded.exp) < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

module.exports = { createToken, verifyToken, safeEqual };
