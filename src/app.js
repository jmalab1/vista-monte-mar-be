const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const authRoutes = require('./routes/authRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const checklistRoutes = require('./routes/checklistRoutes');
const { createContactRouter } = require('./routes/contactRoutes');
const { visitorTracking } = require('./middleware/visitorTracking');

function createApp(options = {}) {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());
  app.use(morgan('combined'));
  app.use(authRoutes);
  app.use('/api', visitorTracking);
  app.use(visitorRoutes);
  app.use(inventoryRoutes);
  app.use(checklistRoutes);
  app.use(createContactRouter(options.contactRouteOverrides));
  return app;
}

module.exports = { createApp };
