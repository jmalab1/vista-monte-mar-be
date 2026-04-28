const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getVisitorHistory } = require('../services/visitorService');

const router = express.Router();

router.get('/api/visitor-history', requireAuth, async (_req, res) => {
  try {
    const rows = await getVisitorHistory();
    return res.status(200).send(rows);
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
