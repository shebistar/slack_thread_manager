# Story 1.4: Role-Based Access Control & Route Guards

Status: done

## Story

As an **admin**,
I want routes and API endpoints protected by role-based access control,
so that team members only see what their role permits and admin operations are restricted.

## Acceptance Criteria

1. **Given** a user is authenticated with a role claim in their JWT, **When** they access an admin-only endpoint (roster, channel config), **Then** only users with the ADMIN role are permitted (others receive 403 Forbidden).
2. **Given** any protected controller method, **When** the `@Roles('ADMIN')` decorator is applied, **Then** the `RolesGuard` checks the JWT role claim and rejects non-matching users with 403.
3. **Given** an endpoint has no `@Roles()` decorator, **When** an authenticated user accesses it, **Then** the guard permits access (role enforcement is opt-in per endpoint, auth is global).
4. **Given** a valid JWT, **When** the frontend reads the user's role from the auth context, **Then** the Admin navigation item is conditionally rendered (visible only to ADMIN role).
5. **Given** a non-admin user, **When** they navigate directly to an admin route URL, **Then** they see an "Access Denied" message instead of the admin content.
6. **Given** a `@Roles()` decorator with multiple roles, **When** a user has any one of the listed roles, **Then** access is granted (OR logic, not AND).

## Tasks / Subtasks

