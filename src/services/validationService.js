const { isPlainObject } = require('./kvService');

function invalid(message, path = '$') {
  return { valid: false, errors: [{ message, path }] };
}

function valid() {
  return { valid: true, errors: [] };
}

function validateInventoryListing(payload) {
  if (!isPlainObject(payload)) return invalid('Inventory listing must be an object');
  for (const [sectionKey, section] of Object.entries(payload)) {
    if (!isPlainObject(section)) return invalid('Section must be an object', `$.${sectionKey}`);
    if (typeof section.name !== 'string' || !section.name.trim()) {
      return invalid('Section name required', `$.${sectionKey}.name`);
    }
    if (!isPlainObject(section.fields)) {
      return invalid('Section fields must be an object', `$.${sectionKey}.fields`);
    }
    for (const [fieldKey, field] of Object.entries(section.fields)) {
      if (!isPlainObject(field)) return invalid('Field must be an object', `$.${sectionKey}.fields.${fieldKey}`);
      if (!['number', 'textarea', 'toggle'].includes(String(field.type || ''))) {
        return invalid('Field type must be number|textarea|toggle', `$.${sectionKey}.fields.${fieldKey}.type`);
      }
      if (typeof field.name !== 'string' || !field.name.trim()) {
        return invalid('Field name required', `$.${sectionKey}.fields.${fieldKey}.name`);
      }
    }
  }
  return valid();
}

function validateChecklistListing(payload) {
  if (!isPlainObject(payload)) return invalid('Checklist listing must be an object');
  return valid();
}

function validateInventoryData(payload, listing) {
  if (!isPlainObject(payload)) return invalid('Inventory payload must be an object');
  if (!isPlainObject(listing)) return invalid('Inventory listing unavailable');

  for (const [sectionKey, section] of Object.entries(listing)) {
    const sectionFields = isPlainObject(section.fields) ? section.fields : {};
    const sectionData = payload[sectionKey];
    if (!isPlainObject(sectionData)) return invalid('Inventory section missing', `$.${sectionKey}`);
    for (const [fieldKey, field] of Object.entries(sectionFields)) {
      const value = sectionData[fieldKey];
      const type = field.type;
      if (type === 'toggle' && typeof value !== 'boolean') {
        return invalid('Toggle field must be boolean', `$.${sectionKey}.${fieldKey}`);
      }
      if ((type === 'number' || type === 'textarea') && typeof value !== 'string') {
        return invalid('Field must be string value', `$.${sectionKey}.${fieldKey}`);
      }
    }
  }
  return valid();
}

function validateChecklistData(payload, listing) {
  if (!isPlainObject(payload)) return invalid('Checklist payload must be an object');
  if (!isPlainObject(listing)) return invalid('Checklist listing unavailable');
  return valid();
}

module.exports = {
  validateInventoryListing,
  validateChecklistListing,
  validateInventoryData,
  validateChecklistData,
};

