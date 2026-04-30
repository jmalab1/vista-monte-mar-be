const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  DEFAULT_CHECKLIST_LISTING,
  getChecklistDefaults,
  getJsonValue,
  isPlainObject,
  setJsonValue,
} = require('../services/kvService');
const { validateChecklistListing, validateChecklistData } = require('../services/validationService');
const { saveVersion } = require('../services/versionService');
const { logAuditEvent } = require('../services/auditService');
const { getClientIp } = require('../services/visitorService');

const router = express.Router();
const CHECKLIST_LISTING_DRAFT_KEY = 'checklist_listing_draft';
const CHECKLIST_LISTING_PUBLISHED_KEY = 'checklist_listing_published';
const CHECKLIST_DATA_DRAFT_KEY = 'checklist_data_draft';
const CHECKLIST_DATA_PUBLISHED_KEY = 'checklist_data_published';

router.get('/api/checklist-listing', requireAuth, async (_req, res) => {
  try {
    const listing = await getJsonValue(CHECKLIST_LISTING_DRAFT_KEY, null);
    if (listing) {
      return res.status(200).send(listing);
    }
    const legacy = await getJsonValue('checklist_listing', DEFAULT_CHECKLIST_LISTING);
    const defaults = getChecklistDefaults(legacy);
    await setJsonValue(CHECKLIST_LISTING_DRAFT_KEY, legacy);
    await setJsonValue(CHECKLIST_LISTING_PUBLISHED_KEY, legacy);
    await setJsonValue(CHECKLIST_DATA_DRAFT_KEY, await getJsonValue('checklist_data', defaults));
    await setJsonValue(CHECKLIST_DATA_PUBLISHED_KEY, await getJsonValue('checklist_data', defaults));
    return res.status(200).send(legacy);
  } catch (error) {
    return res.status(500).send({ error: 'Unable to load checklist listing.' });
  }
});

router.post('/api/update-checklist-listing', requireAuth, async (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).send({ error: 'Checklist listing must be a JSON object.' });
  }
  const validation = validateChecklistListing(req.body);
  if (!validation.valid) {
    return res.status(400).send({ error: 'Validation failed.', details: validation.errors });
  }

  try {
    const actor = String(req.auth?.sub || 'admin');
    const ip = getClientIp(req);
    const before = await getJsonValue(CHECKLIST_LISTING_DRAFT_KEY, DEFAULT_CHECKLIST_LISTING);
    await setJsonValue(CHECKLIST_LISTING_DRAFT_KEY, req.body);
    const currentData = await getJsonValue(CHECKLIST_DATA_DRAFT_KEY, {});
    const merged = { ...getChecklistDefaults(req.body), ...currentData };
    await setJsonValue(CHECKLIST_DATA_DRAFT_KEY, merged);
    await saveVersion({
      domain: 'checklist_listing_draft',
      key: CHECKLIST_LISTING_DRAFT_KEY,
      actor,
      beforeValue: before,
      afterValue: req.body,
      metadata: { route: '/api/update-checklist-listing' },
    });
    await logAuditEvent({
      actor,
      action: 'checklist_listing_updated',
      target: CHECKLIST_LISTING_DRAFT_KEY,
      metadata: { mergedDefaults: true },
      ip,
    });
    return res.status(200).send({ updated: true });
  } catch (error) {
    return res.status(500).send({ error: 'Unable to update checklist listing.' });
  }
});

