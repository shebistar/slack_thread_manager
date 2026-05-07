import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

function createMockContext(user?: { role: string } | null): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: user ?? undefined }),
    }),
  } as unknown as ExecutionContext;
}

function mockReflector(
  reflector: Reflector,
  metadata: Record<string, unknown>,
) {
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(
    (key: string) => metadata[key],
  );
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('permits access when no @Roles() decorator is present', () => {
    mockReflector(reflector, { [ROLES_KEY]: undefined, [IS_PUBLIC_KEY]: undefined });

    const context = createMockContext({ role: 'CONSULTANT' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('permits access when @Roles() has an empty array', () => {
    mockReflector(reflector, { [ROLES_KEY]: [], [IS_PUBLIC_KEY]: undefined });

    const context = createMockContext({ role: 'CONSULTANT' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('permits access when user role matches required role', () => {
    mockReflector(reflector, { [ROLES_KEY]: ['ADMIN'], [IS_PUBLIC_KEY]: undefined });

    const context = createMockContext({ role: 'ADMIN' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when user role does not match', () => {
    mockReflector(reflector, { [ROLES_KEY]: ['ADMIN'], [IS_PUBLIC_KEY]: undefined });

    const context = createMockContext({ role: 'CONSULTANT' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Insufficient role permissions');
  });

  it('permits access with OR logic — user has one of multiple required roles', () => {
    mockReflector(reflector, { [ROLES_KEY]: ['ADMIN', 'PM'], [IS_PUBLIC_KEY]: undefined });

    const context = createMockContext({ role: 'PM' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when user has none of multiple required roles', () => {
    mockReflector(reflector, { [ROLES_KEY]: ['ADMIN', 'PM'], [IS_PUBLIC_KEY]: undefined });

    const context = createMockContext({ role: 'CONSULTANT' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('permits access for @Public() endpoints regardless of roles', () => {
    mockReflector(reflector, { [ROLES_KEY]: ['ADMIN'], [IS_PUBLIC_KEY]: true });

    const context = createMockContext(null);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when user has no role property', () => {
    mockReflector(reflector, { [ROLES_KEY]: ['ADMIN'], [IS_PUBLIC_KEY]: undefined });

    const context = createMockContext(null);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
