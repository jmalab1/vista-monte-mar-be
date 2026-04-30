const express = require('express');
const { ADMIN_USERNAME, ADMIN_PASSWORD } = require('../config/env');
const { createToken, safeEqual, verifyToken } = require('../lib/token');
const { getTokenFromRequest, requireAuth } = require('../middleware/auth');
const { getClientIp } = require('../services/visitorService');
const {
  canAttempt,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  logoutAllForUser,
  logAuthSecurityEvent,
} = require('../services/securityService');
const { logAuditEvent } = require('../services/auditService');

const router = express.Router();

router.post('/api/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const ip = getClientIp(req);

  const lockout = canAttempt(username, ip);
  if (!lockout.ok) {
    await logAuthSecurityEvent({
      username,
      ip,
      action: 'login_blocked_lockout',
      detail: { retryAt: lockout.retryAt },
    });
    return res.status(429).send({ error: 'Too many failed attempts. Try again later.' });
  }

  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    const lockedUntil = recordFailedAttempt(username, ip);
    await logAuthSecurityEvent({
      username,
      ip,
      action: 'login_failed',
      detail: lockedUntil ? { lockedUntil } : {},
    });
    return res.status(401).send({ error: 'Invalid credentials' });
  }

  recordSuccessfulAttempt(username, ip);
  await logAuthSecurityEvent({ username, ip, action: 'login_success' });
  await logAuditEvent({ actor: username, action: 'login_success', target: 'auth', ip });
  return res.status(200).send({ token: createToken(username) });
});

router.get('/api/verify-token', (req, res) => {
  const token = getTokenFromRequest(req);
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).send({ valid: false });

  const refreshedToken = createToken(decoded.sub);
  const refreshedDecoded = verifyToken(refreshedToken);

  return res.status(200).send({
    valid: true,
    user: decoded.sub,
    exp: refreshedDecoded.exp,
    token: refreshedToken,
  });
});

router.post('/api/logout-all', requireAuth, async (req, res) => {
  const actor = String(req.auth?.sub || 'admin');
  logoutAllForUser(actor);
  const ip = getClientIp(req);
  await logAuthSecurityEvent({ username: actor, ip, action: 'logout_all' });
  await logAuditEvent({ actor, action: 'logout_all', target: 'auth', ip });
  return res.status(200).send({ success: true });
});

module.exports = router;
