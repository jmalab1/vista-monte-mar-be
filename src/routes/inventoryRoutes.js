const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  DEFAULT_INVENTORY_LISTING,
  getInventoryDefaults,
  getJsonValue,
  isPlainObject,
  setJsonValue,
} = require('../services/kvService');
const { validateInventoryListing, validateInventoryData } = require('../services/validationService');
const { saveVersion } = require('../services/versionService');
const { logAuditEvent } = require('../services/auditService');
const { getClientIp } = require('../services/visitorService');

const router = express.Router();
const INVENTORY_LISTING_DRAFT_KEY = 'inventory_listing_draft';
const INVENTORY_LISTING_PUBLISHED_KEY = 'inventory_listing_published';
const INVENTORY_DATA_DRAFT_KEY = 'inventory_data_draft';
const INVENTORY_DATA_PUBLISHED_KEY = 'inventory_data_published';

router.get('/api/inventory-listing', requireAuth, async (_req, res) => {
  try {
    const listing = await getJsonValue(INVENTORY_LISTING_DRAFT_KEY, null);
    if (listing) {
      return res.status(200).send(listing);
    }
    const legacy = await getJsonValue('inventory_listing', DEFAULT_INVENTORY_LISTING);
    await setJsonValue(INVENTORY_LISTING_DRAFT_KEY, legacy);
    await setJsonValue(INVENTORY_LISTING_PUBLISHED_KEY, legacy);
    const defaults = getInventoryDefaults(legacy);
    await setJsonValue(INVENTORY_DATA_DRAFT_KEY, await getJsonValue('inventory_data', defaults));
    await setJsonValue(INVENTORY_DATA_PUBLISHED_KEY, await getJsonValue('inventory_data', defaults));
    return res.status(200).send(legacy);
  } catch (error) {
    return res.status(500).send({ error: 'Unable to load inventory listing.' });
  }
});

router.post('/api/update-inventory-listing', requireAuth, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: 'Inventory listing must be a JSON object.' });
  }
  const validation = validateInventoryListing(req.body);
  if (!validation.valid) {
    return res.status(400).send({ error: 'Validation failed.', details: validation.errors });
  }

  try {
    const actor = String(req.auth?.sub || 'admin');
    const ip = getClientIp(req);
    const before = await getJsonValue(INVENTORY_LISTING_DRAFT_KEY, DEFAULT_INVENTORY_LISTING);
    await setJsonValue(INVENTORY_LISTING_DRAFT_KEY, req.body);
    const currentData = await getJsonValue(INVENTORY_DATA_DRAFT_KEY, {});
    const merged = { ...getInventoryDefaults(req.body), ...currentData };
    await setJsonValue(INVENTORY_DATA_DRAFT_KEY, merged);
    await saveVersion({
      domain: 'inventory_listing_draft',
      key: INVENTORY_LISTING_DRAFT_KEY,
      actor,
      beforeValue: before,
      afterValue: req.body,
      metadata: { route: '/api/update-inventory-listing' },
    });
    await logAuditEvent({
      actor,
      action: 'inventory_listing_updated',
      target: INVENTORY_LISTING_DRAFT_KEY,
      metadata: { mergedDefaults: true },
      ip,
    });
    return res.status(200).send({ updated: true });
  } catch (error) {
    return res.status(500).send({ error: 'Unable to update inventory listing.' });
  }
});

router.get('/api/get-inventory', requireAuth, async (_req, res) => {
  try {
    const listing = await getJsonValue(INVENTORY_LISTING_PUBLISHED_KEY, DEFAULT_INVENTORY_LISTING);
    const fallback = getInventoryDefaults(listing);
    const data = await getJsonValue(INVENTORY_DATA_PUBLISHED_KEY, fallback);
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
    const listing = await getJsonValue(INVENTORY_LISTING_PUBLISHED_KEY, DEFAULT_INVENTORY_LISTING);
    const validation = validateInventoryData(req.body, listing);
    if (!validation.valid) {
      return res.status(400).send({ error: 'Validation failed.', details: validation.errors });
    }
    const actor = String(req.auth?.sub || 'admin');
    const ip = getClientIp(req);
    const before = await getJsonValue(INVENTORY_DATA_PUBLISHED_KEY, getInventoryDefaults(listing));
    await setJsonValue(INVENTORY_DATA_PUBLISHED_KEY, req.body);
    await saveVersion({
      domain: 'inventory_data_published',
      key: INVENTORY_DATA_PUBLISHED_KEY,
      actor,
      beforeValue: before,
      afterValue: req.body,
      metadata: { route: '/api/save-inventory' },
    });
    await logAuditEvent({
      actor,
      action: 'inventory_saved',
      target: INVENTORY_DATA_PUBLISHED_KEY,
      ip,
    });
    return res.status(200).send({ saved: true });
  } catch (error) {
    return res.status(500).send({ error: 'Unable to save inventory data.' });
  }
});

