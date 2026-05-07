import { describe, it, expect } from 'vitest';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';
import { hasRole, isAdmin, getLayoutVariant } from './role-layout.js';

const makeUser = (role: string): AuthenticatedUser => ({
  sub: 'test-id',
  email: 'test@example.com',
  name: 'Test User',
  role: role as AuthenticatedUser['role'],
});

describe('hasRole', () => {
  it('returns true when user has the specified role', () => {
    expect(hasRole(makeUser('ADMIN'), 'ADMIN')).toBe(true);
  });

  it('returns false when user does not have the specified role', () => {
    expect(hasRole(makeUser('CONSULTANT'), 'ADMIN')).toBe(false);
  });

  it('returns true when user has one of multiple specified roles', () => {
    expect(hasRole(makeUser('PM'), 'ADMIN', 'PM')).toBe(true);
  });

  it('returns false for null user', () => {
    expect(hasRole(null, 'ADMIN')).toBe(false);
  });

  it('returns false when user has no role', () => {
    const user = { sub: 'id', email: 'e', name: 'n' } as AuthenticatedUser;
    expect(hasRole(user, 'ADMIN')).toBe(false);
  });
});

describe('isAdmin', () => {
  it('returns true for ADMIN role', () => {
    expect(isAdmin(makeUser('ADMIN'))).toBe(true);
  });

  it('returns false for non-ADMIN roles', () => {
    expect(isAdmin(makeUser('PM'))).toBe(false);
    expect(isAdmin(makeUser('ARCHITECT'))).toBe(false);
    expect(isAdmin(makeUser('CONSULTANT'))).toBe(false);
  });

  it('returns false for null user', () => {
    expect(isAdmin(null)).toBe(false);
  });
});

describe('getLayoutVariant', () => {
  it('returns "feed" for PM role', () => {
    expect(getLayoutVariant('PM')).toBe('feed');
  });

  it('returns "dashboard" for SALES role', () => {
    expect(getLayoutVariant('SALES')).toBe('dashboard');
  });

  it('returns "dashboard" for TRAINING role', () => {
    expect(getLayoutVariant('TRAINING')).toBe('dashboard');
  });

  it('returns "dashboard" for ADMIN role', () => {
    expect(getLayoutVariant('ADMIN')).toBe('dashboard');
  });

  it('returns "split-panel" for ARCHITECT role', () => {
    expect(getLayoutVariant('ARCHITECT')).toBe('split-panel');
  });

  it('returns "split-panel" for CONSULTANT role', () => {
    expect(getLayoutVariant('CONSULTANT')).toBe('split-panel');
  });
});
