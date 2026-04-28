const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  DEFAULT_CHECKLIST_LISTING,
  getChecklistDefaults,
  getJsonValue,
  isPlainObject,
  setJsonValue,
} = require('../services/kvService');

const router = express.Router();

router.get('/api/checklist-listing', requireAuth, async (_req, res) => {
  try {
    const listing = await getJsonValue('checklist_listing', DEFAULT_CHECKLIST_LISTING);
    return res.status(200).send(listing);
  } catch (error) {
    return res.status(500).send({ error: 'Unable to load checklist listing.' });
  }
});

router.post('/api/update-checklist-listing', requireAuth, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: 'Checklist listing must be a JSON object.' });
  }

  try {
    await setJsonValue('checklist_listing', req.body);
    const currentData = await getJsonValue('checklist_data', {});
    const merged = { ...getChecklistDefaults(req.body), ...currentData };
    await setJsonValue('checklist_data', merged);
    return res.status(200).send({ updated: true });
  } catch (error) {
    return res.status(500).send({ error: 'Unable to update checklist listing.' });
  }
});

router.get('/api/get-checklist', requireAuth, async (_req, res) => {
  try {
    const listing = await getJsonValue('checklist_listing', DEFAULT_CHECKLIST_LISTING);
    const fallback = getChecklistDefaults(listing);
    const data = await getJsonValue('checklist_data', fallback);
    return res.status(200).send(data);
  } catch (error) {
    return res.status(500).send({ error: 'Unable to load checklist data.' });
  }
});

router.post('/api/save-checklist', requireAuth, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: 'Checklist payload must be a JSON object.' });
  }

  try {
    await setJsonValue('checklist_data', req.body);
    return res.status(200).send({ saved: true });
  } catch (error) {
    return res.status(500).send({ error: 'Unable to save checklist data.' });
  }
});

module.exports = router;
