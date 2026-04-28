const { createApp: createExpressApp } = require('../../src/app');

function createApp(options = {}) {
  return createExpressApp(options);
}

module.exports = { createApp };
