# Story 1.3: Authentication with Keycloak OIDC

Status: ready-for-dev

## Story

As a **team member**,
I want to authenticate using my Red Hat corporate SSO credentials,
so that I can access the system without managing separate passwords.

## Acceptance Criteria

1. **Given** a Keycloak realm is configured with the application as an OIDC client, **When** an unauthenticated user visits any dashboard route, **Then** they are redirected to Keycloak login.
2. **Given** a Keycloak realm is configured, **When** after successful SSO authentication, **Then** they are redirected back to the app with a valid session.
3. **Given** a user is authenticated, **Then** the JWT contains the user's email, name, and role claims.
4. **Given** a JWT is present in the `Authorization: Bearer` header, **Then** NestJS validates the JWT on every API request using `@nestjs/passport` with a JWT strategy backed by Keycloak's JWKS endpoint.
5. **Given** a JWT is invalid or expired, **Then** the API returns 401 Unauthorized.
6. **Given** the app is running, **Then** the Slack bot token and Keycloak client secret are stored in environment variables — never in client-side code or logs.
7. **Given** a valid JWT, **Then** `GET /api/auth/me` returns `{ data: { sub, email, name, role } }`.
8. **Given** the OpenShift health probe hits `GET /api/health`, **Then** it succeeds without authentication (public endpoint).

## Tasks / Subtasks