- [x] Task 1: Create `@Roles()` decorator (AC: #2, #3, #6)
  - [x] 1.1: Create `apps/api/src/modules/auth/decorators/roles.decorator.ts` — `@Roles(...roles: UserRole[])` using `SetMetadata`
  - [x] 1.2: Define `ROLES_KEY` constant for metadata key

- [x] Task 2: Create `RolesGuard` (AC: #1, #2, #3, #6)
  - [x] 2.1: Create `apps/api/src/modules/auth/guards/roles.guard.ts` — implements `CanActivate`
  - [x] 2.2: Use `Reflector` to read `ROLES_KEY` from both handler and class
  - [x] 2.3: If no `@Roles()` metadata is found, return `true` (opt-in, not opt-out)
  - [x] 2.4: Extract `request.user.role` (populated by `JwtStrategy.validate()`) and check against required roles
  - [x] 2.5: Throw `ForbiddenException` with message `'Insufficient role permissions'` when role doesn't match

- [x] Task 3: Register `RolesGuard` globally via `APP_GUARD` (AC: #1, #2, #3)
  - [x] 3.1: Update `apps/api/src/app.module.ts` — add second `APP_GUARD` provider for `RolesGuard` (AFTER `JwtAuthGuard` — execution order matters)
  - [x] 3.2: Update `apps/api/src/modules/auth/auth.module.ts` — add `RolesGuard` to providers and exports

- [x] Task 4: Create test admin endpoint to demonstrate RBAC (AC: #1)
  - [x] 4.1: Create `apps/api/src/modules/admin/admin.module.ts` with `AdminController`
  - [x] 4.2: Create `apps/api/src/modules/admin/admin.controller.ts` — `GET /admin/health` with `@Roles('ADMIN')` returning `{ data: { status: 'admin-ok' } }`
  - [x] 4.3: Import `AdminModule` in `app.module.ts`

- [x] Task 5: Write backend unit tests (AC: #1, #2, #3, #6)
  - [x] 5.1: Create `apps/api/src/modules/auth/guards/roles.guard.spec.ts` — test: no `@Roles()` → permit; matching role → permit; non-matching role → 403; multiple roles OR logic → permit if any match
  - [x] 5.2: Create `apps/api/src/modules/admin/admin.controller.spec.ts` — test: ADMIN user → 200; non-ADMIN user → 403

- [x] Task 6: Install TanStack Router and set up minimal routing (AC: #4, #5)
  - [x] 6.1: Run `pnpm --filter @slack-thread-manager/web add @tanstack/react-router`
  - [x] 6.2: Run `pnpm --filter @slack-thread-manager/web add -D @tanstack/router-plugin @tanstack/router-devtools`
  - [x] 6.3: Update `apps/web/vite.config.ts` — add TanStack Router Vite plugin
  - [x] 6.4: Create `apps/web/src/routes/__root.tsx` — root route with auth check, provides user context
  - [x] 6.5: Create `apps/web/src/routes/index.tsx` — root index redirects to `/briefings`
  - [x] 6.6: Create `apps/web/src/routes/briefings.tsx` — placeholder with "Your first briefing hasn't been generated yet"
  - [x] 6.7: Create `apps/web/src/routes/search.tsx` — placeholder with search input placeholder
  - [x] 6.8: Create `apps/web/src/routes/admin.tsx` — admin route with `beforeLoad` role guard, "Access Denied" for non-admin
  - [x] 6.9: Create `apps/web/src/router.ts` — createRouter with routeTree, export for use in main.tsx
  - [x] 6.10: Update `apps/web/src/app.tsx` — replace placeholder content with `<RouterProvider>`
  - [x] 6.11: main.tsx unchanged — router is wired through App component which already receives AuthProvider context

- [x] Task 7: Create frontend role-checking utilities (AC: #4, #5)
  - [x] 7.1: Create `apps/web/src/lib/role-layout.ts` — `hasRole(user, role)`, `isAdmin(user)`, `getLayoutVariant(role)` utilities
  - [x] 7.2: These utilities are used by route guards and conditional rendering

- [x] Task 8: Write frontend tests (AC: #4, #5)
  - [x] 8.1: Create `apps/web/src/lib/role-layout.test.ts` — test role-checking utilities
  - [x] 8.2: Update `apps/web/src/app.test.tsx` — test that router renders, admin route blocked for non-admin

- [x] Task 9: Run full test suite and validate (AC: all)
  - [x] 9.1: Run `pnpm test` — all existing tests still pass (43 tests, 9 test files, 5 tasks — all passing)
  - [x] 9.2: Confirm `GET /api/admin/health` returns 403 for non-ADMIN JWT — validated via admin.controller.spec.ts and roles.guard.spec.ts
  - [x] 9.3: Confirm `GET /api/admin/health` returns 200 for ADMIN JWT — validated via admin.controller.spec.ts
  - [x] 9.4: Confirm `GET /api/auth/me` still works (no `@Roles()` → accessible to all authenticated users) — auth.controller.spec.ts passes, no @Roles on auth endpoints
  - [x] 9.5: Confirm frontend admin route shows "Access Denied" for non-ADMIN user — validated via app.test.tsx (3 admin route guard tests)

### Review Findings

- [x] [Review][Defer] AC4 nav item deferred to story 1.5 — Role utilities and route guard are in place; the Admin navigation item (conditionally rendered based on role) will be built in story 1.5 alongside the full navigation bar. Story 1.5 must explicitly pick up AC4's nav item requirement. — deferred, intentional per scope
- [x] [Review][Patch] Near-vacuous authenticated render test — fixed: now asserts briefings placeholder renders after auth (verifies index→/briefings redirect and route content). [apps/web/src/app.test.tsx]
- [x] [Review][Patch] `routeTree.gen.ts` kept committed + added `TanStackRouterVite()` to `vitest.config.ts` — ensures route tree stays in sync during test runs and fresh clones work. [apps/web/vitest.config.ts]
- [x] [Review][Patch] Admin guard test now uses `throw redirect()` matching real `admin.tsx` behavior — removed `defaultErrorComponent` fallback, tests actual redirect navigation to `/access-denied`. [apps/web/src/app.test.tsx]
- [x] [Review][Patch] Replaced fragile if/else `Reflector` mock with map-based `vi.spyOn` + `mockImplementation` using a `mockReflector` helper. [apps/api/src/modules/auth/guards/roles.guard.spec.ts]
- [x] [Review][Defer] Missing role claim defaults silently to CONSULTANT — `auth-context.tsx` uses `payload.role ?? 'CONSULTANT'` with no warning. Pre-existing behavior not introduced by this story; deferred to future auth hardening. [apps/web/src/auth/auth-context.tsx] — deferred, pre-existing
- [x] [Review][Defer] Logout removed from app.tsx — sign-out button removed with no replacement. Intentional: logout will live in the story 1.5 navigation bar. [apps/web/src/app.tsx] — deferred, intentional per scope

## Dev Notes

### Critical Architecture Constraints

**Source:** [architecture.md — Authentication & Security; Implementation Patterns]

- **`@Roles()` decorator** uses `SetMetadata` — standard NestJS pattern. Import `UserRole` from `@slack-thread-manager/shared` for type safety.
- **`RolesGuard` execution order** — when multiple `APP_GUARD` providers are registered, NestJS executes them in registration order. `JwtAuthGuard` MUST run first (populates `request.user`), then `RolesGuard` reads `request.user.role`. Register `JwtAuthGuard` before `RolesGuard` in the `providers` array.
- **Opt-in RBAC** — if no `@Roles()` decorator is present on a handler or class, `RolesGuard` permits access. This is critical: most endpoints are accessible to all authenticated users. Only admin endpoints are role-restricted.
- **`{ data }` wrapper** — admin health endpoint must return `{ data: { status: 'admin-ok' } }` — consistent with all API responses.
- **`@Public()` endpoints bypass BOTH guards** — `JwtAuthGuard` already handles `@Public()`. The `RolesGuard` should also check for `@Public()` metadata and skip role checking if present (belt and suspenders).
- **File naming** — kebab-case: `roles.decorator.ts`, `roles.guard.ts`, `role-layout.ts`
- **No `console.log`** — use NestJS Logger in backend
- **Tests colocated** — `*.spec.ts` next to source files; `*.test.ts`/`*.test.tsx` for frontend

---

### Backend: `@Roles()` Decorator Pattern

```typescript
// apps/api/src/modules/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@slack-thread-manager/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

**Import `UserRole` from `@slack-thread-manager/shared`** — the enum is already defined there. Do NOT create a local copy.

---

### Backend: `RolesGuard` Implementation

```typescript
// apps/api/src/modules/auth/guards/roles.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole, AuthenticatedUser } from '@slack-thread-manager/shared';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip role check for @Public() endpoints
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // If no @Roles() decorator, allow access (opt-in RBAC)
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const user = request.user;
    if (!user?.role) throw new ForbiddenException('Insufficient role permissions');

    // OR logic: user must have at least one of the required roles
    if (!requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }
}
```

**Key behaviors:**
1. `@Public()` → skip (already handled by `JwtAuthGuard`, but defense-in-depth)
2. No `@Roles()` → permit all authenticated users
3. `@Roles('ADMIN')` → only ADMIN
4. `@Roles('ADMIN', 'PM')` → ADMIN or PM (OR logic)

---

### Backend: Updated `app.module.ts` (Guard Registration Order)

```typescript
// apps/api/src/app.module.ts (UPDATE)
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './modules/auth/guards/roles.guard.js';
import { envSchema } from './config/app.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    AuthModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,  // FIRST: populates request.user
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,    // SECOND: reads request.user.role
    },
  ],
})
export class AppModule {}
```

**CRITICAL:** `JwtAuthGuard` MUST be registered BEFORE `RolesGuard`. If reversed, `RolesGuard` will see `request.user` as undefined and throw errors.

---

### Backend: Updated `auth.module.ts`

```typescript
// apps/api/src/modules/auth/auth.module.ts (UPDATE)
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, JwtAuthGuard, RolesGuard, AuthService],
  controllers: [AuthController],
  exports: [JwtAuthGuard, RolesGuard, PassportModule],
})
export class AuthModule {}
```

---

### Backend: Admin Module (Minimal, Story 1.4 scope)

```typescript
// apps/api/src/modules/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';

