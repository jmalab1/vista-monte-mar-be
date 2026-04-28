const { dbPool } = require('./database');

const DEFAULT_INVENTORY_LISTING = {
  kitchen: {
    name: 'Kitchen',
    fields: {
      paper_towels: { type: 'number', name: 'Paper Towels' },
      trash_bags: { type: 'number', name: 'Trash Bags' },
      notes: { type: 'textarea', name: 'Notes' },
    },
  },
  bathrooms: {
    name: 'Bathrooms',
    fields: {
      toilet_paper: { type: 'number', name: 'Toilet Paper' },
      hand_soap: { type: 'number', name: 'Hand Soap' },
      towels_ok: { type: 'toggle', name: 'Towels Restocked' },
    },
  },
};

const DEFAULT_CHECKLIST_LISTING = {
  lights: { name: 'Turn off all lights', fields: {} },
  doors: { name: 'Lock all doors', fields: {} },
  ac: { name: 'Set AC to checkout setting', fields: {} },
};

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getInventoryDefaults(listing) {
  const defaults = {};
  Object.entries(listing || {}).forEach(([parentKey, section]) => {
    const fields = isPlainObject(section?.fields) ? section.fields : {};
    defaults[parentKey] = {};
    Object.entries(fields).forEach(([fieldKey, field]) => {
      switch (field?.type) {
        case 'number':
          defaults[parentKey][fieldKey] = '0';
          break;
        case 'toggle':
          defaults[parentKey][fieldKey] = false;
          break;
        default:
          defaults[parentKey][fieldKey] = '';
          break;
      }
    });
  });
  return defaults;
}

function getChecklistDefaults(listing) {
  const defaults = {};
  Object.keys(listing || {}).forEach((key) => {
    defaults[key] = false;
  });
  return defaults;
}

async function getJsonValue(key, fallbackValue) {
  const result = await dbPool.query('SELECT value FROM app_kv WHERE key = $1', [key]);
  if (!result.rows.length) {
    return fallbackValue;
  }
  return result.rows[0].value;
}

async function setJsonValue(key, value) {
  await dbPool.query(
    `
      INSERT INTO app_kv (key, value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, JSON.stringify(value)]
  );
}

async function setJsonDefault(key, value) {
  await dbPool.query(
    `
      INSERT INTO app_kv (key, value)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (key) DO NOTHING
    `,
    [key, JSON.stringify(value)]
  );
}

module.exports = {
  DEFAULT_INVENTORY_LISTING,
  DEFAULT_CHECKLIST_LISTING,
  isPlainObject,
  getInventoryDefaults,
  getChecklistDefaults,
  getJsonValue,
  setJsonValue,
  setJsonDefault,
};
