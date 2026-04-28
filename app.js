const env = require('./src/config/env');
const { dbPool } = require('./src/services/database');
const { createApp } = require('./src/app');
const {
  DEFAULT_INVENTORY_LISTING,
  DEFAULT_CHECKLIST_LISTING,
  getInventoryDefaults,
  getChecklistDefaults,
  setJsonDefault,
} = require('./src/services/kvService');

const app = createApp();
const PORT = env.PORT;

async function initializeDatabase() {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS visitors (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      path TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      ip TEXT
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS form_submissions (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      firstname TEXT NOT NULL,
      lastname TEXT NOT NULL,
      email TEXT NOT NULL,
      phone_number TEXT,
      comment TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      ip TEXT,
      email_sent BOOLEAN NOT NULL DEFAULT FALSE,
      email_error TEXT
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await setJsonDefault('inventory_listing', DEFAULT_INVENTORY_LISTING);
  await setJsonDefault('checklist_listing', DEFAULT_CHECKLIST_LISTING);
  await setJsonDefault('inventory_data', getInventoryDefaults(DEFAULT_INVENTORY_LISTING));
  await setJsonDefault('checklist_data', getChecklistDefaults(DEFAULT_CHECKLIST_LISTING));
}

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
