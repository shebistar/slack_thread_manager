# Deferred Work

## Deferred from: code review of 1-2-database-schema-and-core-models (2026-05-07)

- `updatedAt` has no DB trigger or enforced app-layer update pattern — implement auto-update in service layer when update endpoints are built [`packages/db/src/schema/users.ts`]
- `usersRelations` defined in `workstreams.ts` not `users.ts` — intentional circular-dep resolution; revisit if schema is refactored into a single file or Drizzle adds lazy-relation support [`packages/db/src/schema/workstreams.ts`]
- `z.string().datetime()` does not enforce timezone offset — may diverge from `timestamptz` serialization; standardize on `.datetime({ offset: true })` when API contracts are formalized [`packages/shared/src/schemas/`]
- `updateUserSchema` cannot express "clear slackNicknames to []" via null/omit — add explicit nullable handling when PATCH endpoint for users is implemented [`packages/shared/src/schemas/user.schema.ts`]
- `tsx` in `devDependencies` — seed unavailable with `--omit=dev` production installs; move to `dependencies` or document that seed is strictly a dev-environment script [`packages/db/package.json`]

## Deferred from: code review of 1-1-monorepo-scaffold-and-development-environment (2026-05-06)

- `unplugin-swc` CJS deprecation warning on every `pnpm test` run — cosmetic upstream Vite/unplugin-swc issue; address when unplugin-swc cuts an ESM-first release [`apps/api/vitest.config.ts`]
- Health endpoint returns untyped object literal with no response DTO — fine for scaffold; define response types when API contracts are formalized in Story 1.5+ [`apps/api/src/app.controller.ts`]