@Module({
  controllers: [AdminController],
})
export class AdminModule {}
```

```typescript
// apps/api/src/modules/admin/admin.controller.ts
import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('admin')
export class AdminController {
  @Get('health')
  @Roles('ADMIN')
  getAdminHealth() {
    return { data: { status: 'admin-ok' } };
  }
}
```

**Note:** This is a minimal admin endpoint to validate RBAC works end-to-end. Stories 1.6 and 1.7 will expand the admin module with roster and channel controllers. The `@Roles('ADMIN')` decorator on the controller class level (rather than method level) is also valid when ALL methods in a controller need the same role — but for story 1.4, apply at method level to demonstrate granularity.

---

### Frontend: TanStack Router Setup

**Install commands:**
```bash
pnpm --filter @slack-thread-manager/web add @tanstack/react-router
pnpm --filter @slack-thread-manager/web add -D @tanstack/router-plugin @tanstack/router-devtools
```

**Expected versions (May 2026):**
- `@tanstack/react-router` — `^1.x` (stable v1)
- `@tanstack/router-plugin` — `^1.x`
- `@tanstack/router-devtools` — `^1.x`

**Vite plugin config:**
```typescript
// apps/web/vite.config.ts (UPDATE)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
  ],
  // ... existing config
});
```

> **TanStackRouterVite() must come BEFORE react()** in the plugins array. The plugin auto-generates the route tree from `src/routes/` directory.

---

### Frontend: Root Route with Auth Context

```tsx
// apps/web/src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