- [ ] Task 1: Extend backend environment config with Keycloak vars (AC: #3, #4, #6)
  - [ ] 1.1: Add `KEYCLOAK_REALM_URL`, `KEYCLOAK_CLIENT_ID` to `apps/api/src/config/app.config.ts` envSchema
  - [ ] 1.2: Update `.env.example` with the Keycloak variables (uncomment and document them)

- [ ] Task 2: Install backend auth packages (AC: #4, #5)
  - [ ] 2.1: Run `pnpm --filter @slack-thread-manager/api add @nestjs/passport passport passport-jwt jwks-rsa`
  - [ ] 2.2: Run `pnpm --filter @slack-thread-manager/api add -D @types/passport @types/passport-jwt`

- [ ] Task 3: Create `AuthModule` with JWT strategy (AC: #4, #5)
  - [ ] 3.1: Create `apps/api/src/modules/auth/strategies/jwt.strategy.ts` — PassportStrategy backed by Keycloak JWKS
  - [ ] 3.2: Create `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` — extends `AuthGuard('jwt')`
  - [ ] 3.3: Create `apps/api/src/modules/auth/decorators/public.decorator.ts` — `@Public()` metadata marker
  - [ ] 3.4: Create `apps/api/src/modules/auth/decorators/current-user.decorator.ts` — `@CurrentUser()` param decorator
  - [ ] 3.5: Create `apps/api/src/modules/auth/auth.module.ts` — registers PassportModule, JwtStrategy; exports JwtAuthGuard
  - [ ] 3.6: Update `JwtAuthGuard` to skip validation when `@Public()` is present (check Reflector for IS_PUBLIC_KEY)

- [ ] Task 4: Apply global JWT guard and wire AuthModule (AC: #4, #5, #8)
  - [ ] 4.1: Import `AuthModule` in `apps/api/src/app.module.ts`
  - [ ] 4.2: Add `APP_GUARD` provider with `JwtAuthGuard` to `app.module.ts`
  - [ ] 4.3: Add `@Public()` decorator to `AppController.getHealth()` so OpenShift probes continue to work

- [ ] Task 5: Add `AuthenticatedUser` type to `packages/shared` (AC: #3, #7)
  - [ ] 5.1: Create `packages/shared/src/types/authenticated-user.type.ts` — `AuthenticatedUser` interface with `sub`, `email`, `name`, `role`
  - [ ] 5.2: Export `AuthenticatedUser` from `packages/shared/src/types/index.ts`

- [ ] Task 6: Create `/api/auth/me` endpoint (AC: #7)
  - [ ] 6.1: Create `apps/api/src/modules/auth/auth.service.ts` — `getProfile(user: AuthenticatedUser)` returns user info
  - [ ] 6.2: Create `apps/api/src/modules/auth/auth.controller.ts` — `GET /auth/me` using `@CurrentUser()`
  - [ ] 6.3: Create `apps/api/src/modules/auth/auth.controller.spec.ts` — unit tests for `/auth/me`

- [ ] Task 7: Write unit tests for JWT strategy (AC: #4, #5)
  - [ ] 7.1: Create `apps/api/src/modules/auth/strategies/jwt.strategy.spec.ts` — test `validate()` with a valid payload; test missing/malformed claims
  - [ ] 7.2: Create `apps/api/src/modules/auth/guards/jwt-auth.guard.spec.ts` — test that `@Public()` endpoints bypass the guard

- [ ] Task 8: Install `keycloak-js` and create frontend auth layer (AC: #1, #2, #3)
  - [ ] 8.1: Run `pnpm --filter @slack-thread-manager/web add keycloak-js`
  - [ ] 8.2: Create `apps/web/src/lib/keycloak.ts` — Keycloak instance configured from `VITE_` env vars
  - [ ] 8.3: Create `apps/web/src/hooks/use-auth.ts` — hook that exposes `{ authenticated, user, token, keycloak }`
  - [ ] 8.4: Create `apps/web/src/components/auth-provider.tsx` — wraps children, initialises keycloak, shows loading spinner until auth resolves, redirects unauthenticated users to Keycloak
  - [ ] 8.5: Update `apps/web/src/main.tsx` — wrap `<App />` with `<AuthProvider>`
  - [ ] 8.6: Update `.env.example` with `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`

- [ ] Task 9: Write frontend auth tests (AC: #1, #2)
  - [ ] 9.1: Create `apps/web/src/hooks/use-auth.test.ts` — mock keycloak-js, test auth state exposure
  - [ ] 9.2: Create `apps/web/src/components/auth-provider.test.tsx` — test redirect behaviour when unauthenticated; test children render when authenticated

- [ ] Task 10: Run full test suite and validate (AC: all)
  - [ ] 10.1: Run `pnpm test` — confirm all existing tests still pass (no regressions)
  - [ ] 10.2: Run new tests — all auth-related tests pass
  - [ ] 10.3: Confirm `GET /api/health` returns 200 without Authorization header (public endpoint test)
  - [ ] 10.4: Confirm `GET /api/auth/me` returns 401 without Authorization header

## Dev Notes

### ✅ Keycloak Realm Prerequisites — ALREADY DONE

Keycloak is deployed on OpenShift and fully configured. All infrastructure is live:

- **Keycloak URL:** `https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu`
- **Realm:** `slack-thread-manager`
- **Web Client:** `slack-thread-manager-web` (public, PKCE, direct access grants enabled)
- **Worker Client:** `slack-thread-manager-worker` (confidential, service account)
- **Protocol Mapper:** `role` user attribute → `role` JWT claim (String, on access + ID + userinfo tokens)
- **User Profile:** `role` attribute registered in Keycloak 26 declarative user profile schema (required for KC 26+ — unregistered attributes are silently dropped)
- **6 users** created matching seed data, all with `password` as password, role attributes set

**Environment values:**
```
KEYCLOAK_REALM_URL=https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu/realms/slack-thread-manager
KEYCLOAK_CLIENT_ID=slack-thread-manager-web
VITE_KEYCLOAK_URL=https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu
VITE_KEYCLOAK_REALM=slack-thread-manager
VITE_KEYCLOAK_CLIENT_ID=slack-thread-manager-web
```

**JWKS Endpoint:** `https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu/realms/slack-thread-manager/protocol/openid-connect/certs`

**Verified:** JWT for user `shebi` contains `"role": "ADMIN"`, for `alex.chen` contains `"role": "ARCHITECT"`, etc.

**For tests:** Mock the JWT strategy. Do NOT depend on the live Keycloak instance in unit tests.

---

### Critical Architecture Constraints

**Source:** [architecture.md — Authentication & Security; Implementation Patterns & Consistency Rules]

- **Auth module location:** `apps/api/src/modules/auth/` — follow exact directory tree from architecture.md
- **File naming:** kebab-case for all files: `jwt.strategy.ts`, `jwt-auth.guard.ts`, `public.decorator.ts`, `current-user.decorator.ts`
- **No `console.log`** — use `NestJS Logger` for all logging in the auth module
- **`{ data }` wrapper** — `GET /api/auth/me` must return `{ data: { sub, email, name, role } }` not a bare object
- **Zod env validation** — new Keycloak env vars must go through `envSchema` in `app.config.ts` (not raw `process.env`)
- **`@nestjs/config` ConfigService** — always use `configService.getOrThrow('KEY')` for required vars (throws on missing)
- **Shared types** — `AuthenticatedUser` type goes in `packages/shared/src/types/` — NEVER define it locally in `apps/api` or `apps/web`
- **Tests colocated** — `*.spec.ts` next to the source file; NEVER create a `__tests__/` directory

---

### Backend: Package Versions & Install Commands

```bash
# Production dependencies
pnpm --filter @slack-thread-manager/api add @nestjs/passport passport passport-jwt jwks-rsa

# Dev dependencies (types)
pnpm --filter @slack-thread-manager/api add -D @types/passport @types/passport-jwt
```

**Expected versions (May 2026):**
- `@nestjs/passport` — `^11.0.0` (NestJS 11 compatible)
- `passport` — `^0.7.0`
- `passport-jwt` — `^4.0.1`
- `jwks-rsa` — `^3.1.0`

> **Note on architecture doc:** The architecture mentions `passport-openidconnect`. For a **decoupled SPA + REST API** pattern, `passport-openidconnect` is incorrect — it is for server-side OIDC flows where the backend proxies the OAuth code exchange. Since `apps/web` handles the OIDC flow via `keycloak-js` (PKCE), the backend only needs to **validate the JWT Bearer token** using JWKS. Use `passport-jwt` + `jwks-rsa`. This is the correct interpretation of "JWT tokens issued by Keycloak, validated by NestJS guards."

---

### Backend: JWT Strategy Pattern (Keycloak JWKS)

```typescript
// apps/api/src/modules/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    const realmUrl = configService.getOrThrow<string>('KEYCLOAK_REALM_URL');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${realmUrl}/protocol/openid-connect/certs`,
      }),
      issuer: realmUrl,
      algorithms: ['RS256'],
    });
  }

  validate(payload: Record<string, unknown>): AuthenticatedUser {
    // Keycloak JWT claims:
    // - payload.sub: unique user UUID
    // - payload.email: user email
    // - payload.name: display name (full name)
    // - payload.role: custom mapped claim (requires Protocol Mapper in Keycloak)
    // If custom role claim is missing, fall back to first role in realm_access.roles
    const realmRoles = (payload.realm_access as { roles?: string[] })?.roles ?? [];
    const role = (payload.role as string | undefined) ?? realmRoles[0] ?? 'CONSULTANT';

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: (payload.name ?? payload.preferred_username) as string,
      role,
    };
  }
}
```

> `validate()` return value becomes `request.user` — this is what `@CurrentUser()` exposes. Return only the fields needed; do NOT return the full JWT payload.

---

### Backend: `@Public()` Decorator Pattern

The global `JwtAuthGuard` (see below) intercepts ALL requests. Use `@Public()` to mark endpoints that must be accessible without auth.

```typescript
// apps/api/src/modules/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

```typescript
// apps/api/src/modules/auth/guards/jwt-auth.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

**Critical:** Mark `AppController.getHealth()` with `@Public()` — OpenShift readiness/liveness probes hit `/api/health` without tokens. Without this, OpenShift will mark the pod as unready after deploying story 1.3!

```typescript
// apps/api/src/app.controller.ts (UPDATE)
import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/decorators/public.decorator.js';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }
}
```

---

### Backend: Global Guard via APP_GUARD

```typescript
// apps/api/src/app.module.ts (UPDATE)
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { envSchema } from './config/app.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
```

---

### Backend: AuthModule

```typescript
// apps/api/src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, JwtAuthGuard, AuthService],
  controllers: [AuthController],
  exports: [JwtAuthGuard, PassportModule],
})
export class AuthModule {}
```

---

### Backend: `@CurrentUser()` Decorator

```typescript
// apps/api/src/modules/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
```

---

### Backend: `/api/auth/me` Response Shape

```typescript
// apps/api/src/modules/auth/auth.controller.ts
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

