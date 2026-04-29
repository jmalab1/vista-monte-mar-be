const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getVisitorHistoryPage } = require('../services/visitorService');

const router = express.Router();

router.get('/api/visitor-history', requireAuth, async (req, res) => {
  try {
    const page = req.query.page;
    const pageSize = req.query.pageSize;
    const period = req.query.period;
    const payload = await getVisitorHistoryPage({ page, pageSize, period });
    return res.status(200).send(payload);
  } catch (error) {
    console.error('Failed to load visitor history:', error);
    return res.status(500).send({ error: 'Unable to load visitor history.' });
  }
});

router.post('/api/track-visitor', (_req, res) => {
  return res.status(410).send({
    message: 'Deprecated: tracking is now server-side and stored in Postgres.',
  });
});

module.exports = router;
