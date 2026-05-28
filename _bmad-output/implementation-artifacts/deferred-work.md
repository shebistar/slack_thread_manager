# Deferred Work

> **Last triaged**: 2026-05-12 (post-Epic 5 retrospective)
>
> Disposition key: **FIX NOW** = resolve before Epic 6 starts · **CREATE STORY** = too large for a quick fix, needs its own story · **FIX DURING E6** = naturally fits into an Epic 6 story · **DEPRIORITIZED** = formally accepted as not-now (trigger condition documented) · **RESOLVED** = done · **MOOT** = no longer applicable

---

## Triage: FIX NOW (before Epic 6) — ALL RESOLVED 2026-05-12

- [x] **[S1]** ~~PII (email addresses) logged in roster service~~ — **RESOLVED**: Log statements now use `displayName` / `id` instead of email [`apps/api/src/modules/admin/roster/roster.service.ts`]
- [x] **[B1]** ~~Admin pipeline endpoint chains 7+ stages synchronously with no timeout~~ — **RESOLVED**: Each stage wrapped in `runStage()` with error isolation, timing, and configurable `PIPELINE_TIMEOUT_MS` (default 240s). Response includes `_meta` with `totalDurationMs` and `timedOut` flag. [`apps/api/src/modules/admin/admin.controller.ts`]
- [x] **[B3]** ~~`createDb('')` on missing `DATABASE_URL` silently defers crash~~ — **RESOLVED**: DatabaseModule now throws `Error('DATABASE_URL is required but not set')` at startup [`apps/api/src/database/database.module.ts`]
- [x] **[D2]** ~~`tsx` in `devDependencies`~~ — **RESOLVED**: Moved to `dependencies` [`packages/db/package.json`]
- [x] **[U4]** ~~`useWorkstreams()` error swallowed in admin.tsx~~ — **RESOLVED**: Error display added in both RosterTabContent and ChannelsTabContent [`apps/web/src/routes/admin.tsx`]
- [x] **[U5]** ~~Missing role claim defaults to CONSULTANT silently~~ — **RESOLVED**: `console.warn` added when JWT lacks `role` claim [`apps/web/src/auth/auth-context.tsx`]
- [x] **[P11]** ~~`startRun()` in `runClassification()` has no error guard~~ — **RESOLVED**: Wrapped in try-catch; failure logs error and returns `{ failed: threads.length }` [`apps/api/src/modules/pipeline/pipeline.service.ts`]

## Triage: CREATE STORY

Items that need dedicated implementation scope.

- [ ] **[S2]** Prompt injection surface — untrusted thread text and blocklist terms interpolated into LLM system prompt; needs dedicated LLM-hardening story [`apps/api/src/modules/pipeline/llm/prompts/detect-entities.prompt.ts:14-18`] *(from: Epic 4, code review of 4-2)*
- [ ] **[U1]** Route-level tests absent for all 3 briefing layouts (Dashboard, News Feed, Split Panel) — need route test infrastructure [`apps/web/src/routes/briefings.tsx`] *(from: Epic 5, code reviews of 5-2 and 5-4)*

## Triage: FIX DURING EPIC 6

Items that naturally fit into Epic 6 stories.

- [x] **[B2]** ~~pgvector HNSW index not created~~ — **RESOLVED in Story 6.2**: `idx_thread_embeddings_hnsw` confirmed present in `packages/db/src/schema/embeddings.ts` (lines 18–21) and migration `packages/db/src/migrations/0010_skinny_raider.sql` (line 11). Uses `USING hnsw (embedding vector_cosine_ops)` with default `m=16` / `ef_construction=64`, adequate for MVP scale (~100–1000 threads). `VectorSearchService` uses `<=>` operator directly (never `1 - <=>`) to preserve index usage. *(from: Epic 3, Story 3.5; resolved: Story 6.2)*

---

## Triage: DEPRIORITIZED

Formally accepted as not-now. Each item has a documented trigger condition for when to revisit.

### Security / Compliance

- **[S3]** Up to 80 chars of prompt content in error-level logs — **Trigger**: when log retention/compliance policy is formalized [`apps/api/src/modules/pipeline/llm/llm.service.ts`] *(from: Epic 3, code review of 3-1)*

### Frontend / UX

- **[U2]** Enum style mismatch: Zod SCREAMING_SNAKE vs API snake_case — **Trigger**: when shared schema contracts are formalized [`packages/shared/src/schemas/briefing.schema.ts:3`] *(from: Epic 5, code review of 5-2)*
- **[U3]** Workstream "latest activity" timestamp not in schema — **Trigger**: when Dashboard layout refresh is needed *(from: Epic 5)*
- **[U6]** `startsWith` NavBar active matching could false-positive — **Trigger**: when new routes sharing a prefix are added [`apps/web/src/components/layout/nav-bar.tsx:29`] *(from: Epic 1, code review of 1-5)*