router.get('/api/get-checklist', requireAuth, async (_req, res) => {
  try {
    const listing = await getJsonValue(CHECKLIST_LISTING_PUBLISHED_KEY, DEFAULT_CHECKLIST_LISTING);
    const fallback = getChecklistDefaults(listing);
    const data = await getJsonValue(CHECKLIST_DATA_PUBLISHED_KEY, fallback);
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
    const listing = await getJsonValue(CHECKLIST_LISTING_PUBLISHED_KEY, DEFAULT_CHECKLIST_LISTING);
    const validation = validateChecklistData(req.body, listing);
    if (!validation.valid) {
      return res.status(400).send({ error: 'Validation failed.', details: validation.errors });
    }
    const actor = String(req.auth?.sub || 'admin');
    const ip = getClientIp(req);
    const before = await getJsonValue(CHECKLIST_DATA_PUBLISHED_KEY, getChecklistDefaults(listing));
    await setJsonValue(CHECKLIST_DATA_PUBLISHED_KEY, req.body);
    await saveVersion({
      domain: 'checklist_data_published',
      key: CHECKLIST_DATA_PUBLISHED_KEY,
      actor,
      beforeValue: before,
      afterValue: req.body,
      metadata: { route: '/api/save-checklist' },
    });
    await logAuditEvent({
      actor,
      action: 'checklist_saved',
      target: CHECKLIST_DATA_PUBLISHED_KEY,
      ip,
    });
    return res.status(200).send({ saved: true });
  } catch (error) {
    return res.status(500).send({ error: 'Unable to save checklist data.' });
  }
});

router.post('/api/publish/checklist', requireAuth, async (req, res) => {
  try {
    const actor = String(req.auth?.sub || 'admin');
    const ip = getClientIp(req);
    const draftListing = await getJsonValue(CHECKLIST_LISTING_DRAFT_KEY, DEFAULT_CHECKLIST_LISTING);
    const draftData = await getJsonValue(
      CHECKLIST_DATA_DRAFT_KEY,
      getChecklistDefaults(draftListing)
    );
    const listingValidation = validateChecklistListing(draftListing);
    if (!listingValidation.valid) {
      return res.status(400).send({ error: 'Draft listing invalid.', details: listingValidation.errors });
    }
    const dataValidation = validateChecklistData(draftData, draftListing);
    if (!dataValidation.valid) {
      return res.status(400).send({ error: 'Draft data invalid.', details: dataValidation.errors });
    }
    const beforeListing = await getJsonValue(
      CHECKLIST_LISTING_PUBLISHED_KEY,
      DEFAULT_CHECKLIST_LISTING
    );
    const beforeData = await getJsonValue(
      CHECKLIST_DATA_PUBLISHED_KEY,
      getChecklistDefaults(beforeListing)
    );
    await setJsonValue(CHECKLIST_LISTING_PUBLISHED_KEY, draftListing);
    await setJsonValue(CHECKLIST_DATA_PUBLISHED_KEY, draftData);
    await saveVersion({
      domain: 'checklist_publish',
      key: CHECKLIST_LISTING_PUBLISHED_KEY,
      actor,
      beforeValue: beforeListing,
      afterValue: draftListing,
      metadata: { route: '/api/publish/checklist' },
    });
    await saveVersion({
      domain: 'checklist_publish',
      key: CHECKLIST_DATA_PUBLISHED_KEY,
      actor,
      beforeValue: beforeData,
      afterValue: draftData,
      metadata: { route: '/api/publish/checklist' },
    });
    await logAuditEvent({ actor, action: 'checklist_published', target: 'checklist', ip });
    return res.status(200).send({ published: true });
  } catch (_error) {
    return res.status(500).send({ error: 'Unable to publish checklist.' });
  }
});

router.get('/api/checklist-analytics', requireAuth, async (req, res) => {
  try {
    const period = req.query?.period === 'month' || req.query?.period === 'year' ? req.query.period : 'day';
    const listing = await getJsonValue(CHECKLIST_LISTING_PUBLISHED_KEY, DEFAULT_CHECKLIST_LISTING);
    const data = await getJsonValue(CHECKLIST_DATA_PUBLISHED_KEY, getChecklistDefaults(listing));
    const keys = Object.keys(getChecklistDefaults(listing));
    const completed = keys.filter((key) => Boolean(data[key])).length;
    const total = keys.length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    const sections = Object.entries(listing || {}).map(([key, value]) => {
      const checked = Boolean(data[key]);
      return {
        key,
        label: value?.name || key,
        completed: checked ? 1 : 0,
        total: 1,
        completionRate: checked ? 100 : 0,
      };
    });

    return res.status(200).send({
      period,
      totalItems: total,
      completedItems: completed,
      completionRate,
      overdueItems: total - completed,
      sections,
    });
  } catch (_error) {
    return res.status(500).send({ error: 'Unable to load checklist analytics.' });
  }
});

module.exports = router;
