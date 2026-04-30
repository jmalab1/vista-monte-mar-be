const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getVisitorHistoryPage, getVisitorHistoryCsvRows } = require('../services/visitorService');

const router = express.Router();

router.get('/api/visitor-history', requireAuth, async (req, res) => {
  try {
    const page = req.query.page;
    const pageSize = req.query.pageSize;
    const period = req.query.period;
    const payload = await getVisitorHistoryPage({
      page,
      pageSize,
      period,
      path: req.query.path,
      referrer: req.query.referrer,
      ip: req.query.ip,
      from: req.query.from,
      to: req.query.to,
      uaContains: req.query.uaContains,
    });
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

router.get('/api/visitor-history/export.csv', requireAuth, async (req, res) => {
  try {
    const rows = await getVisitorHistoryCsvRows({
      path: req.query.path,
      referrer: req.query.referrer,
      ip: req.query.ip,
      from: req.query.from,
      to: req.query.to,
      uaContains: req.query.uaContains,
    });
    const header = 'createdAt,path,referrer,ip,userAgent';
    const escapeCsv = (value) => {
      const text = String(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };
    const lines = rows.map((row) =>
      [
        escapeCsv(row.createdAt),
        escapeCsv(row.path),
        escapeCsv(row.referrer),
        escapeCsv(row.ip),
        escapeCsv(row.userAgent),
      ].join(',')
    );
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="visitor-history.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).send({ error: 'Unable to export visitor history.' });
  }
});

module.exports = router;