router.get('/api/inventory-alerts', requireAuth, async (_req, res) => {
  try {
    const listing = await getJsonValue(INVENTORY_LISTING_PUBLISHED_KEY, DEFAULT_INVENTORY_LISTING);
    const data = await getJsonValue(INVENTORY_DATA_PUBLISHED_KEY, getInventoryDefaults(listing));
    const alerts = [];

    Object.entries(listing || {}).forEach(([sectionKey, section]) => {
      const fields = section?.fields || {};
      Object.entries(fields).forEach(([fieldKey, field]) => {
        const min = Number(field?.min);
        if (!Number.isFinite(min)) return;
        const raw = data?.[sectionKey]?.[fieldKey];
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        if (value <= min) {
          alerts.push({
            sectionKey,
            sectionName: section?.name || sectionKey,
            fieldKey,
            fieldName: field?.name || fieldKey,
            value,
            min,
            unit: field?.unit || '',
            critical: Boolean(field?.critical),
          });
        }
      });
    });

    return res.status(200).send({
      total: alerts.length,
      critical: alerts.filter((item) => item.critical).length,
      alerts,
    });
  } catch (_error) {
    return res.status(500).send({ error: 'Unable to load inventory alerts.' });
  }
});

router.post('/api/publish/inventory', requireAuth, async (req, res) => {
  try {
    const actor = String(req.auth?.sub || 'admin');
    const ip = getClientIp(req);
    const draftListing = await getJsonValue(INVENTORY_LISTING_DRAFT_KEY, DEFAULT_INVENTORY_LISTING);
    const draftData = await getJsonValue(
      INVENTORY_DATA_DRAFT_KEY,
      getInventoryDefaults(draftListing)
    );

    const listingValidation = validateInventoryListing(draftListing);
    if (!listingValidation.valid) {
      return res.status(400).send({ error: 'Draft listing invalid.', details: listingValidation.errors });
    }
    const dataValidation = validateInventoryData(draftData, draftListing);
    if (!dataValidation.valid) {
      return res.status(400).send({ error: 'Draft data invalid.', details: dataValidation.errors });
    }

    const beforeListing = await getJsonValue(INVENTORY_LISTING_PUBLISHED_KEY, DEFAULT_INVENTORY_LISTING);
    const beforeData = await getJsonValue(
      INVENTORY_DATA_PUBLISHED_KEY,
      getInventoryDefaults(beforeListing)
    );
    await setJsonValue(INVENTORY_LISTING_PUBLISHED_KEY, draftListing);
    await setJsonValue(INVENTORY_DATA_PUBLISHED_KEY, draftData);
    await saveVersion({
      domain: 'inventory_publish',
      key: INVENTORY_LISTING_PUBLISHED_KEY,
      actor,
      beforeValue: beforeListing,
      afterValue: draftListing,
      metadata: { route: '/api/publish/inventory' },
    });
    await saveVersion({
      domain: 'inventory_publish',
      key: INVENTORY_DATA_PUBLISHED_KEY,
      actor,
      beforeValue: beforeData,
      afterValue: draftData,
      metadata: { route: '/api/publish/inventory' },
    });
    await logAuditEvent({ actor, action: 'inventory_published', target: 'inventory', ip });
    return res.status(200).send({ published: true });
  } catch (_error) {
    return res.status(500).send({ error: 'Unable to publish inventory.' });
  }
});

module.exports = router;