@Controller('auth')
export class AuthController {
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return { data: user };
  }
}
```

Expected response:
```json
{
  "data": {
    "sub": "uuid-from-keycloak",
    "email": "shebi@example.com",
    "name": "Shebi",
    "role": "ADMIN"
  }
}
```

---

### Backend: Updated `app.config.ts` (Keycloak vars)

```typescript
// apps/api/src/config/app.config.ts (UPDATE — keep existing vars, add Keycloak)
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  // Keycloak
  KEYCLOAK_REALM_URL: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
});

export type EnvConfig = z.infer<typeof envSchema>;
```

> `KEYCLOAK_CLIENT_SECRET` is NOT added here — it's only needed by the worker client (Story 3.x), not the bearer-only API validation. The web client is public (no secret).

---

### Backend: Testing JWT Strategy Without a Real Keycloak

For unit tests, mock `jwks-rsa` and test `validate()` directly:

```typescript
// apps/api/src/modules/auth/strategies/jwt.strategy.spec.ts
import { JwtStrategy } from './jwt.strategy.js';
import { ConfigService } from '@nestjs/config';

describe('JwtStrategy.validate()', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const configService = {
      getOrThrow: (key: string) => {
        if (key === 'KEYCLOAK_REALM_URL') return 'http://keycloak/realms/test';
        throw new Error(`Unexpected key: ${key}`);
      },
    } as unknown as ConfigService;

    // Mock the super() call — JwtStrategy constructor calls PassportStrategy(Strategy)
    // Use jest.mock or vitest.mock to stub passport-jwt + jwks-rsa
    jest.mock('jwks-rsa', () => ({ passportJwtSecret: () => 'secret' }));
    jest.mock('passport-jwt', () => ({
      ExtractJwt: { fromAuthHeaderAsBearerToken: () => () => null },
      Strategy: class { constructor(opts: unknown, cb: unknown) {} },
    }));

    strategy = new JwtStrategy(configService);
  });

  it('returns AuthenticatedUser from valid payload', () => {
    const result = strategy.validate({
      sub: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'ARCHITECT',
    });
    expect(result).toEqual({
      sub: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'ARCHITECT',
    });
  });

  it('falls back to realm_access.roles when role claim is absent', () => {
    const result = strategy.validate({
      sub: 'user-456',
      email: 'pm@example.com',
      name: 'PM User',
      realm_access: { roles: ['PM', 'offline_access'] },
    });
    expect(result.role).toBe('PM');
  });
});
```

> Use vitest's `vi.mock()` not jest.mock() — `apps/api` uses vitest (see `apps/api/vitest.config.ts`).

---

### Shared: `AuthenticatedUser` Type

```typescript
// packages/shared/src/types/authenticated-user.type.ts
import type { UserRole } from '../schemas/user.schema.js';

