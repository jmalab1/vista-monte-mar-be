const express = require('express');
const { ADMIN_USERNAME, ADMIN_PASSWORD } = require('../config/env');
const { createToken, safeEqual, verifyToken } = require('../lib/token');
const { getTokenFromRequest } = require('../middleware/auth');

const router = express.Router();

router.post('/api/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).send({ error: 'Invalid credentials' });
  }

  return res.status(200).send({ token: createToken(username) });
});

router.get('/api/verify-token', (req, res) => {
  const decoded = verifyToken(getTokenFromRequest(req));
  if (!decoded) return res.status(401).send({ valid: false });
  return res.status(200).send({ valid: true, user: decoded.sub, exp: decoded.exp });
});

module.exports = router;
