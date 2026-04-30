const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listVersions, restoreVersion } = require('../services/versionService');
const { logAuditEvent } = require('../services/auditService');
const { getClientIp } = require('../services/visitorService');

const router = express.Router();

router.get('/api/versions', requireAuth, async (req, res) => {
  try {
    const payload = await listVersions({
      domain: req.query.domain,
      page: req.query.page,
      pageSize: req.query.pageSize ?? req.query.limit,
    });
    return res.status(200).send(payload);
  } catch (_error) {
    return res.status(500).send({ error: 'Unable to load versions.' });
  }
});

router.post('/api/versions/:id/restore', requireAuth, async (req, res) => {
  try {
    const restoreResult = await restoreVersion(req.params.id);
    if (!restoreResult.restored) {
      return res.status(404).send({ error: 'Version not found.' });
    }
    await logAuditEvent({
      actor: String(req.auth?.sub || 'admin'),
      action: 'version_restored',
      target: restoreResult.key,
      metadata: { versionId: req.params.id },
      ip: getClientIp(req),
    });
    return res.status(200).send({ restored: true, key: restoreResult.key });
  } catch (_error) {
    return res.status(500).send({ error: 'Unable to restore version.' });
  }
});

module.exports = router;
