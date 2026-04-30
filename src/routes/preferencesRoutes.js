const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getJsonValue, setJsonValue } = require('../services/kvService');
const { logAuditEvent } = require('../services/auditService');
const { getClientIp } = require('../services/visitorService');

const router = express.Router();

const DEFAULT_PREFERENCES = {
  historyPageSize: 10,
  historyPeriod: 'day',
  darkMode: false,
};

function sanitizePreferences(input = {}) {
  const next = { ...DEFAULT_PREFERENCES };

  const pageSize = Number(input.historyPageSize);
  if (Number.isFinite(pageSize) && pageSize >= 1 && pageSize <= 100) {
    next.historyPageSize = Math.floor(pageSize);
  }

  if (input.historyPeriod === 'day' || input.historyPeriod === 'month' || input.historyPeriod === 'year') {
    next.historyPeriod = input.historyPeriod;
  }

  if (typeof input.darkMode === 'boolean') {
    next.darkMode = input.darkMode;
  }

  return next;
}

router.get('/api/admin-preferences', requireAuth, async (req, res) => {
  try {
    const userKey = String(req.auth?.sub || 'admin');
    const key = `admin_preferences:${userKey}`;
    const stored = await getJsonValue(key, DEFAULT_PREFERENCES);
    return res.status(200).send(sanitizePreferences(stored));
  } catch (error) {
    console.error('Failed to load admin preferences:', error);
    return res.status(500).send({ error: 'Unable to load admin preferences.' });
  }
});

router.put('/api/admin-preferences', requireAuth, async (req, res) => {
  try {
    const userKey = String(req.auth?.sub || 'admin');
    const key = `admin_preferences:${userKey}`;
    const current = await getJsonValue(key, DEFAULT_PREFERENCES);
    const merged = sanitizePreferences({ ...current, ...(req.body || {}) });
    await setJsonValue(key, merged);
    await logAuditEvent({
      actor: userKey,
      action: 'admin_preferences_updated',
      target: key,
      metadata: { updates: req.body || {} },
      ip: getClientIp(req),
    });
    return res.status(200).send(merged);
  } catch (error) {
    console.error('Failed to save admin preferences:', error);
    return res.status(500).send({ error: 'Unable to save admin preferences.' });
  }
});

module.exports = { preferencesRoutes: router, DEFAULT_PREFERENCES };
