# Deferred Work

## Deferred from: code review of 3-4-thread-summarization (2026-05-08)

- "isolates failures" test in `runSummarization` doesn't assert `markFailed` was called for the failing thread — incomplete assertion, not a bug [`apps/api/src/modules/pipeline/pipeline.service.spec.ts`]
- `allUsers` query omits `id` column that the spec lists — currently unused in `buildParticipantRoster`; add when participant ID tracking is needed downstream [`apps/api/src/modules/pipeline/pipeline.service.ts:122`]

## Deferred from: code review of 3-2-pipeline-state-machine-and-failure-tracking (2026-05-08)

- Circular import between `pipeline-state.ts` and `threads.ts` — works due to ESM lazy FK pattern (`() => slackThreads.id`) but adds fragility; refactor if schema files grow or if build tools report cycle warnings [`packages/db/src/schema/pipeline-state.ts`, `packages/db/src/schema/threads.ts`]
- `pipeline_runs` table has no index on `started_at` — `getLatestRuns` uses `orderBy(desc(startedAt))` which is a sequential scan; fine at MVP volume with ~100s of runs; add index when run history grows past 10K [`packages/db/src/schema/pipeline-state.ts`]
- `pipeline_failures.thread_id` FK has no `ON DELETE CASCADE` — FK constraint prevents thread deletion while failures exist; current behavior is safe (failures preserved for debugging); add cascade when thread lifecycle management (cleanup/archival) is implemented [`packages/db/src/schema/pipeline-state.ts`]
- Unicode `→` character in `InvalidStateTransitionError` message — may cause encoding issues in some log aggregation systems that don't handle UTF-8 properly; replace with `->` if log ingestion issues arise [`apps/api/src/modules/pipeline/pipeline.errors.ts`]

## Deferred from: code review of 3-1-llm-abstraction-layer-and-provider-interface (2026-05-08)

- `LlmService.embed()` delegates to primary only with no Gemini fallback — by spec design; dev notes explicitly defer embedding fallback; revisit when embedding pipeline is production-critical [`apps/api/src/modules/pipeline/llm/llm.service.ts`]
- Batch fallback counters (`batchTotal`, `batchFallback`) can miscount under concurrent `complete()` calls — single-process architecture assumption holds for now; add mutex/scoped-batch-context when horizontal scaling is needed [`apps/api/src/modules/pipeline/llm/llm.service.ts`]
- Up to 80 chars of prompt content included in error-level log when all providers fail — operational/security policy decision; redact or hash when log retention/compliance policy is formalized [`apps/api/src/modules/pipeline/llm/llm.service.ts`]
- CPU model provider has no `CPU_MODEL_API_KEY` auth header support — local inference assumed network-isolated; add optional bearer token env var when Ollama is exposed to non-localhost [`apps/api/src/modules/pipeline/llm/providers/cpu-model.provider.ts`]
- Gemini safety blocks and no-text responses treated as transport errors (caught, retried, then `LlmPendingRetryError`) — current behavior is safe but not explicitly handled; distinguish blocked vs failed responses when prompt safety monitoring is added [`apps/api/src/modules/pipeline/llm/providers/gemini.provider.ts`]
- `GeminiProvider` initializes `GoogleGenerativeAI` with empty string when `GEMINI_API_KEY` is absent — first API call fails and propagates up to retry chain as expected; no startup crash by design [`apps/api/src/modules/pipeline/llm/providers/gemini.provider.ts`]

## Deferred from: code review of 2-2-thread-ingestion-and-storage (2026-05-07)

- Zod schema `z.string().datetime()` for `createdAt`/`updatedAt` in `slackThreadSchema` will not match Drizzle `Date` objects if used to validate DB results directly — not consumed for that purpose yet; align when API response contracts are formalized [`packages/shared/src/schemas/thread.schema.ts`]

## Deferred from: code review of 1-6-team-roster-management (2026-05-07)

- `createDb('')` on missing `DATABASE_URL` silently defers crash to first query instead of failing at startup — pre-existing config pattern across the DatabaseModule [`apps/api/src/database/database.module.ts`]
- PII (email addresses) logged in roster service `create`/`update` success paths — pre-existing `Logger.log` pattern; revisit when logging/retention policy is formalized [`apps/api/src/modules/admin/roster/roster.service.ts`]
- `useWorkstreams()` error is swallowed in admin.tsx (`= []` default) with no error display — workstream dropdown silently appears empty on failure [`apps/web/src/routes/admin.tsx:61`]

## Deferred from: code review of 1-5-dashboard-shell-and-navigation (2026-05-07)

- `startsWith` active matching in NavBar could false-positive on routes sharing a prefix (e.g. `/briefings-archive` matches `/briefings`) — no current routes affected; revisit when new routes are added [`apps/web/src/components/layout/nav-bar.tsx:29`]
- `useAuth()` called inside `RootLayout` creates an implicit `AuthProvider` dependency; the root route component cannot be rendered in tests that bypass `AuthProvider` — by design per spec; consider passing `logout` through router context in a future refactor [`apps/web/src/routes/__root.tsx:18`]

## Deferred from: code review of 1-4-role-based-access-control-and-route-guards (2026-05-07)

- Missing role claim in JWT silently defaults to `CONSULTANT` with no warning — `auth-context.tsx` uses `payload.role ?? 'CONSULTANT'`; add a `console.warn` or structured log when role is absent from token payload [`apps/web/src/auth/auth-context.tsx`]
- Logout button removed from `app.tsx` with no replacement — sign-out is inaccessible until the story 1.5 navigation bar is implemented; track for story 1.5 [`apps/web/src/app.tsx`]
- AC4 nav item deferred — "conditionally render the Admin navigation item (visible only to ADMIN role)" not implemented; role utilities and route guard are in place; story 1.5 must build the Admin nav item in the navigation bar [`apps/web/src/routes/__root.tsx`]