### Data Integrity / ORM

- **[D1]** `updatedAt` no auto-update pattern — **Trigger**: when update endpoints are built [`packages/db/src/schema/users.ts`] *(from: Epic 1, code review of 1-2)*
- **[D3]** FK `ON DELETE NO ACTION` on topic_correlations — **Trigger**: when thread deletion/archival is implemented [`packages/db/src/migrations/0011_colorful_clint_barton.sql`] *(from: Epic 3, code review of 3-6)*
- **[D4]** `pipeline_runs` table no index on `started_at` — **Trigger**: when run history grows past 10K [`packages/db/src/schema/pipeline-state.ts`] *(from: Epic 3, code review of 3-2)*
- **[D5]** `pipeline_failures.thread_id` FK no CASCADE — **Trigger**: when thread lifecycle management is implemented [`packages/db/src/schema/pipeline-state.ts`] *(from: Epic 3, code review of 3-2)*
- **[D6]** Circular import between `pipeline-state.ts` and `threads.ts` — **Trigger**: if build tools report cycle warnings [`packages/db/src/schema/pipeline-state.ts`, `packages/db/src/schema/threads.ts`] *(from: Epic 3, code review of 3-2)*
- **[D7]** `z.string().datetime()` doesn't enforce timezone offset — **Trigger**: when API contracts are formalized [`packages/shared/src/schemas/`] *(from: Epic 1, code review of 1-2)*
- **[D8]** Zod schema `datetime()` vs Drizzle `Date` mismatch — **Trigger**: when DB results are validated with Zod [`packages/shared/src/schemas/thread.schema.ts`] *(from: Epic 2, code review of 2-2)*

### Pipeline / LLM Quality

- **[P1]** Substring/alias gap in entity dedup vs blocklist — **Trigger**: when false positive volume data is available [`apps/api/src/modules/pipeline/anonymization/llm-entity-detector.processor.ts:88`] *(from: Epic 4, code review of 4-2)*
- **[P2]** Sequential LLM calls in entity detector — **Trigger**: when thread counts exceed ~50 [`apps/api/src/modules/pipeline/anonymization/llm-entity-detector.processor.ts:73`] *(from: Epic 4, code review of 4-2)*
- **[P3]** `threadsProcessed` counts inputs not successes — **Trigger**: when observability is formalized [`apps/api/src/modules/pipeline/anonymization/llm-entity-detector.processor.ts:124`] *(from: Epic 4, code review of 4-2)*
- **[P5]** `embed()` fallback to Gemini (primary-only by design) — **Trigger**: when embedding pipeline is production-critical [`apps/api/src/modules/pipeline/llm/llm.service.ts`] *(from: Epic 3, code review of 3-1)*
- **[P6]** Batch fallback counter concurrency safety — **Trigger**: when horizontal scaling is needed [`apps/api/src/modules/pipeline/llm/llm.service.ts`] *(from: Epic 3, code review of 3-1)*
- **[P7]** Race condition in `upsertCorrelation` — **Trigger**: when concurrent correlator runs exist [`apps/api/src/modules/pipeline/processors/correlator.processor.ts:229-247`] *(from: Epic 3, code review of 3-6)*
- **[P8]** O(n²) participant overlap + unbounded `threadIds` — **Trigger**: when production data grows past MVP scale [`apps/api/src/modules/pipeline/processors/correlator.processor.ts`] *(from: Epic 3, code review of 3-6)*
- **[P9]** No minimum threshold for participant overlap — **Trigger**: when correlation noise is observed at scale [`apps/api/src/modules/pipeline/processors/correlator.processor.ts:168-193`] *(from: Epic 3, code review of 3-6)*
- **[P10]** Topic match coarse label quality — **Trigger**: when normalization/case-folding is needed [`apps/api/src/modules/pipeline/processors/correlator.processor.ts:130-166`] *(from: Epic 3, code review of 3-6)*

### Infrastructure / Scaling

