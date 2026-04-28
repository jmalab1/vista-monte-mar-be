const { Pool } = require('pg');
const env = require('../config/env');

const dbPool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

module.exports = { dbPool };
