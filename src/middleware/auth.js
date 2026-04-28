const { verifyToken } = require('../lib/token');

function getTokenFromRequest(req) {
  const headerToken = req.headers['x-access-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }

  return '';
}

function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).send({ error: 'Unauthorized' });
  req.auth = decoded;
  return next();
}

module.exports = { getTokenFromRequest, requireAuth };