export interface AuthenticatedUser {
  sub: string;       // Keycloak user UUID
  email: string;
  name: string;
  role: UserRole;
}
```

> `UserRole` is already defined in `packages/shared/src/schemas/user.schema.ts` from story 1.2 — import it from there. Do NOT redefine it.

Export from `packages/shared/src/types/index.ts`:
```typescript
export type { AuthenticatedUser } from './authenticated-user.type.js';
// ... existing exports
```

---

### Frontend: keycloak-js Install

```bash
pnpm --filter @slack-thread-manager/web add keycloak-js
```

**Expected version (May 2026):** `keycloak-js@^26.x`

> `keycloak-js` is a **public client** library. It stores tokens in memory (not localStorage by default in v26+). Credentials never leave the browser in client-side code — satisfying AC #6.

---

### Frontend: Keycloak Instance

```typescript
// apps/web/src/lib/keycloak.ts
import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL as string,
  realm: import.meta.env.VITE_KEYCLOAK_REALM as string,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID as string,
});

export default keycloak;
```

> VITE_ prefix is required for Vite to expose env vars to the browser. These are public config values (realm name, client ID) — NOT secrets. Never put `KEYCLOAK_CLIENT_SECRET` in any `VITE_` var.

---

### Frontend: AuthProvider & `use-auth` Hook

```typescript
// apps/web/src/hooks/use-auth.ts
import { useContext } from 'react';
import { AuthContext } from '../components/auth-provider.js';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
```

```tsx
// apps/web/src/components/auth-provider.tsx
import { createContext, useEffect, useState, type ReactNode } from 'react';
import keycloak from '../lib/keycloak.js';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

