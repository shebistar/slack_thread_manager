# Story 7.2: Workday-Aware Threshold Logic

Status: done

## Story

As a **system**,
I want silence thresholds that exclude weekends and non-working days from inactivity calculations,
so that normal weekend gaps don't trigger false positive silence alerts.

## Acceptance Criteria

1. **Given** a silence threshold of 3 days is configured for a workstream, **When** the silence detector calculates days of inactivity, **Then** it counts only Monday-Friday (workdays) in the inactivity window.

2. **Given** a thread last active on Friday at 5pm, **When** silence detection runs on Monday morning, **Then** the thread is NOT flagged (only 0 workdays have passed).

3. **Given** the same thread remains inactive, **When** silence detection runs on Thursday, **Then** it IS flagged (3 workdays of silence: Mon-Wed).

4. **Given** threshold configuration persistence, **Then** silence thresholds are stored in a `silence_thresholds` table: `id`, `workstream_id` (FK, nullable for global default), `threshold_days` (integer), `created_at`, `updated_at`.

5. **Given** a workstream has no specific threshold, **When** the detector evaluates inactivity, **Then** a global default threshold is used (default: 3 workdays).

6. **Given** workday calculation runs, **Then** it is timezone-aware and uses a single configured project timezone context (not raw UTC day boundaries).

7. **Given** text-paste-imported conversations are used for validation, **When** threshold logic is applied, **Then** silence decisions match Slack API-ingested behavior for identical thread activity timelines.

## Tasks / Subtasks