interface RouterContext {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return <Outlet />;
}
```

The root route receives `user` and `isAuthenticated` from the router context (injected when creating the router instance). Story 1.5 will add the app header, navigation bar, and layout chrome to `RootLayout`.

---

### Frontend: Admin Route with Role Guard

```tsx
// apps/web/src/routes/admin.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (!context.user || context.user.role !== 'ADMIN') {
      throw redirect({ to: '/access-denied' });
    }
  },
  component: AdminPlaceholder,
});

function AdminPlaceholder() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-2xl font-medium text-[--color-gray-95]">Admin Panel</h1>
        <p className="mt-2 text-[--color-gray-50]">
          Administration features coming in stories 1.6 and 1.7
        </p>
      </div>
    </main>
  );
}
```

---

### Frontend: Access Denied Route

```tsx
// apps/web/src/routes/access-denied.tsx
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/access-denied')({
  component: AccessDenied,
});

function AccessDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-2xl font-medium text-[--color-gray-95]">Access Denied</h1>
        <p className="mt-2 text-[--color-gray-50]">
          You do not have permission to access this page.
        </p>
        <Link
          to="/briefings"
          className="mt-4 inline-block text-[--color-blue-50] hover:underline"
        >
          Return to Briefings
        </Link>
      </div>
    </main>
  );
}
```

---

### Frontend: Briefings and Search Placeholder Routes

```tsx
// apps/web/src/routes/briefings.tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/briefings')({
  component: BriefingsPlaceholder,
});

function BriefingsPlaceholder() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <p className="text-lg text-[--color-gray-50]">
        Your first briefing hasn't been generated yet.
      </p>
    </main>
  );
}
```

```tsx
// apps/web/src/routes/search.tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/search')({
  component: SearchPlaceholder,
});

function SearchPlaceholder() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <p className="text-lg text-[--color-gray-50]">
        Search — coming soon
      </p>
    </main>
  );
}
```

```tsx
// apps/web/src/routes/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/briefings' });
  },
});
```

---

### Frontend: Router Instance

```tsx
// apps/web/src/router.ts
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

