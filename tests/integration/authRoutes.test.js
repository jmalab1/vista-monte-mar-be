const request = require('supertest');
const { createApp } = require('../helpers/testAppFactory');

describe('auth routes', () => {
  it('returns token with valid credentials', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('returns 401 with invalid credentials', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('verifies valid token and refreshes expiration', async () => {
    const app = createApp();
    const loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });

    const res = await request(app)
      .get('/api/verify-token')
      .set('x-access-token', loginRes.body.token);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.user).toBe('admin');
    expect(typeof res.body.exp).toBe('number');
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects missing token on verification', async () => {
    const app = createApp();
    const res = await request(app).get('/api/verify-token');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ valid: false });
  });

  it('rejects revoked tokens on verification instead of refreshing them', async () => {
    const app = createApp();
    const loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });

    await request(app)
      .post('/api/logout-all')
      .set('x-access-token', loginRes.body.token)
      .expect(200);

    const res = await request(app)
      .get('/api/verify-token')
      .set('x-access-token', loginRes.body.token);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ valid: false });
  });

  it('does not allow rotating x-forwarded-for to bypass login lockout', async () => {
    const app = createApp();
    const username = `lockout-${Date.now()}`;

    for (let i = 0; i < 8; i += 1) {
      await request(app)
        .post('/api/login')
        .set('x-forwarded-for', `198.51.100.${i}`)
        .send({ username, password: 'wrong' })
        .expect(401);
    }

    const res = await request(app)
      .post('/api/login')
      .set('x-forwarded-for', '198.51.100.99')
      .send({ username, password: 'wrong' });

    expect(res.status).toBe(429);
  });
});
