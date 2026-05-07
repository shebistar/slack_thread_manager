# Story 1.2: Database Schema & Core Models

Status: done

## Story

As a **developer**,
I want the core database tables (users, roles, workstreams, channels) defined in Drizzle ORM with working migrations,
so that the system can persist team and configuration data.

## Acceptance Criteria

1. **Given** the PostgreSQL database is running, **When** I run `pnpm db:migrate`, **Then** tables are created: `users`, `workstreams`, `slack_channels`, `user_workstreams`.
2. **Given** migrations have run, **Then** the `users` table includes columns: `id` (UUID PK), `email` (text, unique), `display_name` (text), `slack_handle` (text, unique), `slack_nicknames` (text array), `role` (enum: ARCHITECT, PM, CONSULTANT, SALES, TRAINING, ADMIN), `created_at`, `updated_at`.
3. **Given** migrations have run, **Then** the `workstreams` table includes columns: `id` (UUID PK), `name` (text, unique), `description` (text, nullable), `created_at`.
4. **Given** migrations have run, **Then** the `slack_channels` table includes columns: `id` (UUID PK), `slack_channel_id` (text, unique), `name` (text), `workstream_id` (FK → workstreams.id), `is_active` (boolean, default true), `created_at`.
5. **Given** migrations have run, **Then** the `user_workstreams` join table includes columns: `user_id` (FK → users.id), `workstream_id` (FK → workstreams.id), with a composite PK.
6. **Given** the database and migrations are in place, **When** I run `pnpm db:seed`, **Then** sample workstreams, users (one per role), and channel mappings are created for local testing.
7. **Given** the schema is defined, **Then** Zod schemas for `users`, `workstreams`, `slack_channels`, and `user_workstreams` exist in `packages/shared/src/schemas/` and are exported from the package index.

## Tasks / Subtasks

