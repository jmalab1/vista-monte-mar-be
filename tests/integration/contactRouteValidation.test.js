const request = require('supertest');
const rateLimit = require('express-rate-limit');
const { dbPool } = require('../../src/services/database');
const { createToken } = require('../../src/lib/token');
const { createApp } = require('../helpers/testAppFactory');

describe('contact route validation and response semantics', () => {
  beforeEach(() => {
    dbPool.query = vi.fn();
  });

  function createTestApp(overrides = {}) {
    const contactRouteOverrides = {
      emailLimiter: (_req, _res, next) => next(),
      createSubmission: async () => 123,
      sendContactEmail: async () => ({ messageId: 'mock-1' }),
      markEmailSent: async () => {},
      markEmailFailed: async () => {},
      hasSmtpConfig: false,
      ...overrides,
    };

    return createApp({ contactRouteOverrides });
  }

  it('keeps contact email history auth-protected', async () => {
    const app = createTestApp();

    const res = await request(app).get('/api/contact-email-history');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns contact email history with paginated response shape', async () => {
    dbPool.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '42',
            firstname: 'Jane',
            lastname: 'Doe',
            email: 'jane@example.com',
            phone_number: '555-111-2222',
            comment: 'Hello there',
            email_sent: true,
            email_error: null,
            created_at: '2026-04-28T12:00:00.000Z',
          },
        ],
      });

    const app = createTestApp();
    const token = createToken('admin');
    const res = await request(app)
      .get('/api/contact-email-history?page=1&pageSize=10&email=jane')
      .set('x-access-token', token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      records: [
        {
          id: '42',
          firstname: 'Jane',
          lastname: 'Doe',
          email: 'jane@example.com',
          phone_number: '555-111-2222',
          comment: 'Hello there',
          emailSent: true,
          emailError: null,
          createdAt: '2026-04-28T12:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      limit: 10,
      totalPages: 1,
    });
  });

  it('exports contact email history as csv', async () => {
    dbPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: '42',
          firstname: 'Jane',
          lastname: 'Doe',
          email: 'jane@example.com',
          phone_number: '555-111-2222',
          comment: 'Hello, "there"',
          email_sent: true,
          email_error: null,
          created_at: '2026-04-28T12:00:00.000Z',
        },
      ],
    });

    const app = createTestApp();
    const token = createToken('admin');
    const res = await request(app)
      .get('/api/contact-email-history/export.csv?email=jane')
      .set('x-access-token', token);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('createdAt,firstname,lastname,email,phone_number,comment,emailSent,emailError');
    expect(res.text).toContain('2026-04-28T12:00:00.000Z,Jane,Doe,jane@example.com,555-111-2222,"Hello, ""there""",true,');
  });

  it('returns 400 when required fields are missing', async () => {
    const app = createTestApp();

    const res = await request(app).post('/api/send-email').send({ firstname: 'A' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Missing required fields. Required: firstname, lastname, email, comment.',
    });
  });

  it('returns 200 with local mock mode message when SMTP is not configured', async () => {
    const app = createTestApp();

    const res = await request(app).post('/api/send-email').send({
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
      phone_number: '555-111-2222',
      comment: 'Hello there',
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Submission saved (email running in local mock mode).');
    expect(res.body.submissionId).toBe(123);
    expect(res.body.info).toEqual({ messageId: 'mock-1' });
  });

  it('returns 200 with SMTP success message when SMTP is configured', async () => {
    const app = createTestApp({ hasSmtpConfig: true });

    const res = await request(app).post('/api/send-email').send({
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
      phone_number: '555-111-2222',
      comment: 'Hello there',
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Email sent successfully and submission saved.');
  });

  it('returns 500 when submission save fails', async () => {
    const app = createTestApp({
      createSubmission: async () => {
        throw new Error('db failed');
      },
    });

    const res = await request(app).post('/api/send-email').send({
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
      comment: 'Hello there',
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Unable to save form submission.' });
  });

  it('returns 502 when email send fails after save', async () => {
    const app = createTestApp({
      sendContactEmail: async () => {
        throw new Error('smtp failed');
      },
    });

    const res = await request(app).post('/api/send-email').send({
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
      comment: 'Hello there',
    });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Submission was saved, but sending email failed.');
    expect(res.body.submissionId).toBe(123);
    expect(res.body.details).toContain('smtp failed');
  });

  it('enforces 3 requests per 15 minutes limit per ip', async () => {
    const app = createTestApp({
      emailLimiter: rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 3,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: 'The limit to sending a message has been reached. Please try again later.',
      }),
    });

    const payload = {
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
      comment: 'Hello there',
    };

    await request(app).post('/api/send-email').send(payload);
    await request(app).post('/api/send-email').send(payload);
    await request(app).post('/api/send-email').send(payload);
    const res = await request(app).post('/api/send-email').send(payload);

    expect(res.status).toBe(429);
    expect((res.body && res.body.message) || res.text).toContain(
      'The limit to sending a message has been reached. Please try again later.'
    );
  });
});