## Deferred from: code review of 1-2-database-schema-and-core-models (2026-05-07)

- `updatedAt` has no DB trigger or enforced app-layer update pattern — implement auto-update in service layer when update endpoints are built [`packages/db/src/schema/users.ts`]
- `usersRelations` defined in `workstreams.ts` not `users.ts` — intentional circular-dep resolution; revisit if schema is refactored into a single file or Drizzle adds lazy-relation support [`packages/db/src/schema/workstreams.ts`]
- `z.string().datetime()` does not enforce timezone offset — may diverge from `timestamptz` serialization; standardize on `.datetime({ offset: true })` when API contracts are formalized [`packages/shared/src/schemas/`]
- `updateUserSchema` cannot express "clear slackNicknames to []" via null/omit — add explicit nullable handling when PATCH endpoint for users is implemented [`packages/shared/src/schemas/user.schema.ts`]
- `tsx` in `devDependencies` — seed unavailable with `--omit=dev` production installs; move to `dependencies` or document that seed is strictly a dev-environment script [`packages/db/package.json`]

## Deferred from: code review of stories 2-4 and 2-5 (2026-05-08)

- `detectUpdatedThreads` makes N `conversations.replies(limit:1)` calls per stored thread with no activity filter or pagination — acceptable at current ~100s thread volume; add last-activity filter or batching before scaling to 1000s of threads [`apps/api/src/modules/ingestion/ingestion.service.ts:186`]
- `jobs` Map in `BackfillService` grows unboundedly with no TTL or eviction — V1 in-memory simplification; replace with persistent `pipeline_runs` table in Story 3.2 [`apps/api/src/modules/ingestion/backfill.service.ts:25`]
- No concurrency guard prevents simultaneous backfill jobs on same channels — single-admin scenario; upsert semantics protect data integrity; add guard if admin count grows [`apps/api/src/modules/ingestion/backfill.service.ts:40`]
- `oldestTs` validated only as `min(1)` — Slack will reject invalid timestamp formats but validation boundary is at the API layer not the controller; add `.regex(/^\d+\.\d+$/)` when formalizing contracts [`packages/shared/src/schemas/backfill.schema.ts`]

## Deferred from: code review of 2-3-batch-polling-job-with-watermark (2026-05-08)

- No mutex against overlapping cron runs — long batches can run concurrently with the next tick; add `if (this.busy) return` guard or configure `@Cron` with `disableOverlap` when available [`apps/api/src/modules/ingestion/polling.job.ts`]
- No distributed lock for horizontal scaling — multiple API replicas poll the same channels in parallel; add advisory DB lock or queue-based deduplication before scaling horizontally [`apps/api/src/modules/ingestion/polling.job.ts`]
- NestJS Logger structured JSON depends on logger config — second-arg object may serialize as `[Object]` with default logger; switch to JSON logger or custom formatter in production [`apps/api/src/modules/ingestion/polling.job.ts`]
- `lastBatchStatus` semantics ambiguous for zero-channel runs — zero-channel batch reports `success`; consider a `no-channels` or `skipped` status [`apps/api/src/modules/ingestion/polling.job.ts`]
- Watermark uses DB `now()` not last-message-ts — messages posted during the ingestion window can be skipped; consider setting watermark to last ingested message timestamp instead [`apps/api/src/modules/ingestion/polling.job.ts`]
- No cron expression validation — invalid `INGESTION_CRON_SCHEDULE` string fails at runtime; add Zod `.refine()` to validate cron syntax at startup [`apps/api/src/config/app.config.ts`]
- Migration rollback strategy not documented — add explicit down-migration for `last_polled_ts` column for rolling deployments [`packages/db/src/migrations/0004_futuristic_whirlwind.sql`]

## Deferred from: code review of 3-3-thread-classification (2026-05-08)

- `startRun()` in `PipelineService.runClassification()` has no error guard — a DB failure during run startup leaves the batch untracked with no `completeRun()` call [`apps/api/src/modules/pipeline/pipeline.service.ts:55`]

## Deferred from: code review of 3-5-thread-embedding-generation (2026-05-08)

- `row!` non-null assertion after `.returning()` — pre-existing pattern consistent with classifier/summarizer processors; no regression [`apps/api/src/modules/pipeline/processors/embedder.processor.ts:73`]
- Missing EOF newline in migration SQL — cosmetic POSIX compliance issue, no functional impact [`packages/db/src/migrations/0010_skinny_raider.sql:11`]
- JSONB shape cast without runtime validation in `buildEmbeddingInput` — pre-existing pattern consistent with how technicalSummary/plainSummary are accessed throughout the pipeline [`apps/api/src/modules/pipeline/processors/embedder.processor.ts:79-80`]

## Deferred from: code review of 1-1-monorepo-scaffold-and-development-environment (2026-05-06)

- `unplugin-swc` CJS deprecation warning on every `pnpm test` run — cosmetic upstream Vite/unplugin-swc issue; address when unplugin-swc cuts an ESM-first release [`apps/api/vitest.config.ts`]
- Health endpoint returns untyped object literal with no response DTO — fine for scaffold; define response types when API contracts are formalized in Story 1.5+ [`apps/api/src/app.controller.ts`]