- **[I1]** No distributed lock for horizontal scaling (polling) — **Trigger**: before horizontal scaling [`apps/api/src/modules/ingestion/polling.job.ts`] *(from: Epic 2, code review of 2-3)*
- **[I2]** CPU model auth header for non-localhost Ollama — **Trigger**: when Ollama is exposed to network [`apps/api/src/modules/pipeline/llm/providers/cpu-model.provider.ts`] *(from: Epic 3, code review of 3-1)*
- **[I3]** Gemini safety block distinction — **Trigger**: when prompt safety monitoring is added [`apps/api/src/modules/pipeline/llm/providers/gemini.provider.ts`] *(from: Epic 3, code review of 3-1)*
- **[I4]** `detectUpdatedThreads` N calls with no batching — **Trigger**: when thread volume exceeds ~1000 [`apps/api/src/modules/ingestion/ingestion.service.ts:186`] *(from: Epic 2, code review of 2-4/2-5)*
- **[I5]** `jobs` Map in BackfillService grows unboundedly — **Trigger**: when backfill is used frequently [`apps/api/src/modules/ingestion/backfill.service.ts:25`] *(from: Epic 2, code review of 2-4/2-5)*
- **[I6]** No concurrency guard for simultaneous backfill — **Trigger**: when admin count grows [`apps/api/src/modules/ingestion/backfill.service.ts:40`] *(from: Epic 2, code review of 2-4/2-5)*
- **[I7]** NestJS Logger structured JSON serialization — **Trigger**: when production log pipeline is set up [`apps/api/src/modules/ingestion/polling.job.ts`] *(from: Epic 2, code review of 2-3)*
- **[I8]** `lastBatchStatus` ambiguous for zero-channel runs — **Trigger**: when observability dashboard is built [`apps/api/src/modules/ingestion/polling.job.ts`] *(from: Epic 2, code review of 2-3)*
- **[I9]** Watermark uses DB `now()` not last-message-ts — **Trigger**: when message loss is observed [`apps/api/src/modules/ingestion/polling.job.ts`] *(from: Epic 2, code review of 2-3)*
- **[I10]** No cron expression validation at startup — **Trigger**: when config validation is centralized [`apps/api/src/config/app.config.ts`] *(from: Epic 2, code review of 2-3)*
- **[I11]** Migration rollback strategy not documented — **Trigger**: when rolling deployments are implemented [`packages/db/src/migrations/0004_futuristic_whirlwind.sql`] *(from: Epic 2, code review of 2-3)*
- **[I12]** Swagger / OpenAPI decorators — **Trigger**: when API is externally consumed *(from: project-context.md)*
- **[I13]** E2E / integration test framework — **Trigger**: after stable UI; per-story E2E continues *(from: project-context.md)*
- **[I14]** `unplugin-swc` CJS deprecation warning — **Trigger**: when upstream releases ESM-first [`apps/api/vitest.config.ts`] *(from: Epic 1, code review of 1-1)*
- **[I15]** Health endpoint untyped response — **Trigger**: when API contracts are formalized [`apps/api/src/app.controller.ts`] *(from: Epic 1, code review of 1-1)*
- **[I16]** No mutex against overlapping cron runs — **Trigger**: when batches exceed cron interval [`apps/api/src/modules/ingestion/polling.job.ts`] *(from: Epic 2, code review of 2-3)*

### Low-Priority / Cosmetic

- **[LP1]** Unicode `→` in `InvalidStateTransitionError` — **Trigger**: if log ingestion issues arise [`apps/api/src/modules/pipeline/pipeline.errors.ts`] *(from: Epic 3, code review of 3-2)*
- **[LP2]** `useAuth()` implicit `AuthProvider` dependency in `RootLayout` — **Trigger**: if test isolation becomes an issue [`apps/web/src/routes/__root.tsx:18`] *(from: Epic 1, code review of 1-5)*
- **[LP3]** `updateUserSchema` cannot express "clear slackNicknames" — **Trigger**: when PATCH endpoint for users is implemented [`packages/shared/src/schemas/user.schema.ts`] *(from: Epic 1, code review of 1-2)*
- **[LP4]** `usersRelations` defined in `workstreams.ts` — intentional; **Trigger**: if schema refactored [`packages/db/src/schema/workstreams.ts`] *(from: Epic 1, code review of 1-2)*
- **[LP5]** `row!` non-null assertion in embedder — consistent pattern; **Trigger**: if assertion failures observed [`apps/api/src/modules/pipeline/processors/embedder.processor.ts:73`] *(from: Epic 3, code review of 3-5)*
- **[LP6]** Missing EOF newline in migration SQL — cosmetic [`packages/db/src/migrations/0010_skinny_raider.sql:11`] *(from: Epic 3, code review of 3-5)*
- **[LP7]** JSONB shape cast without runtime validation — consistent pattern [`apps/api/src/modules/pipeline/processors/embedder.processor.ts:79-80`] *(from: Epic 3, code review of 3-5)*
- **[LP8]** "isolates failures" test incomplete assertion — not a bug [`apps/api/src/modules/pipeline/pipeline.service.spec.ts`] *(from: Epic 3, code review of 3-4)*
- **[LP9]** `allUsers` query omits `id` column — unused [`apps/api/src/modules/pipeline/pipeline.service.ts:122`] *(from: Epic 3, code review of 3-4)*
- **[LP10]** `GeminiProvider` empty string init — by design [`apps/api/src/modules/pipeline/llm/providers/gemini.provider.ts`] *(from: Epic 3, code review of 3-1)*
- **[LP11]** `oldestTs` Slack format validation — Slack rejects invalid [`packages/shared/src/schemas/backfill.schema.ts`] *(from: Epic 2, code review of 2-4/2-5)*
- **[LP12]** AC7 E2E parity not verified for entity detection — **Trigger**: next OpenShift deployment *(from: Epic 4, code review of 4-2)*

