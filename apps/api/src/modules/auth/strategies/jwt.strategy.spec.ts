// Mock jwks-rsa before any imports to avoid ESM/CJS conflict with jose v6
vi.mock('jwks-rsa', () => ({
  passportJwtSecret: () => (_req: unknown, _rawJwtToken: unknown, done: Function) => {
    done(null, 'mock-secret');
  },
}));

vi.mock('passport-jwt', () => {
  class MockStrategy {
    constructor(_options: unknown, _verify: unknown) {}
  }
  return {
    ExtractJwt: {
      fromAuthHeaderAsBearerToken: () => () => 'mock-token',
    },
    Strategy: MockStrategy,
  };
});

import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = Object.create(JwtStrategy.prototype);
  });

  describe('validate()', () => {
    it('returns AuthenticatedUser from a payload with custom role claim', () => {
      const result = strategy.validate({
        sub: 'user-123',
        email: 'shebi@example.com',
        name: 'Shebi',
        role: 'ADMIN',
      });

      expect(result).toEqual({
        sub: 'user-123',
        email: 'shebi@example.com',
        name: 'Shebi',
        role: 'ADMIN',
      });
    });

    it('falls back to realm_access.roles when custom role claim is absent', () => {
      const result = strategy.validate({
        sub: 'user-456',
        email: 'alex@example.com',
        name: 'Alex Chen',
        realm_access: { roles: ['ARCHITECT', 'offline_access'] },
      });

      expect(result.role).toBe('ARCHITECT');
    });

    it('defaults to CONSULTANT when no role information is available', () => {
      const result = strategy.validate({
        sub: 'user-789',
        email: 'unknown@example.com',
        name: 'Unknown User',
      });

      expect(result.role).toBe('CONSULTANT');
    });

    it('uses preferred_username as name fallback when name is absent', () => {
      const result = strategy.validate({
        sub: 'user-abc',
        email: 'test@example.com',
        preferred_username: 'test.user',
        role: 'PM',
      });

      expect(result.name).toBe('test.user');
    });

    it('extracts only the required AuthenticatedUser fields', () => {
      const result = strategy.validate({
        sub: 'user-xyz',
        email: 'full@example.com',
        name: 'Full User',
        role: 'SALES',
        iss: 'https://keycloak/realms/test',
        aud: 'slack-thread-manager-web',
        exp: 9999999999,
        iat: 1000000000,
        extra_claim: 'should-not-appear',
      });

      expect(Object.keys(result)).toEqual(['sub', 'email', 'name', 'role']);
    });
  });
});
