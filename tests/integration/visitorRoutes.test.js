const request = require('supertest');

const { dbPool } = require('../../src/services/database');
const { createToken } = require('../../src/lib/token');
const { createApp } = require('../helpers/testAppFactory');

describe('visitor routes + tracking middleware', () => {
  beforeEach(() => {
    dbPool.query = vi.fn();
  });

  it('keeps legacy track-visitor deprecation behavior', async () => {
    const app = createApp();
    const res = await request(app).post('/api/track-visitor').send({});

    expect(res.status).toBe(410);
    expect(res.body).toEqual({
      message: 'Deprecated: tracking is now server-side and stored in Postgres.',
    });
  });

  it('keeps visitor history auth-protected', async () => {
    const app = createApp();
    const res = await request(app).get('/api/visitor-history');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns visitor history with existing response shape', async () => {
    dbPool.query.mockResolvedValueOnce({
      rows: [
        {
          created_at: '2026-04-28T12:00:00.000Z',
          path: '/a',
          referrer: 'https://example.com',
          user_agent: 'Mozilla',
          ip: '10.0.0.1',
        },
      ],
    });

    const app = createApp();
    const token = createToken('admin');
    const res = await request(app)
      .get('/api/visitor-history')
      .set('x-access-token', token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        createdAt: '2026-04-28T12:00:00.000Z',
        path: '/a',
        referrer: 'https://example.com',
        userAgent: 'Mozilla',
        ip: '10.0.0.1',
      },
    ]);
  });

  it('tracks GET requests server-side for non-excluded /api paths', async () => {
    dbPool.query.mockResolvedValue({ rows: [{ id: 123 }] });

    const app = createApp();
    await request(app).get('/api/non-existent-path');

    expect(dbPool.query).toHaveBeenCalledTimes(1);
    expect(dbPool.query.mock.calls[0][0]).toContain('INSERT INTO visitors');
  });
});
