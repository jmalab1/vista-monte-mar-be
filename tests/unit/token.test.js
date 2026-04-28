const { createToken, verifyToken } = require('../../src/lib/token');

describe('token', () => {
  it('creates and verifies token', () => {
    const token = createToken('admin');
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe('admin');
  });
});
