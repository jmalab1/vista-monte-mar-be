const { dbPool } = require('../../src/services/database');
const {
  normalizeTrackedPath,
  deriveTrackedPathFromRequest,
  getClientIp,
  saveVisitorEvent,
  getVisitorHistory,
} = require('../../src/services/visitorService');

describe('visitorService', () => {
  beforeEach(() => {
    dbPool.query = vi.fn();
  });

  it('normalizes tracked paths', () => {
    expect(normalizeTrackedPath('')).toBe('/');
    expect(normalizeTrackedPath('abc')).toBe('/abc');
    expect(normalizeTrackedPath('/abc')).toBe('/abc');
  });

  it('derives tracked path from x-page-path before referrer', () => {
    const req = {
      headers: {
        'x-page-path': 'reservations',
        referer: 'https://example.com/ignored',
      },
      body: {},
    };

    expect(deriveTrackedPathFromRequest(req)).toBe('/reservations');
  });

  it('derives tracked path from referrer path when explicit path is absent', () => {
    const req = {
      headers: { referer: 'https://example.com/visit/here?x=1' },
      body: {},
    };

    expect(deriveTrackedPathFromRequest(req)).toBe('/visit/here');
  });

  it('returns slash when referrer is invalid', () => {
    const req = {
      headers: { referer: 'not-a-url' },
      body: {},
    };

    expect(deriveTrackedPathFromRequest(req)).toBe('/');
  });

  it('gets client ip from x-forwarded-for first value', () => {
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4, 9.8.7.6' },
      ip: '5.5.5.5',
    };

    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('saves visitor events with normalized path and metadata', async () => {
    dbPool.query.mockResolvedValueOnce({ rows: [{ id: 42 }] });

    const req = {
      headers: {
        referer: 'https://example.com/path',
        'user-agent': 'agent',
        'x-forwarded-for': '7.7.7.7',
      },
      body: {},
      ip: '8.8.8.8',
    };

    const id = await saveVisitorEvent(req, 'page');

    expect(id).toBe(42);
    expect(dbPool.query).toHaveBeenCalledTimes(1);
    expect(dbPool.query.mock.calls[0][1]).toEqual(['/page', 'https://example.com/path', 'agent', '7.7.7.7']);
  });

  it('maps visitor history response to existing shape', async () => {
    dbPool.query.mockResolvedValueOnce({
      rows: [
        {
          created_at: '2026-04-28T12:00:00.000Z',
          path: '/x',
          referrer: 'r',
          user_agent: 'ua',
          ip: '1.1.1.1',
        },
      ],
    });

    const rows = await getVisitorHistory();

    expect(rows).toEqual([
      {
        createdAt: '2026-04-28T12:00:00.000Z',
        path: '/x',
        referrer: 'r',
        userAgent: 'ua',
        ip: '1.1.1.1',
      },
    ]);
  });
});
