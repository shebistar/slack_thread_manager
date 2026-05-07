import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  function createMockContext(handler = vi.fn(), classRef = class {}): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => classRef,
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
        getNext: () => vi.fn(),
      }),
      getType: () => 'http',
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({} as any),
      switchToWs: () => ({} as any),
    } as unknown as ExecutionContext;
  }

  it('returns true for endpoints decorated with @Public()', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('delegates to passport for non-public endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const context = createMockContext();

    // AuthGuard('jwt').canActivate returns an Observable or boolean.
    // When no passport strategy is wired in tests, it will throw or return falsy.
    // We verify it does NOT return true (i.e., it doesn't short-circuit like @Public).
    const superCanActivate = vi.spyOn(
      Object.getPrototypeOf(Object.getPrototypeOf(guard)),
      'canActivate',
    );

    guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
  });
});