interface AuthState {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  token: string | null;
  keycloak: typeof keycloak;
}

export const AuthContext = createContext<AuthState | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState | null>(null);

  useEffect(() => {
    keycloak
      .init({
        onLoad: 'login-required',    // Redirect to Keycloak if not authenticated
        checkLoginIframe: false,     // Disable silent SSO check iframe (reduces noise)
        pkceMethod: 'S256',          // Enforce PKCE for security
      })
      .then((authenticated) => {
        if (authenticated && keycloak.tokenParsed) {
          const t = keycloak.tokenParsed as Record<string, unknown>;
          const realmRoles = (t.realm_access as { roles?: string[] })?.roles ?? [];
          const role = (t.role as string | undefined) ?? realmRoles[0] ?? 'CONSULTANT';

          setAuthState({
            authenticated: true,
            user: {
              sub: t.sub as string,
              email: t.email as string,
              name: (t.name ?? t.preferred_username) as string,
              role,
            },
            token: keycloak.token ?? null,
            keycloak,
          });
        } else {
          // `onLoad: 'login-required'` redirects before reaching this branch in production,
          // but handle gracefully in tests / environments where Keycloak is unavailable.
          setAuthState({ authenticated: false, user: null, token: null, keycloak });
        }
      })
      .catch(() => {
        // Keycloak unavailable (e.g., dev without Keycloak running) — fail open only in dev
        if (import.meta.env.DEV) {
          console.warn('[AuthProvider] Keycloak unavailable — running unauthenticated in DEV mode');
          setAuthState({ authenticated: false, user: null, token: null, keycloak });
        }
      });
  }, []);

  // Show nothing until auth state resolves (prevents flash of unauthenticated content)
  if (authState === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[--color-gray-50]">Authenticating…</p>
      </div>
    );
  }

  return <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>;
}
```

**Token refresh:** `keycloak-js` automatically refreshes the token if you configure a `onTokenExpired` callback or use `keycloak.updateToken(minValidity)`. For story 1.3, add a minimum viable refresh:

```typescript
// Add inside useEffect after setAuthState(...)
keycloak.onTokenExpired = () => {
  keycloak.updateToken(30).catch(() => keycloak.logout());
};
```

---

### Frontend: `main.tsx` Update

```tsx
// apps/web/src/main.tsx (UPDATE)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './components/auth-provider.js';
import App from './app.js';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in the DOM. Check index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
```

---

### Frontend: API Client (Pre-wire for Story 1.5+)

The `api-client.ts` pattern from architecture.md should attach the Keycloak token to API requests. Story 1.3 should create the skeleton even if no API calls are made yet:

```typescript
// apps/web/src/lib/api-client.ts (NEW)
import keycloak from './keycloak.js';

const API_BASE = '/api';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // Refresh token if it expires within 30s
  await keycloak.updateToken(30).catch(() => keycloak.logout());

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keycloak.token}`,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    keycloak.logout();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
```

> This skeleton is used by all future hooks (`use-briefings.ts`, `use-search.ts`, etc.) — creating it now prevents each future story from inventing a different pattern.

---

### Environment Variables

**Backend (`apps/api`) — server-side, secrets OK:**
```bash
# .env (add to existing)
KEYCLOAK_REALM_URL=https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu/realms/slack-thread-manager
KEYCLOAK_CLIENT_ID=slack-thread-manager-web
```

**Frontend (`apps/web`) — client-side, NO secrets:**
```bash
# apps/web/.env (create new file — not committed, add template to .env.example)
VITE_KEYCLOAK_URL=https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu
VITE_KEYCLOAK_REALM=slack-thread-manager
VITE_KEYCLOAK_CLIENT_ID=slack-thread-manager-web
```

> The `apps/web` `.env` file is different from the root `.env`. Vite reads from `apps/web/.env`. Update `.env.example` at the repo root to document both sets.

---

### Files Being Created (NEW)

