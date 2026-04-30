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

module.exports = router;