- [x] Task 1: Define Drizzle schema files in `packages/db/src/schema/` (AC: #1, #2, #3, #4, #5)
  - [x] 1.1: Create `packages/db/src/schema/users.ts` — define `userRoleEnum` and `users` table
  - [x] 1.2: Create `packages/db/src/schema/workstreams.ts` — define `workstreams` and `user_workstreams` tables
  - [x] 1.3: Create `packages/db/src/schema/channels.ts` — define `slack_channels` table
  - [x] 1.4: Update `packages/db/src/schema/index.ts` to export all schemas and enums

- [x] Task 2: Generate and apply the database migration (AC: #1)
  - [x] 2.1: Run `pnpm db:generate` — drizzle-kit auto-generates the SQL migration file
  - [x] 2.2: Verify the generated SQL creates `user_role` enum + all 4 tables with correct columns, constraints, and indexes
  - [x] 2.3: Run `pnpm db:migrate` — apply migration to the running PostgreSQL instance
  - [x] 2.4: Confirm all 4 tables exist with correct schema (`\d users` etc. in psql or equivalent)

- [x] Task 3: Add seed script for local development (AC: #6)
  - [x] 3.1: Add `tsx` to `packages/db` devDependencies (`pnpm --filter @slack-thread-manager/db add -D tsx`)
  - [x] 3.2: Add `"seed": "tsx src/seed.ts"` to `packages/db/package.json` scripts
  - [x] 3.3: Create `packages/db/src/seed.ts` — insert sample workstreams, one user per role, channels, and user_workstream links
  - [x] 3.4: Run `pnpm db:seed` and confirm seed data is present

- [x] Task 4: Create Zod schemas in `packages/shared` (AC: #7)
  - [x] 4.1: Create `packages/shared/src/schemas/user.schema.ts` — `UserRole` enum, `createUserSchema`, `userSchema`
  - [x] 4.2: Create `packages/shared/src/schemas/workstream.schema.ts` — `createWorkstreamSchema`, `workstreamSchema`
  - [x] 4.3: Create `packages/shared/src/schemas/channel.schema.ts` — `createChannelSchema`, `channelSchema`
  - [x] 4.4: Update `packages/shared/src/schemas/index.ts` to export all new schemas
  - [x] 4.5: Update `packages/shared/src/types/index.ts` to export inferred TypeScript types

- [x] Task 5: Write tests for Zod schemas (AC: #7)
  - [x] 5.1: Create `packages/shared/src/schemas/user.schema.spec.ts` — valid/invalid parse tests for `createUserSchema` and `UserRole` enum
  - [x] 5.2: Create `packages/shared/src/schemas/workstream.schema.spec.ts` — valid/invalid parse tests
  - [x] 5.3: Create `packages/shared/src/schemas/channel.schema.spec.ts` — valid/invalid parse tests
  - [x] 5.4: Add `vitest.config.ts` to `packages/shared` and update `package.json` with `"test": "vitest run"` script
  - [x] 5.5: Run `pnpm test` — all Zod schema tests pass

## Dev Notes

### Critical Architecture Constraints

**Source:** [architecture.md — Implementation Patterns & Consistency Rules]

- **DB naming:** Tables = `snake_case plural` (`users`, `slack_channels`); Columns = `snake_case` (`created_at`, `workstream_id`); Enum DB type = `snake_case` (`user_role`); Enum values = `UPPER_CASE` (`ARCHITECT`, `PM`)
- **Drizzle auto-maps:** snake_case DB columns → camelCase TypeScript properties automatically. Define in snake_case; consume in camelCase. No manual mapping.
- **Schema location:** Individual files per domain in `packages/db/src/schema/`. Must all be exported from `packages/db/src/schema/index.ts` — drizzle.config.ts points to this index for migration generation.
- **Zod schemas:** Must live in `packages/shared/src/schemas/`. Name format: `camelCaseSchema` (e.g., `createUserSchema`, `userSchema`). NEVER define duplicate types in `apps/api` or `apps/web`.
- **Tests:** Colocated — `*.spec.ts` next to the file it tests. NEVER create separate `__tests__/` directories.

### Drizzle ORM v0.41.0 Patterns

**Source:** [drizzle-orm docs — PostgreSQL column types, Story 1.1 learnings]

**Imports:**
```typescript
import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, primaryKey
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
```

**pgEnum (user_role):**
```typescript
export const userRoleEnum = pgEnum('user_role', [
  'ARCHITECT', 'PM', 'CONSULTANT', 'SALES', 'TRAINING', 'ADMIN'
]);
```
> The enum DB type name `user_role` uses snake_case. Values use UPPER_CASE.
> MUST be exported from `schema/index.ts` alongside tables — drizzle-kit needs it for migration.

**Text array (slack_nicknames):**
```typescript
slackNicknames: text('slack_nicknames').array().notNull().default([]),
```

**UUID primary key:**
```typescript
id: uuid('id').primaryKey().defaultRandom(),
```

**Timestamps:**
```typescript
createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
```
> `updatedAt` is NOT auto-updated by PostgreSQL — either use a trigger or update it in application code. For V1, update in the service layer.

**Foreign key:**
```typescript
workstreamId: uuid('workstream_id').notNull().references(() => workstreams.id),
```

**Composite primary key (join table):**
```typescript
export const userWorkstreams = pgTable('user_workstreams', {
  userId: uuid('user_id').notNull().references(() => users.id),
  workstreamId: uuid('workstream_id').notNull().references(() => workstreams.id),
}, (table) => [
  primaryKey({ columns: [table.userId, table.workstreamId] }),
]);
```

**Drizzle Relations (optional but recommended for query API):**
```typescript
export const usersRelations = relations(users, ({ many }) => ({
  userWorkstreams: many(userWorkstreams),
}));
```

### Migration Approach

**Source:** [Story 1.1 learnings — drizzle-kit generate]

- **Auto-generate** from schema changes: `pnpm db:generate` → creates SQL in `packages/db/src/migrations/`
- **Apply migration:** `pnpm db:migrate` (drizzle-kit migrate)
- The existing migration `0000_enable_pgvector.sql` is already applied. The new migration will be `0001_*.sql`.
- `drizzle.config.ts` points to `./src/schema/index.ts` — all tables and enums MUST be exported there.
- The migration journal version is `"7"` — do NOT manually edit `meta/_journal.json`.
- **DO NOT use `pnpm db:push`** (bypasses journal tracking — unsafe for team workflows).

### Seed Script Pattern

**Source:** [architecture.md — packages/db/src/seed.ts]

```typescript
// packages/db/src/seed.ts
import { createDb } from './client.js';

const db = createDb(process.env.DATABASE_URL!);

async function seed() {
  // Insert in dependency order: workstreams → users → channels → user_workstreams
  // Use INSERT ... ON CONFLICT DO NOTHING for idempotent seeds
  // Call db.close() in finally block
}

seed()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
```

**Required seed data:**
- 3 workstreams: e.g., `vm-migration`, `infrastructure`, `onboarding`
- 6 users — one per role (ARCHITECT, PM, CONSULTANT, SALES, TRAINING, ADMIN) with realistic display names, emails, and slack handles
- 2–3 channels mapped to workstreams
- user_workstream links (each user assigned to at least one workstream)

**Environment:** seed requires `DATABASE_URL` env var. Run after `podman-compose up -d`.

### Zod Schema Conventions

**Source:** [architecture.md — Data Validation; packages/shared conventions]

```typescript
// packages/shared/src/schemas/user.schema.ts
import { z } from 'zod';

export const UserRole = z.enum([
  'ARCHITECT', 'PM', 'CONSULTANT', 'SALES', 'TRAINING', 'ADMIN'
]);
export type UserRole = z.infer<typeof UserRole>;

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
  slackHandle: z.string().min(1).max(100),
  slackNicknames: z.array(z.string()).default([]),
  role: UserRole,
});
export type CreateUser = z.infer<typeof createUserSchema>;

export const userSchema = createUserSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;
```

> `UserRole` is exported as both a Zod schema and a TypeScript type — this is the canonical source for the role enum across the entire monorepo.

### Vitest for `packages/shared`

**Source:** [Story 1.1 learnings — apps/api vitest.config.ts]

`packages/shared` needs its own `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
```

Add vitest to packages/shared devDependencies:
```
pnpm --filter @slack-thread-manager/shared add -D vitest
```

Update turbo.json if needed — the `test` pipeline task already cascades from `^build`, so `packages/shared` tests will run via `pnpm test`.

### Files Being Created (NEW)

```
packages/db/src/schema/users.ts          — userRoleEnum + users table + relations
packages/db/src/schema/workstreams.ts    — workstreams + user_workstreams tables + relations
packages/db/src/schema/channels.ts       — slack_channels table + relations
packages/db/src/seed.ts                  — development seed data
packages/shared/src/schemas/user.schema.ts
packages/shared/src/schemas/workstream.schema.ts
packages/shared/src/schemas/channel.schema.ts
packages/shared/src/schemas/user.schema.spec.ts
packages/shared/src/schemas/workstream.schema.spec.ts
packages/shared/src/schemas/channel.schema.spec.ts
packages/shared/vitest.config.ts
packages/db/src/migrations/0001_*.sql    — auto-generated by drizzle-kit
```

### Files Being Updated (EXISTING)

```
packages/db/src/schema/index.ts          — currently empty; must export all tables, enums, relations
packages/db/package.json                 — add "seed" script + tsx devDependency
packages/shared/src/schemas/index.ts     — currently empty; export all new schemas
packages/shared/src/types/index.ts       — export inferred TypeScript types
packages/shared/package.json             — add vitest devDependency + test script
```

### Anti-Patterns to Avoid

**Source:** [architecture.md — Anti-Patterns; Story 1.1 learnings]

- **DO NOT** use `pnpm db:push` — it bypasses migration journal
- **DO NOT** define the `UserRole` enum in `apps/api` or `apps/web` — it lives in `packages/shared`
- **DO NOT** use camelCase for table names (`userWorkstreams`) — DB tables are snake_case (`user_workstreams`)
- **DO NOT** create a separate `__tests__/` directory — colocate `*.spec.ts` files
- **DO NOT** use `console.log` in seed script in production-bound code — acceptable in seed since it's dev-only
- **DO NOT** manually edit `meta/_journal.json` — drizzle-kit manages this
- **DO NOT** forget to export enums from `schema/index.ts` — drizzle-kit won't include them in migrations otherwise

### Foreign Key Cascade Behavior

For V1, do not define `onDelete` cascade rules on FKs — leave as the PostgreSQL default (RESTRICT). This is intentional: if a workstream is deleted, the system should fail loudly rather than silently cascade deletes to channels or user_workstreams. Define explicit cascade rules in the stories where the admin CRUD operations are built (Stories 1.6 and 1.7).

### Index Strategy

Per architecture, always index foreign keys. Add these indexes in the schema definitions:
```typescript
// Example in pgTable options
(table) => [
  index('idx_slack_channels_workstream_id').on(table.workstreamId),
  index('idx_user_workstreams_user_id').on(table.userId),
  index('idx_user_workstreams_workstream_id').on(table.workstreamId),
  uniqueIndex('idx_users_email').on(table.email),
  uniqueIndex('idx_users_slack_handle').on(table.slackHandle),
  uniqueIndex('idx_slack_channels_slack_channel_id').on(table.slackChannelId),
]
```

Import `index`, `uniqueIndex` from `drizzle-orm/pg-core`.

### Previous Story Learnings (Story 1.1)

**Source:** [Story 1.1 Dev Agent Record]

- **Drizzle version in use:** `drizzle-orm@^0.41.0`, `drizzle-kit@^0.31.0` — NOT the 0.31 mentioned in the architecture doc's decision table. Use what's in `packages/db/package.json`.
- **pg Pool client:** `createDb()` in `packages/db/src/client.ts` already works and is the canonical way to get a DB connection. Seed script MUST use `createDb()` and call `db.close()` when done to avoid connection leaks.
- **Migration journal v7:** drizzle-kit currently uses journal version 7. New migrations append to `meta/_journal.json`.
- **`podman-compose`** is used, not `docker-compose` (confirmed in Story 1.1). Seed docs should reference `podman-compose up -d`.
- **Test runner:** vitest with `globals: true`. Tests use `describe`, `it`/`test`, `expect` without imports.
- **Zod version:** `zod@^3.24.0` is in `packages/shared` — all Zod v3 APIs apply.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-scaffold-and-development-environment.md#Dev Notes]
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-scaffold-and-development-environment.md#Completion Notes]
- [Source: drizzle-orm docs — PostgreSQL column types (May 2026)]

### Review Findings

- [x] [Review][Decision] Slack channel ID regex scope — relaxed to `z.string().min(1).max(20)` (presence-only); strict regex removed [`packages/shared/src/schemas/channel.schema.ts`]
- [x] [Review][Patch] `onConflictDoNothing().returning()` positional destructuring assigns wrong workstream IDs when any row conflicts — fixed: insert then re-query by name [`packages/db/src/seed.ts`]
- [x] [Review][Patch] `userMap` built from full `select()` fallback is non-deterministic when DB has extra users per role — fixed: re-query by seed emails only [`packages/db/src/seed.ts`]
- [x] [Review][Patch] `process.exit(0/1)` fires before `finally(() => db.close())` — fixed: async IIFE with try/catch/finally ensures `await db.close()` runs before exit [`packages/db/src/seed.ts`]
- [x] [Review][Patch] Empty `assignments` array silently passed to `db.insert(userWorkstreams).values([])` — fixed: guard throws with clear error if no assignments resolved [`packages/db/src/seed.ts`]
- [x] [Review][Defer] `updatedAt` has no DB trigger or enforced app-layer update pattern — track in service layer implementation [`packages/db/src/schema/users.ts`] — deferred, pre-existing
- [x] [Review][Defer] `usersRelations` defined in `workstreams.ts` not `users.ts` — intentional circular-dep resolution, documented in debug log [`packages/db/src/schema/workstreams.ts`] — deferred, pre-existing
- [x] [Review][Defer] `z.string().datetime()` does not enforce timezone offset — may diverge from `timestamptz` serialization edge cases [`packages/shared/src/schemas/`] — deferred, pre-existing
- [x] [Review][Defer] `updateUserSchema` cannot express "clear slackNicknames to []" via null/omit — no update endpoints exist yet [`packages/shared/src/schemas/user.schema.ts`] — deferred, pre-existing
- [x] [Review][Defer] `tsx` in `devDependencies` — seed unavailable with `--omit=dev` production installs [`packages/db/package.json`] — deferred, pre-existing

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (Cursor Agent)

### Debug Log References

- Circular dependency avoided in schema files: `users.ts` has no imports from other schema files; `workstreams.ts` imports `users`; `channels.ts` imports `workstreams`. Relations for `users ↔ userWorkstreams` defined in `workstreams.ts` (the file that owns `userWorkstreams`).
- `pnpm db:migrate` silently fails in sandboxed environment (network restriction). Run with `required_permissions: ["all"]` or directly via `DATABASE_URL=... npx drizzle-kit migrate` in `packages/db`.
- `drizzle-kit` generated migration as `0001_outstanding_zuras.sql` — journal version 7, appended correctly to `meta/_journal.json`.

### Completion Notes List

- Drizzle ORM schema: 4 tables (`users`, `workstreams`, `user_workstreams`, `slack_channels`) + `user_role` pgEnum with 6 values
- Migration `0001_outstanding_zuras.sql` generated and applied — all 4 tables verified in PostgreSQL
- Seed script creates 3 workstreams, 6 users (one per role), 3 channels, and 9 user-workstream assignments; idempotent (`ON CONFLICT DO NOTHING`)
- Added `tsx` to `packages/db` devDependencies for seed script execution
- Zod schemas in `packages/shared`: `user.schema.ts`, `workstream.schema.ts`, `channel.schema.ts` — `UserRole` is the canonical role enum across the monorepo
- 31 Zod schema tests pass (3 spec files); full regression suite: 33 tests, 5 packages, all green
- No lint errors; TypeScript strict mode passes on all new files

### Change Log

- 2026-05-07: Story 1.2 implemented — Drizzle schema (4 tables), migration applied, seed script, Zod schemas (3 files), 31 tests

### File List

packages/db/src/schema/users.ts
packages/db/src/schema/workstreams.ts
packages/db/src/schema/channels.ts
packages/db/src/schema/index.ts
packages/db/src/seed.ts
packages/db/src/migrations/0001_outstanding_zuras.sql
packages/db/src/migrations/meta/_journal.json
packages/db/src/migrations/meta/0001_snapshot.json
packages/db/package.json
packages/shared/src/schemas/user.schema.ts
packages/shared/src/schemas/workstream.schema.ts
packages/shared/src/schemas/channel.schema.ts
packages/shared/src/schemas/user.schema.spec.ts
packages/shared/src/schemas/workstream.schema.spec.ts
packages/shared/src/schemas/channel.schema.spec.ts
packages/shared/src/schemas/index.ts
packages/shared/src/types/index.ts
packages/shared/vitest.config.ts
packages/shared/package.json