```
apps/api/src/modules/auth/auth.module.ts
apps/api/src/modules/auth/auth.controller.ts
apps/api/src/modules/auth/auth.controller.spec.ts
apps/api/src/modules/auth/auth.service.ts
apps/api/src/modules/auth/strategies/jwt.strategy.ts
apps/api/src/modules/auth/strategies/jwt.strategy.spec.ts
apps/api/src/modules/auth/guards/jwt-auth.guard.ts
apps/api/src/modules/auth/guards/jwt-auth.guard.spec.ts
apps/api/src/modules/auth/decorators/public.decorator.ts
apps/api/src/modules/auth/decorators/current-user.decorator.ts
packages/shared/src/types/authenticated-user.type.ts
apps/web/src/lib/keycloak.ts
apps/web/src/lib/api-client.ts
apps/web/src/hooks/use-auth.ts
apps/web/src/components/auth-provider.tsx
apps/web/src/hooks/use-auth.test.ts
apps/web/src/components/auth-provider.test.tsx
apps/web/.env.example                    — (VITE_ vars documentation only)
```

### Files Being Updated (EXISTING)

```
apps/api/src/app.module.ts               — import AuthModule + APP_GUARD provider
apps/api/src/app.controller.ts           — add @Public() to getHealth()
apps/api/src/config/app.config.ts        — add KEYCLOAK_REALM_URL, KEYCLOAK_CLIENT_ID to envSchema
apps/api/package.json                    — new auth dependencies
apps/web/src/main.tsx                    — wrap App with <AuthProvider>
apps/web/package.json                    — add keycloak-js
packages/shared/src/types/index.ts      — export AuthenticatedUser
.env.example                             — uncomment & document Keycloak vars
```

---

### Anti-Patterns to Avoid

**Source:** [architecture.md — Anti-Patterns; Story 1.2 learnings]

- **DO NOT** put `KEYCLOAK_CLIENT_SECRET` in `VITE_` env vars — it exposes the secret to the browser
- **DO NOT** use `process.env.KEYCLOAK_*` directly — always use `ConfigService.getOrThrow()`
- **DO NOT** return raw JWT payload from `validate()` — return only the `AuthenticatedUser` shape
- **DO NOT** skip `@Public()` on `/api/health` — will break OpenShift readiness probes
- **DO NOT** apply `JwtAuthGuard` per-controller — `APP_GUARD` provides global coverage; per-controller usage creates coverage gaps
- **DO NOT** create `AuthenticatedUser` interface in `apps/api/src/` — it belongs in `packages/shared`
- **DO NOT** store Keycloak tokens in `localStorage` — keycloak-js v26+ stores in memory by default
- **DO NOT** call `keycloak.init()` multiple times — wrap in a single `AuthProvider` at the root

---

### Previous Story Learnings (Story 1.2 + Story 1.1)

**Source:** [1-2-database-schema-and-core-models.md — Dev Agent Record, Debug Log]

- **`podman-compose`** is used for local PostgreSQL (NOT `docker-compose`) — local dev instructions should reference `podman-compose up -d`
- **`.js` extension on imports** — NestJS uses ESM; all local imports must use `.js` extension even for `.ts` source files (e.g., `import { JwtStrategy } from './strategies/jwt.strategy.js'`)
- **`sandbox` restriction on `pnpm db:migrate`** — sandbox may block network for database connections; use `required_permissions: ["all"]` if running migrations; auth-related code should be testable with mocks
- **NestJS 11 package versions:** `@nestjs/common: ^11.0.0`, `@nestjs/config: ^4.0.0` — ensure `@nestjs/passport` is compatible (`^11.0.0` or latest)
- **vitest not jest** — `apps/api` uses vitest; use `vi.mock()` not `jest.mock()`, `vi.fn()` not `jest.fn()`
- **`@slack-thread-manager/shared`** is a workspace package — it's already installed in `apps/api`; no need to add it again

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: _bmad-output/implementation-artifacts/1-2-database-schema-and-core-models.md#Dev Agent Record]
- [Source: _bmad-output/implementation-artifacts/1-2-database-schema-and-core-models.md#Dev Notes]
- [Source: keycloak.org/securing-apps/javascript-adapter — Keycloak JS Adapter (May 2026)]
- [Source: skycloak.io/blog/keycloak-nestjs-authentication-guide/ — NestJS + Keycloak Complete Guide (2026)]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (Cursor Agent)

### Debug Log References

### Completion Notes List

### File List
