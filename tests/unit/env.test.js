const env = require('../../src/config/env');

describe('env defaults', () => {
  it('has port and db defaults', () => {
    expect(env.PORT).toBe(8135);
    expect(env.DB_NAME).toBe('visitor_analytics');
  });
});
