const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  DEFAULT_INVENTORY_LISTING,
  getInventoryDefaults,
  getJsonValue,
  isPlainObject,
  setJsonValue,
} = require('../services/kvService');

const router = express.Router();

router.get('/api/inventory-listing', requireAuth, async (_req, res) => {
  try {
    const listing = await getJsonValue('inventory_listing', DEFAULT_INVENTORY_LISTING);
    return res.status(200).send(listing);
  } catch (error) {
    return res.status(500).send({ error: 'Unable to load inventory listing.' });
  }
});

router.post('/api/update-inventory-listing', requireAuth, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: 'Inventory listing must be a JSON object.' });
  }

  try {
    await setJsonValue('inventory_listing', req.body);
    const currentData = await getJsonValue('inventory_data', {});
    const merged = { ...getInventoryDefaults(req.body), ...currentData };
    await setJsonValue('inventory_data', merged);
    return res.status(200).send({ updated: true });
  } catch (error) {
    return res.status(500).send({ error: 'Unable to update inventory listing.' });
  }
});

router.get('/api/get-inventory', requireAuth, async (_req, res) => {
  try {
    const listing = await getJsonValue('inventory_listing', DEFAULT_INVENTORY_LISTING);
    const fallback = getInventoryDefaults(listing);
    const data = await getJsonValue('inventory_data', fallback);
    return res.status(200).send(data);
  } catch (error) {
    return res.status(500).send({ error: 'Unable to load inventory data.' });
  }
});

router.post('/api/save-inventory', requireAuth, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: 'Inventory payload must be a JSON object.' });
  }

  try {
    await setJsonValue('inventory_data', req.body);
    return res.status(200).send({ saved: true });
  } catch (error) {
    return res.status(500).send({ error: 'Unable to save inventory data.' });
  }
});

module.exports = router;