### Already Resolved / Moot

- ~~Logout button removed from `app.tsx`~~ — **MOOT**: navigation bar implemented in Story 1.5
- ~~AC4 nav item deferred~~ — **MOOT**: implemented in Story 1.5

---

## Resolved Items Archive

### Resolved from: OpenShift E2E testing (2026-05-11)

- ~~`drizzle-kit push` fallback in deploy.sh can drop Keycloak tables~~ — **RESOLVED**: Removed fallback; deploy fails fast. Added `tablesFilter` defense-in-depth.
- ~~No admin endpoint for on-demand briefing generation~~ — **RESOLVED**: Added `POST /api/admin/briefings/generate`.
- ~~E2E smoke test does not cover staging or briefing chain~~ — **RESOLVED**: Extended to 11-step test.
- ~~Blocklist filter returns empty results when no blocklist entries~~ — **RESOLVED**: Pass-through `AnonymizationResult[]` for all threads.
- ~~Correlation processor crash breaks entire pipeline~~ — **RESOLVED**: Wrapped in try-catch, non-blocking.
- ~~LLM entity detection called for all threads regardless~~ — **RESOLVED**: Conditional skip when zero flagged.
- ~~`pnpm install --frozen-lockfile` failed in `deploy.sh` due lockfile drift~~ — **RESOLVED (2026-05-12)**: Regenerated `pnpm-lock.yaml` after `packages/db/package.json` dependency move.
- ~~`drizzle-kit migrate` fails with opaque `undefined` in some environments~~ — **RESOLVED (2026-05-12)**: Added raw migration fallback runner (`packages/db/scripts/migrate-raw.js`) and hooked it into `deploy/deploy.sh`.
- ~~Backfill logic was added by editing an existing migration (0017)~~ — **RESOLVED (2026-05-12)**: Restored 0017 and created additive migration 0018 for approved-row backfill.
- ~~No roster user setup in E2E test~~ — **RESOLVED**: Added Step 3 to `test-pipeline.sh`.
- ~~OpenShift route timeout too short~~ — **RESOLVED**: 300s annotation.

### Resolved from: code review of story-4.5 (2026-05-11)

- ~~Missing regression test for staging quick-add query invalidation~~ — **RESOLVED**
- ~~Missing UX guard test for no-op blocklist edit~~ — **RESOLVED**

### Resolved from: code review of story-3.6 (2026-05-09)

- ~~Admin pipeline endpoint chains 4 heavy operations synchronously~~ — **PARTIALLY RESOLVED**: Correlation try-catch, LLM conditional, 300s route timeout. Full async deferred (tracked as **[B1]**).

## Deferred from: code review of 6-1-full-text-search-infrastructure.md (2026-05-12)

- `approveAllClean` can overcount approvals under concurrent callers because row-count from guarded `status='pending'` update is not checked before incrementing `approvedCount` (`apps/api/src/modules/admin/staging/staging.service.ts`).
- `classified_topics.thread_id` is non-unique, so duplicate `threadId` hits are possible in FTS results unless future schema/query constraints are introduced (`packages/db/src/schema/topics.ts`).

## Deferred from: code review of 7-2-workday-aware-threshold-logic (2026-05-15)

- AC7 automated E2E test for text-paste import parity not present in diff. Manual E2E validation was performed and documented in completion notes. Automated E2E tests remain deferred per project context ("E2E / integration tests | After stable UI | deprioritized").

## Deferred from: code review of 8-2-enrichment-panel-frontend.md (2026-05-26)

- Enrichment data is fetched even when the side panel is visually collapsed; deferred as a performance optimization.
- Section result-count copy currently uses generic “result(s)” instead of source-specific UX wording; deferred as copy alignment.

## Deferred from: code review of 8-3-backfill-briefing-generation-for-new-consultants (2026-05-27)

- First-time user with no workstream assignments and no daily content causes repeated `hasExistingBriefings` + `getBackfillThreads` queries each cron run since no briefing row is ever inserted. Low impact; resolves when user gets workstream assignments or content appears.
- Multiple `classified_topics` rows per thread can produce duplicate backfill items in `getBackfillThreads`. Pre-existing pattern also present in `getApprovedThreadsSince`.
- Migration `0022_fair_dreadnoughts.sql` includes unrelated `DROP INDEX` / `CREATE UNIQUE INDEX` for `silence_alerts` alongside the backfill enum addition. Auto-generated by drizzle-kit; not separable without manual migration editing.