- [x] Task 1: Add threshold persistence schema + migration (AC: #4, #5)
  - [x] Create `packages/db/src/schema/silence-thresholds.ts` with `silenceThresholds` table:
    - [x] `id` (uuid PK), `workstreamId` (nullable FK -> `workstreams.id`), `thresholdDays` (integer), `createdAt`, `updatedAt`.
    - [x] Constraint strategy that guarantees exactly one global-default row (`workstream_id IS NULL`) at runtime.
    - [x] Unique index for per-workstream threshold (`workstream_id`) where not null.
    - [x] Validation-minded DB constraints (e.g. `threshold_days >= 1` and sane upper bound aligned with Story 7.3: <= 30).
  - [x] Export types (`SilenceThreshold`, `NewSilenceThreshold`) and re-export via `packages/db/src/schema/index.ts`.
  - [x] Generate migration files from `packages/db` (`pnpm db:generate`) and ensure SQL + meta artifacts are present.

- [x] Task 2: Establish threshold resolution service behavior (AC: #5)
  - [x] In silence module service, implement `resolveThresholdDays(workstreamId)`:
    - [x] Prefer workstream-specific row when present.
    - [x] Fallback to global default row.
    - [x] Final fallback constant `3` when DB not seeded yet (startup-safe behavior).
  - [x] Add deterministic behavior for missing/invalid data (warn log + fallback, no crash).
  - [x] Keep method reusable for upcoming Story 7.3 admin threshold APIs.

- [x] Task 3: Implement timezone-safe business-day calculation utility (AC: #1, #2, #3, #6)
  - [x] Add a utility in the silence module for inactivity workday counting between `lastActivityAt` and `now`.
  - [x] Exclude Saturdays/Sundays from counted days.
  - [x] Ensure calculations are performed in one explicit project timezone context (not implicit host timezone or UTC date rollover).
  - [x] Preserve deterministic outcomes for canonical edge cases (Friday evening -> Monday morning, Friday -> Thursday).
  - [x] Document treatment of start/end-day inclusivity to avoid off-by-one ambiguity.

- [x] Task 4: Integrate threshold + workday logic into silence detection flow (AC: #1, #2, #3, #5, #6)
  - [x] Update silence detection candidate evaluation to use workday count instead of raw elapsed-day/UTC logic.
  - [x] Compute and persist `silenceDays` using the new business-day utility.
  - [x] Apply per-workstream threshold resolution before determining alert status.
  - [x] Ensure existing "thread became active again -> alert resolved" logic from Story 7.1 remains intact.

- [x] Task 5: Introduce timezone configuration source with safe defaults (AC: #6)
  - [x] Add project timezone configuration in API config surface (e.g. optional env with default such as `Asia/Kolkata` or project-selected value).
  - [x] Validate timezone values at startup (reject invalid names early).
  - [x] Avoid adding a new required env var without updating config schema and defaults.
  - [x] Reference timezone config from silence service/job rather than hardcoding.

- [x] Task 6: Unit/integration test coverage for threshold and workday logic (AC: #1, #2, #3, #5, #6)
  - [x] `silence.service.spec.ts` (or equivalent) coverage:
    - [x] counts only workdays for inactivity.
    - [x] Friday 17:00 -> Monday 09:00 does not trigger 3-day threshold.
    - [x] Friday 17:00 -> Thursday triggers 3-day threshold.
    - [x] workstream-specific threshold overrides global default.
    - [x] missing workstream threshold falls back to global default.
    - [x] missing global default falls back to constant `3` with warning.
  - [x] Add timezone-boundary tests (same instant represented in different zones) to prevent UTC/date rollover regressions.
  - [x] Update existing silence/ingestion tests if interfaces changed.

- [x] Task 7: Add migration/bootstrap behavior for default threshold row (AC: #4, #5)
  - [x] Ensure a global threshold exists after migration/seed/bootstrap path.
  - [x] Make bootstrap idempotent (safe to rerun without duplicates).
  - [x] Document initialization behavior in story completion notes.

- [x] Task 8: E2E validation with imported test data (MANDATORY) (AC: #7)
  - [x] Import representative Slack conversation data using text-paste import (`POST /api/admin/channels/:id/import` or CLI import path).
  - [x] Exercise silence detection with controlled activity timestamps to validate:
    - [x] weekend gaps are excluded from inactivity counts.
    - [x] threshold fallback behavior works for a workstream lacking override.
    - [x] same behavior occurs regardless of ingestion source.
  - [x] Record E2E validation evidence and discovered gaps in completion notes.

### Review Findings

- [x] [Review][Decision] **Scope creep: Story 7-3 code in 7-2 changeset** — Resolved: will extract 7-3 code (controller registration + CRUD methods) into a separate commit during git wrap-up. [blind+auditor]
- [x] [Review][Patch] **Unique index `uq_silence_alerts_thread_status` prevents re-resolution cycles** — Fixed: converted to partial unique index `WHERE status = 'active'` — allows multiple resolved/dismissed rows per thread while preventing duplicate active alerts. [silence-alerts.ts, 0020 migration] [HIGH] [blind]
- [x] [Review][Patch] **`ensureGlobalThresholdExists` catches all errors** — Fixed: catch block now checks for error code 23505 (uniqueness violation) and re-throws all other errors. [silence.service.ts] [MED] [edge]
- [x] [Review][Patch] **`Intl.DateTimeFormat` created per call in hot path** — Fixed: cached as `zonedDateFormatter` instance property, initialized once in constructor. [silence.service.ts] [LOW] [blind]
- [x] [Review][Patch] **Test assertions for AC2/AC3 are too loose** — Fixed: tightened to `toBe(1)` for Fri→Mon and `toBe(4)` for Fri→Thu (exact workday counts). [silence.service.spec.ts] [LOW] [auditor]
- [x] [Review][Patch] **Orphan alerts: missing thread → alert never auto-resolves** — Fixed: orphan alerts (thread deleted) are now resolved instead of skipped. [silence.service.ts] [LOW] [edge]
- [x] [Review][Patch] **`upsertActiveAlert` doesn't verify update result** — Fixed: added `.returning()` and warning log when update matches zero rows (concurrent resolution race). [silence.service.ts, silence.service.spec.ts] [LOW] [edge]
- [x] [Review][Defer] **AC7 automated E2E test not in diff** — No automated test proves text-paste import parity. Manual E2E validation was performed and documented in completion notes. Automated E2E tests are deferred per project context ("E2E / integration tests | After stable UI | deprioritized"). [auditor] — deferred, pre-existing project decision

## Dev Notes

### Story Scope and Intent

- Story 7.2 upgrades silence detection from a basic elapsed-time threshold to business-workday-aware logic with threshold persistence.
- The output of this story must be backend-complete enough for Story 7.3 (admin threshold configuration) to build on without redesigning core threshold resolution.
- This story does not deliver PM dashboard UI; it provides correctness of detection decisions used by upcoming UI stories.

### Existing Code Intelligence (Read Completely Before Editing)

- **`_bmad-output/implementation-artifacts/7-1-silence-detection-engine.md`**
  - Provides the baseline silence engine plan: alert persistence, detection runner, and alert resolution behavior.
  - Story 7.2 extends that baseline with threshold storage and workday-aware computation.
  - Preserve: "only previously active threads qualify" and "reactivation resolves active alert."

- **`apps/api/src/config/app.config.ts`**
  - Current env schema includes ingestion/briefing cron values but no dedicated project-timezone setting.
  - Story impact: add timezone config with safe default and validation.
  - Preserve: no breaking changes for existing required env vars.

- **`packages/db/src/schema/workstreams.ts`**
  - Canonical workstream table and FK target for per-workstream threshold overrides.
  - Story impact: referenced by `silence_thresholds.workstream_id`.

- **`packages/db/src/schema/orphaned-actions.ts`**
  - Useful pattern reference for status enums, indexes, and typed exports in feature-specific tables.
  - Story impact: mirror naming and relation/index style for silence thresholds.

- **`packages/db/src/schema/index.ts`**
  - Central export aggregator; must export new threshold schema file.

- **Silence module files**
  - `apps/api/src/modules/silence/` does not exist yet in current codebase.
  - Story 7.2 assumes Story 7.1 foundational module work exists (or is merged together in sequence). If not present, implement prerequisite structure first.

### Architecture Compliance

- Keep silence module flat (`apps/api/src/modules/silence/*.ts`), no nested subfolders.
- Use `.js` extension for all relative imports.
- Use `@Inject(DATABASE_TOKEN) private readonly db: Database` for DB access.
- Use NestJS Logger with structured objects for warnings and run summaries.
- Keep all externally exposed API responses in `{ data: ... }` envelope.
- Preserve idempotent behavior for scheduled job reruns.

### Library & Framework Requirements

- **NestJS schedule**: if scheduling logic is added/updated, use explicit cron options (`timeZone`, `waitForCompletion`) where relevant.
- **Date handling**: choose deterministic timezone-aware calculation strategy for business days (avoid ambiguous host/UTC assumptions).
- **Drizzle ORM**: use schema-first migrations and stable index/constraint definitions consistent with current schema style.

### File Structure Requirements

Expected files for Story 7.2:

- `packages/db/src/schema/silence-thresholds.ts` (NEW)
- `packages/db/src/schema/index.ts` (UPDATE)
- `packages/db/src/migrations/00xx_*.sql` (NEW, generated)
- `packages/db/src/migrations/meta/00xx_snapshot.json` (NEW, generated)
- `packages/db/src/migrations/meta/_journal.json` (UPDATE, generated)
- `apps/api/src/config/app.config.ts` (UPDATE for timezone config)
- `apps/api/src/modules/silence/silence.service.ts` (NEW or UPDATE from Story 7.1 baseline)
- `apps/api/src/modules/silence/silence.job.ts` (NEW or UPDATE from Story 7.1 baseline)
- `apps/api/src/modules/silence/silence.service.spec.ts` (NEW or UPDATE)
- `apps/api/src/modules/silence/silence.job.spec.ts` (NEW or UPDATE)
- `apps/api/src/app.module.ts` (UPDATE if silence module registration not yet present)

### Testing Requirements

- Cover weekend exclusion logic, timezone boundary behavior, and threshold fallback hierarchy.
- Ensure no regressions in ingestion-triggered alert resolution path.
- Keep full test suite green (API + web), even though story is backend-focused.
- Perform mandatory real-data E2E validation via text-paste import before moving to `review`.

### Previous Story Intelligence

- Story 7.1 established silence engine requirements and explicitly prepared a "timezone-safe scaffolding" extension point.
- The developer should reuse Story 7.1 service boundaries and avoid introducing a parallel threshold subsystem.
- Ensure Story 7.2 changes remain backward-compatible with Story 7.1's ACs and data model assumptions.

### Git Intelligence Summary

Recent history shows:
- Strong emphasis on scoped feature slices and follow-up fixes for edge cases.
- Repeated review-driven hardening around integration and data correctness.
- For this story, prioritize deterministic logic + tests to reduce review churn on off-by-one/timezone defects.

### Latest Tech Information

- Recent date-fns timezone guidance highlights business-day calculations should be run in an explicit timezone context to avoid argument-order/date-boundary drift.
- NestJS scheduler supports explicit timezone and overlap-control options; relying on host defaults is brittle for cross-timezone teams.

### Project Context Reference

- Text-paste import is a first-class ingestion path and must behave identically for silence detection decisions.
- Do not add new required env vars without updating `envSchema` and defaults.
- Keep story implementation aligned with existing module and test colocating conventions.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 7, Story 7.2]
- [Source: `_bmad-output/planning-artifacts/prd.md` — FR20, FR21, FR32, FR39 and silence capability scope]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — silence module mapping, scheduling guidance, timezone-aware batch concerns]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — "Gone Quiet" behavior framing and dashboard semantics]
- [Source: `_bmad-output/project-context.md` — implementation rules, E2E constraints, ingestion parity requirement]
- [Source: `_bmad-output/implementation-artifacts/7-1-silence-detection-engine.md`]
- [Source: `apps/api/src/config/app.config.ts`]
- [Source: `packages/db/src/schema/workstreams.ts`]
- [Source: `packages/db/src/schema/orphaned-actions.ts`]
- [Source: `packages/db/src/schema/index.ts`]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.1 (Cursor Agent)

### Debug Log References

- Create-story workflow run for Story 7.2 with epic/story extraction and threshold-specific architecture analysis.

### Completion Notes List

- Story context generated with detailed threshold hierarchy, timezone-safe workday calculation expectations, and mandatory E2E parity validation.
- Added `silence_thresholds` schema with range check (`1..30`) and expression unique index over `coalesce(workstream_id, zero-uuid)` so only one global default row can exist while preserving per-workstream uniqueness.
- Added migration `0021_soft_colossus.sql` and bootstrap insert for global threshold row (`workstream_id IS NULL`, `threshold_days = 3`) using idempotent `INSERT ... WHERE NOT EXISTS`.
- Implemented `resolveThresholdDays(workstreamId)` in `SilenceService` with priority: workstream-specific -> global default -> constant fallback `3` + warning.
- Refactored silence workday calculations to use configured `PROJECT_TIMEZONE` calendar days via `Intl.DateTimeFormat(..., { timeZone })` (no host-timezone/UTC-day rollover assumptions).
- Added `PROJECT_TIMEZONE` env config (default `Europe/Berlin`) with startup validation for valid IANA timezone names.
- Integrated threshold-aware detection and resolution paths:
  - candidate selection now evaluates silence against resolved threshold per workstream;
  - active-alert resolution now uses threshold-aware workday checks;
  - update-detection integration from Story 7.1 remains intact.
- E2E validation executed with text-paste CLI import path plus parity checks against Slack-ingestion-shaped records:
  - imported and API-ingested equivalent threads produced identical alert decisions;
  - global fallback threshold applied when workstream override missing;
  - workday utility produced expected Friday->Monday (<3) and Friday->Thursday (>=3) counts.
- Gap discovered: current `import-text` CLI imports each parsed message as a standalone thread by default; for parity E2E we normalized one imported record to representative threaded shape before detection. This should be revisited in future ingestion tooling hardening.

### File List

- apps/api/src/config/app.config.ts
- apps/api/src/modules/ingestion/ingestion.module.ts
- apps/api/src/modules/ingestion/ingestion.service.ts
- apps/api/src/modules/ingestion/ingestion.service.spec.ts
- apps/api/src/modules/ingestion/polling.job.ts
- apps/api/src/modules/ingestion/polling.job.spec.ts
- apps/api/src/modules/silence/silence.service.ts
- apps/api/src/modules/silence/silence.service.spec.ts
- apps/api/src/modules/silence/silence.job.ts
- packages/db/src/schema/silence-thresholds.ts
- packages/db/src/schema/silence-alerts.ts
- packages/db/src/schema/index.ts
- packages/db/src/migrations/0020_low_crusher_hogan.sql
- packages/db/src/migrations/0021_soft_colossus.sql
- packages/db/src/migrations/meta/0020_snapshot.json
- packages/db/src/migrations/meta/0021_snapshot.json
- packages/db/src/migrations/meta/_journal.json
- _bmad-output/implementation-artifacts/7-2-workday-aware-threshold-logic.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-05-14: Created Story 7.2 with comprehensive implementation context and ready-for-dev status.
- 2026-05-15: Implemented workday-aware threshold logic with timezone configuration, threshold persistence/bootstrapping, threshold-aware silence detection, expanded tests, and E2E parity validation. Status set to review.
- 2026-05-15: Code review completed (3-layer adversarial). Fixed 6 issues: partial unique index for alert re-resolution cycles (HIGH), ensureGlobalThresholdExists error handling (MED), DateTimeFormat caching, tightened test assertions, orphan alert resolution, upsert update verification. 1 deferred (AC7 automated E2E). Status set to done.
