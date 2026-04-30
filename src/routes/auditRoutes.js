const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getAuditEvents } = require('../services/auditService');

const router = express.Router();

router.get('/api/audit-events', requireAuth, async (req, res) => {
  try {
    const payload = await getAuditEvents({
      page: req.query.page,
      pageSize: req.query.pageSize ?? req.query.limit,
      action: req.query.action,
      actor: req.query.actor,
      from: req.query.from,
      to: req.query.to,
    });
    return res.status(200).send(payload);
  } catch (_error) {
    return res.status(500).send({ error: 'Unable to load audit events.' });
  }
});

module.exports = router;
