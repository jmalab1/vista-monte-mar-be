const { saveVisitorEvent } = require('../services/visitorService');

const excludedPaths = new Set([
  '/login',
  '/verify-token',
  '/track-visitor',
  '/visitor-history',
]);

async function visitorTracking(req, _res, next) {
  const method = String(req.method || '').toUpperCase();
  const routePath = String(req.path || '');

  if (method !== 'GET' || excludedPaths.has(routePath)) {
    return next();
  }

  try {
    await saveVisitorEvent(req);
  } catch (error) {
    console.error('Failed to auto-track visitor:', error);
  }

  return next();
}

module.exports = {
  visitorTracking,
  excludedPaths,
};
