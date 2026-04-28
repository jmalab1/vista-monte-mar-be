const request = require('supertest');
const rateLimit = require('express-rate-limit');
const { createApp } = require('../helpers/testAppFactory');

describe('contact route validation and response semantics', () => {
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
