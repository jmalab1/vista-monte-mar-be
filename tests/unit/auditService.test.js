const { dbPool } = require('../../src/services/database');
const { getAuditEvents } = require('../../src/services/auditService');

describe('auditService', () => {
  beforeEach(() => {
    dbPool.query = vi.fn();
  });

  it('applies all supported filters including target, ip, and metadataContains', async () => {
    dbPool.query
      // ensureAuditSchema
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      // total + rows
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            actor: 'admin',
            action: 'inventory_saved',
            target: 'inventory',
            metadata: { route: '/api/inventory' },
            ip: '10.0.0.1',
            created_at: '2026-04-30T12:00:00.000Z',
          },
        ],
      });

    const payload = await getAuditEvents({
      page: 2,
      pageSize: 10,
      action: 'inventory_saved',
      actor: 'admin',
      target: 'inventory',
      ip: '10.0.0.1',
      metadataContains: 'route',
      from: '2026-04-01',
      to: '2026-04-30',
    });

    const totalCall = dbPool.query.mock.calls[3];
    const rowsCall = dbPool.query.mock.calls[4];
    const totalSql = totalCall[0];
    const totalParams = totalCall[1];
    const rowsSql = rowsCall[0];
    const rowsParams = rowsCall[1];

    expect(totalSql).toContain('action = $1');
    expect(totalSql).toContain('actor = $2');
    expect(totalSql).toContain('target = $3');
    expect(totalSql).toContain('ip = $4');
    expect(totalSql).toContain('metadata::text ILIKE $5');
    expect(totalSql).toContain('created_at >= $6::timestamptz');
    expect(totalSql).toContain('created_at <= $7::timestamptz');
    expect(rowsSql).toContain('OFFSET $8');
    expect(rowsSql).toContain('LIMIT $9');

    expect(totalParams).toEqual([
      'inventory_saved',
      'admin',
      'inventory',
      '10.0.0.1',
      '%route%',
      '2026-04-01',
      '2026-04-30',
    ]);
    expect(rowsParams).toEqual([...totalParams, 10, 10]);

    expect(payload.total).toBe(1);
    expect(payload.totalPages).toBe(1);
    expect(payload.records[0]).toEqual({
      actor: 'admin',
      action: 'inventory_saved',
      target: 'inventory',
      metadata: { route: '/api/inventory' },
      ip: '10.0.0.1',
      createdAt: '2026-04-30T12:00:00.000Z',
    });
  });
});