export const router = createRouter({
  routeTree,
  context: {
    user: null,
    isAuthenticated: false,
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

> `routeTree.gen.ts` is auto-generated by the TanStack Router Vite plugin from the `src/routes/` directory. Do NOT create this file manually. The plugin generates it on first `pnpm dev` or `pnpm build`.

---

### Frontend: Updated `app.tsx`

```tsx
// apps/web/src/app.tsx (REPLACE)
import { RouterProvider } from '@tanstack/react-router';
import { useAuth } from './auth/index.js';
import { router } from './router.js';

export default function App() {
  const { isLoading, isAuthenticated, user } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-lg text-[--color-gray-50]">Authenticating…</p>
      </main>
    );
  }

  return (
    <RouterProvider
      router={router}
      context={{ user, isAuthenticated }}
    />
  );
}
```

**Key detail:** `context` is passed to the router at the provider level. This makes `user` and `isAuthenticated` available in every route's `beforeLoad` via `context.user` and `context.auth`. The router context is re-evaluated when `user` or `isAuthenticated` changes.

---

### Frontend: Role-Checking Utilities

```typescript
// apps/web/src/lib/role-layout.ts
import type { AuthenticatedUser, UserRole } from '@slack-thread-manager/shared';

export type LayoutVariant = 'dashboard' | 'feed' | 'split-panel';

const ROLE_LAYOUT_MAP: Record<UserRole, LayoutVariant> = {
  PM: 'feed',
  SALES: 'dashboard',
  TRAINING: 'dashboard',
  ARCHITECT: 'split-panel',
  CONSULTANT: 'split-panel',
  ADMIN: 'dashboard',
};

export function hasRole(user: AuthenticatedUser | null, ...roles: UserRole[]): boolean {
  if (!user?.role) return false;
  return roles.includes(user.role as UserRole);
}

export function isAdmin(user: AuthenticatedUser | null): boolean {
  return hasRole(user, 'ADMIN');
}

export function getLayoutVariant(role: UserRole): LayoutVariant {
  return ROLE_LAYOUT_MAP[role] ?? 'dashboard';
}
```

**Source:** [architecture.md — Frontend Architecture; UX Design — Design Direction Decision]

Role-to-layout mapping:
- `PM` → `feed` (Filtered Brief / News Feed)
- `SALES`, `TRAINING`, `ADMIN` → `dashboard` (Executive Scan)
- `ARCHITECT`, `CONSULTANT` → `split-panel` (Intelligence Report)

---

### Files Being Created (NEW)

```
apps/api/src/modules/auth/decorators/roles.decorator.ts
apps/api/src/modules/auth/guards/roles.guard.ts
apps/api/src/modules/auth/guards/roles.guard.spec.ts
apps/api/src/modules/admin/admin.module.ts
apps/api/src/modules/admin/admin.controller.ts
apps/api/src/modules/admin/admin.controller.spec.ts
apps/web/src/routes/__root.tsx
apps/web/src/routes/index.tsx
apps/web/src/routes/briefings.tsx
apps/web/src/routes/search.tsx
apps/web/src/routes/admin.tsx
apps/web/src/routes/access-denied.tsx
apps/web/src/router.ts
apps/web/src/lib/role-layout.ts
apps/web/src/lib/role-layout.test.ts
```

### Files Being Updated (EXISTING)

```
apps/api/src/app.module.ts               — add RolesGuard APP_GUARD + AdminModule import
apps/api/src/modules/auth/auth.module.ts  — add RolesGuard to providers and exports
apps/web/src/app.tsx                      — replace placeholder with RouterProvider
apps/web/vite.config.ts                   — add TanStack Router Vite plugin
apps/web/package.json                     — add TanStack Router dependencies
apps/web/src/app.test.tsx                 — update tests for router-based rendering
```

### Files NOT Modified (Preserve As-Is)

```
apps/api/src/modules/auth/guards/jwt-auth.guard.ts     — no changes needed
apps/api/src/modules/auth/auth.controller.ts            — no @Roles() needed (all authenticated users)
apps/api/src/modules/auth/decorators/public.decorator.ts — no changes
apps/api/src/modules/auth/decorators/current-user.decorator.ts — no changes
apps/api/src/app.controller.ts                          — health endpoint stays @Public()
apps/api/src/config/app.config.ts                       — no new env vars for RBAC
```

---

### Anti-Patterns to Avoid

**Source:** [architecture.md — Anti-Patterns; Story 1.3 learnings]

- **DO NOT** create a `roles.enum.ts` in `apps/api/` — `UserRole` exists in `packages/shared/src/schemas/user.schema.ts`. Import from there.
- **DO NOT** apply `@Roles()` to the `/api/auth/me` endpoint — it must be accessible to ALL authenticated users regardless of role.
- **DO NOT** apply `@Roles()` to `@Public()` endpoints — public endpoints bypass auth entirely. Adding roles to them would be meaningless and confusing.
- **DO NOT** put `RolesGuard` before `JwtAuthGuard` in `APP_GUARD` providers — roles guard needs `request.user` which is populated by JWT guard.
- **DO NOT** create a `__tests__/` directory — test files go next to source files: `roles.guard.spec.ts` next to `roles.guard.ts`.
- **DO NOT** use `localStorage` for role state in the frontend — role comes from the JWT token parsed by `AuthProvider`. The auth context is the single source of truth.
- **DO NOT** create a separate `RoleGuardProvider` component in React — use TanStack Router's `beforeLoad` pattern for route-level guards.
- **DO NOT** hardcode role strings — always use the `UserRole` type from `@slack-thread-manager/shared` for type safety.

---

### Previous Story Learnings (Story 1.3 + Story 1.2)

- **`.js` extension on imports** — NestJS uses ESM; all local imports must use `.js` extension even for `.ts` source files (e.g., `import { Roles } from '../decorators/roles.decorator.js'`).
- **`podman-compose`** is used for local PostgreSQL (NOT `docker-compose`).
- **vitest not jest** — `apps/api` uses vitest; use `vi.mock()` not `jest.mock()`, `vi.fn()` not `jest.fn()`.
- **`@slack-thread-manager/shared`** is already a workspace dependency — no need to add it again.
- **Keycloak is live** — JWT for user `shebi` contains `"role": "ADMIN"`, for `alex.chen` contains `"role": "ARCHITECT"`, etc. For tests, mock the JWT/user object, do NOT depend on live Keycloak.
- **Auth file location** — story 1.3 placed auth files under `apps/web/src/auth/` (not `apps/web/src/components/auth-provider.tsx` as originally spec'd). Continue using `apps/web/src/auth/` for consistency.
- **Frontend auth state** — `useAuth()` from `apps/web/src/auth/index.ts` exposes `{ isLoading, isAuthenticated, user, token, login, logout }`. The `user` object has `.role` field. Use this for conditional rendering.

---

### Testing Strategy

**Backend (vitest):**
- `roles.guard.spec.ts` — mock `Reflector` and `ExecutionContext` to test all four behaviors: no decorator → permit, matching role → permit, non-matching → 403, OR logic with multiple roles
- `admin.controller.spec.ts` — test the admin health endpoint with overridden guard to verify `@Roles('ADMIN')` metadata is correctly applied

**Frontend (vitest):**
- `role-layout.test.ts` — pure function tests for `hasRole()`, `isAdmin()`, `getLayoutVariant()`
- `app.test.tsx` — update existing tests. Mock `useAuth()` to return different role users, verify router renders correct routes. Consider using `createMemoryHistory` from TanStack Router for testing.

---

### Scope Boundaries

**In scope for story 1.4:**
- Backend `@Roles()` decorator and `RolesGuard`
- Global `RolesGuard` registration
- Minimal admin endpoint to prove RBAC works
- TanStack Router installation and minimal file-based routes
- Frontend role-checking utilities
- Admin route guard (`beforeLoad` redirect for non-admin)
- Access denied page

**Out of scope (deferred to story 1.5):**
- App header with Red Hat branding
- Persistent horizontal navigation bar
- Role indicator badge
- Briefing freshness timestamp placeholder
- Responsive layout at 3 breakpoints
- Semantic HTML structure (skip-to-content link, page title updates)
- Full dashboard shell and navigation chrome

**Out of scope (deferred to stories 1.6, 1.7):**
- Roster management CRUD endpoints and UI
- Channel configuration endpoints and UI
- Admin panel with tabs (Roster, Channels, System)

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security — Authorization: RBAC]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules — Structure Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture — Routing: TanStack Router]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Navigation Patterns]
- [Source: _bmad-output/implementation-artifacts/1-3-authentication-with-keycloak-oidc.md#Dev Notes]
- [Source: tanstack.com/router/v1/docs/how-to/setup-rbac — TanStack Router RBAC Guide]
- [Source: NestJS docs — Guards, Custom Decorators, SetMetadata]

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (Cursor Agent)

### Debug Log References

No debug issues encountered. All tasks implemented cleanly on first pass.

### Completion Notes List

- Backend RBAC: Created `@Roles()` decorator using `SetMetadata` with `UserRole` type from shared package. Created `RolesGuard` implementing opt-in RBAC with `@Public()` bypass, OR logic for multiple roles, and `ForbiddenException` for denied access.
- Guard registration: Registered `RolesGuard` as second `APP_GUARD` after `JwtAuthGuard` in `app.module.ts` to ensure correct execution order.
- Admin endpoint: Created `AdminModule` with `GET /admin/health` protected by `@Roles('ADMIN')`, returns `{ data: { status: 'admin-ok' } }`.
- Backend tests: 10 new tests — 8 for `RolesGuard` (all guard behaviors: no decorator, matching role, non-matching role, OR logic, public endpoints, null user) and 2 for `AdminController` (response format, metadata verification).
- TanStack Router: Installed `@tanstack/react-router` v1.169.2, `@tanstack/router-plugin`, `@tanstack/router-devtools`. Configured Vite plugin, created file-based routes: `__root`, `index` (redirect to `/briefings`), `briefings`, `search`, `admin` (with `beforeLoad` guard), `access-denied`.
- Router integration: Created `router.ts` with typed router context (`user`, `isAuthenticated`). Updated `app.tsx` to use `RouterProvider` with context from `useAuth()`.
- Role utilities: Created `role-layout.ts` with `hasRole()`, `isAdmin()`, `getLayoutVariant()` functions mapping roles to layout variants per UX spec.
- Frontend tests: 18 new tests — 13 for role-layout utilities and 5 for app/router (loading state, authenticated rendering, admin route guard for ADMIN/non-ADMIN/null users).
- Task 6.11 note: `main.tsx` required no changes — router is wired through `App` component which already receives auth context from `AuthProvider`.

### Change Log

- 2026-05-07: Implemented Story 1.4 — RBAC backend (decorator, guard, admin endpoint), TanStack Router frontend (file-based routes, role guards, access-denied page, role utilities). 43 tests passing across monorepo.

### File List

**New Files:**
- `apps/api/src/modules/auth/decorators/roles.decorator.ts`
- `apps/api/src/modules/auth/guards/roles.guard.ts`
- `apps/api/src/modules/auth/guards/roles.guard.spec.ts`
- `apps/api/src/modules/admin/admin.module.ts`
- `apps/api/src/modules/admin/admin.controller.ts`
- `apps/api/src/modules/admin/admin.controller.spec.ts`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/index.tsx`
- `apps/web/src/routes/briefings.tsx`
- `apps/web/src/routes/search.tsx`
- `apps/web/src/routes/admin.tsx`
- `apps/web/src/routes/access-denied.tsx`
- `apps/web/src/router.ts`
- `apps/web/src/routeTree.gen.ts` (auto-generated by TanStack Router plugin)
- `apps/web/src/lib/role-layout.ts`
- `apps/web/src/lib/role-layout.test.ts`

**Modified Files:**
- `apps/api/src/app.module.ts` — added `RolesGuard` as second `APP_GUARD`, imported `AdminModule`
- `apps/api/src/modules/auth/auth.module.ts` — added `RolesGuard` to providers and exports
- `apps/web/vite.config.ts` — added `TanStackRouterVite()` plugin
- `apps/web/src/app.tsx` — replaced placeholder content with `RouterProvider`
- `apps/web/src/app.test.tsx` — rewrote tests for router-based rendering and admin route guards
- `apps/web/package.json` — added `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/router-devtools`
- `pnpm-lock.yaml` — updated lockfile
