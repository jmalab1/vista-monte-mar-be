const request = require('supertest');
const { createApp } = require('../helpers/testAppFactory');

describe('inventory + checklist routes auth', () => {
  it('keeps inventory and checklist endpoints auth-protected', async () => {
    const app = createApp();

    const requests = [
      request(app).get('/api/inventory-listing'),
      request(app).post('/api/update-inventory-listing').send({}),
      request(app).get('/api/get-inventory'),
      request(app).post('/api/save-inventory').send({}),
      request(app).get('/api/checklist-listing'),
      request(app).post('/api/update-checklist-listing').send({}),
      request(app).get('/api/get-checklist'),
      request(app).post('/api/save-checklist').send({}),
    ];

    const responses = await Promise.all(requests);

    responses.forEach((res) => {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });
  });
});
