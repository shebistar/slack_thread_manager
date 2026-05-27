# Story 8.3: Backfill Briefing Generation for New Consultants

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **new consultant joining mid-project**,
I want my first briefing to include a backfill section covering what I missed since the project started,
so that I achieve working context within my first briefing cycle instead of scrolling Slack history.

## Acceptance Criteria

1. **Given** a new team member is added to the roster with a role and workstream assignments, **When** the next briefing generation job runs for this user, **Then** it detects this is the user's first briefing (no prior briefings exist for this `user_id`).

2. **Given** this is the user's first briefing, **When** briefing items are generated, **Then** a backfill section is prepended containing:
   - role-filtered summary of project history scoped to assigned workstreams,
   - key decisions made (from approved threads),
   - unresolved issues still open,
   - unowned action items in the user's workstreams.

3. **Given** backfill items are generated, **Then** they are stored in `briefing_items` with `item_type = BACKFILL` and deterministic top-of-briefing ordering.

4. **Given** a user has already received their first briefing, **When** subsequent briefing generations run, **Then** no backfill section is generated (one-time behavior).

5. **Given** backfill generation is enabled, **When** history is queried, **Then** lookback window is configurable (`BRIEFING_BACKFILL_LOOKBACK_DAYS`) and defaults to 90 days while allowing project-start fallback if configured.

6. **Given** text-paste-imported Slack data exists for assigned workstreams, **When** first briefing backfill is generated, **Then** those threads are included identically to Slack-API-ingested threads (ingestion-source neutrality).

7. **Given** API responses include briefing items with backfill content, **When** `GET /briefings/today` and `GET /briefings/:id` are called, **Then** serialized `itemType` includes `BACKFILL` and remains wrapped in `{ data: ... }`.

## Tasks / Subtasks

- [ ] Task 1: Extend shared and DB enums for backfill item type (AC: #3, #7)
  - [ ] Update `packages/db/src/schema/briefings.ts` to add `'backfill'` to `briefingItemTypeEnum`.
  - [ ] Generate Drizzle migration in `packages/db/src/migrations/` and commit SQL + meta snapshot.
  - [ ] Update `packages/shared/src/schemas/briefing.schema.ts` to include `BACKFILL` in `briefingItemTypeSchema`.
  - [ ] Confirm `packages/shared/src/schemas/index.ts` exports remain intact (no extension/path regressions).

- [ ] Task 2: Add first-briefing detection and backfill query builder in service (AC: #1, #2, #4, #5, #6)
  - [ ] In `apps/api/src/modules/briefings/briefings.service.ts`, add helper to detect whether user has any prior briefings.
  - [ ] Add dedicated method to query historical approved threads constrained by user role/workstreams and lookback window.
  - [ ] Reuse existing summary extraction and permalink logic; do not duplicate transform logic.
  - [ ] Ensure one-time semantics: backfill only when user has no earlier briefings.
  - [ ] Respect `BRIEFING_BACKFILL_LOOKBACK_DAYS` with safe default (90) and guard invalid values.

- [ ] Task 3: Compose and prioritize BACKFILL items in generation path (AC: #2, #3, #4)
  - [ ] Insert backfill items before normal daily items for qualifying users.
  - [ ] Keep existing item type priorities for non-backfill items (cross_workstream/orphaned/standard/gone_quiet).
  - [ ] Guarantee stable `sort_order` for deterministic rendering and tests.
  - [ ] Preserve current behavior for non-first briefings.

- [ ] Task 4: Keep controller response contracts compatible with new item type (AC: #7)
  - [ ] Verify uppercase serialization in `apps/api/src/modules/briefings/briefings.controller.ts` handles `backfill` -> `BACKFILL`.
  - [ ] Preserve response envelope and ISO date formatting.
  - [ ] Do not introduce new endpoint; update behavior of existing briefing endpoints only.

- [ ] Task 5: Expand unit/integration test coverage for backfill behavior (AC: #1-#5, #7)
  - [ ] Update `apps/api/src/modules/briefings/briefings.service.spec.ts` with:
    - [ ] first-briefing detection path (backfill included),
    - [ ] repeat-briefing path (backfill excluded),
    - [ ] lookback window default and override behavior,
    - [ ] role/workstream filtering and unowned/orphaned selection behavior.
  - [ ] Update `apps/api/src/modules/briefings/briefings.controller.spec.ts` to assert `BACKFILL` serialization.
  - [ ] Add/adjust `apps/api/src/modules/briefings/briefings.e2e-validation.ts` (or equivalent) for endpoint-level assertion.

- [ ] Task 6: Update deployment smoke verification for changed briefing output contract (AC: #7)
  - [ ] Update `deploy/test-pipeline.sh` with a verification step that asserts backfill item type handling in briefing responses (presence/format of `BACKFILL` when scenario data qualifies).
  - [ ] Keep script idempotent and non-destructive; no credential or endpoint contract regressions.

- [ ] Task 7: E2E validation with imported test data (MANDATORY) (AC: #6)
  - [ ] Import representative Slack chat via text-paste import (`POST /api/admin/channels/:id/import`).
  - [ ] Ensure at least one first-time consultant user exists with assigned workstream and no prior briefings.
  - [ ] Run briefing generation and validate backfill appears only once for first briefing.
  - [ ] Validate inclusion of imported-data threads in backfill section.
  - [ ] Document validated behavior and any gaps in Completion Notes.

## Dev Notes

- Story 8.3 is backend-focused and extends the existing briefing-generation flow; no new module should be introduced.
- Reuse current `briefings` module patterns: DB injection via `DATABASE_TOKEN`, logger usage, and existing response wrappers.
- Preserve dual-ingestion invariants: downstream logic must not branch on ingestion source.

### Existing Code Intelligence (UPDATE Files Read)

#### `apps/api/src/modules/briefings/briefings.service.ts` (UPDATE — primary)
- **Current state:** Generates daily briefings from approved threads, maps role to shape, filters workstreams for `filtered_brief`, and inserts briefing + items. Sorting currently prioritizes non-backfill item types only.
- **What this story changes:** Add first-briefing detection, backfill query/assembly, and `backfill` item type support while preserving existing generation and delivery transitions.
- **What must be preserved:** Existing skip-if-no-content behavior, idempotent date uniqueness, delivery state transition loop, summary extraction, and Slack permalink generation.

#### `apps/api/src/modules/briefings/briefings.controller.ts` (UPDATE)
- **Current state:** Serializes `itemType` using `.toUpperCase()` and wraps all payloads in `{ data: ... }`.
- **What this story changes:** Ensure `BACKFILL` flows through serialization naturally with no contract break.
- **What must be preserved:** Auth guard, response envelope, date serialization, and existing route set.

#### `apps/api/src/modules/briefings/briefings.service.spec.ts` (UPDATE)
- **Current state:** Covers role mapping, filtering, sort priority, generation conditions, read-state flows, and isolation behavior.
- **What this story changes:** Add coverage for first-briefing-only backfill semantics and lookback config handling.
- **What must be preserved:** Existing test style (Vitest + nested mocks), per-user error isolation expectations.

#### `apps/api/src/modules/briefings/briefing-generation.job.ts` (READ/likely unchanged)
- **Current state:** Cron-triggered wrapper around `generateBriefingsForAllUsers`.
- **Expected impact:** Usually none, unless config parsing for backfill defaults requires explicit logging/validation at job boundary.

#### `packages/db/src/schema/briefings.ts` (UPDATE)
- **Current state:** `briefing_item_type` enum includes `standard|cross_workstream|orphaned_action|gone_quiet`.
- **What this story changes:** Add `backfill` enum value and migration.
- **What must be preserved:** Existing table/index definitions and relation mappings.

#### `packages/shared/src/schemas/briefing.schema.ts` (UPDATE)
- **Current state:** API schema enum uses uppercase values and currently omits `BACKFILL`.
- **What this story changes:** Add `BACKFILL` to contract schema.
- **What must be preserved:** Existing schema names, response shapes, and export compatibility.

#### `deploy/test-pipeline.sh` (UPDATE)
- **Current state:** Validates end-to-end flow through ingestion/pipeline/staging/briefings/search/enrichment.
- **What this story changes:** Add a smoke assertion covering new `BACKFILL` item type behavior for briefing responses.
- **What must be preserved:** Current end-to-end chain, pass/fail semantics, and safe repeatable execution.

### Architecture Compliance

- Use NestJS module/service patterns already present in `briefings`; no cross-module internals import.
- Keep all relative imports with `.js` extension.
- Continue wrapping API outputs in `{ data: ... }`.
- Preserve structured logging with `Logger`; no `console.log`.
- Keep DB schema in snake_case and TypeScript usage in camelCase via Drizzle mapping.

### Library / Framework Requirements

- **NestJS `@nestjs/schedule`:** Cron handler should remain named and error-safe; consider `waitForCompletion` if overlap risk emerges.
- **Drizzle ORM:** Add enum values via schema change + generated migration, then review SQL before applying.
- **Zod schemas in `packages/shared`:** Update contract enums to keep API-client compatibility.
- **Vitest:** Maintain existing mocking patterns and colocated spec style.

### File Structure Requirements

- `apps/api/src/modules/briefings/briefings.service.ts` (UPDATE)
- `apps/api/src/modules/briefings/briefings.controller.ts` (VERIFY/possible UPDATE)
- `apps/api/src/modules/briefings/briefings.service.spec.ts` (UPDATE)
- `apps/api/src/modules/briefings/briefings.controller.spec.ts` (UPDATE)
- `packages/db/src/schema/briefings.ts` (UPDATE)
- `packages/db/src/migrations/*` + migration metadata snapshot (NEW)
- `packages/shared/src/schemas/briefing.schema.ts` (UPDATE)
- `deploy/test-pipeline.sh` (UPDATE)
- `_bmad-output/implementation-artifacts/8-3-backfill-briefing-generation-for-new-consultants.md` (this story file)

### Testing Requirements

- Unit test first-briefing detection and one-time exclusion on subsequent runs.
- Validate role/workstream filtering for backfill items and preservation of existing daily items.
- Assert controller returns `BACKFILL` item type uppercase in both today/id endpoints.
- Run briefing module test suite and ensure no regressions in existing item-type sort behavior.
- Perform mandatory E2E validation with imported data and document evidence.

### Previous Story Intelligence (8.2)

- Story 8.2 completed with strong unit test coverage but highlighted that true authenticated browser E2E can be blocked by environment credentials.
- Carry forward: keep deterministic tests robust even when full env E2E is constrained, but still include mandatory real-data validation task and document blockers explicitly if encountered.
- Recent fixes emphasized explicit handling of partial/edge states; apply same discipline here for first-briefing boundary conditions.

### Git Intelligence Summary

- Recent commits use `feat(8.x)` and `fix(8.x)` conventions with targeted story scope.
- `deploy/test-pipeline.sh` is already treated as a living smoke-validation artifact in feature/fix commits.
- Story and sprint-status files are consistently updated together with implementation work.

### Latest Technical Information

- NestJS schedule supports `timeZone` and `waitForCompletion`; long-running cron handlers should avoid overlap by design.
- Drizzle enum additions are straightforward via `pgEnum` updates; generated SQL should be reviewed carefully, especially if defaults/types are changed.
- Keep migration flow explicit (`generate` then review) rather than relying on blind schema push behavior.

### Project Context Reference

- Text-paste import is a primary ingestion mode; no backfill logic may assume Slack API-only provenance.
- Every story requires E2E validation with imported representative data before `review`.
- Any endpoint contract change must be reflected in `deploy/test-pipeline.sh` verification coverage.

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 8, Story 8.3 ACs)
- `_bmad-output/planning-artifacts/architecture.md` (briefings module boundaries, response patterns, schema conventions)
- `_bmad-output/planning-artifacts/ux-design-specification.md` (backfill onboarding intent and one-time display behavior)
- `_bmad-output/project-context.md` (implementation rules, E2E mandates, deploy quality gates)
- `_bmad-output/implementation-artifacts/8-2-enrichment-panel-frontend.md` (previous story learnings)
- `apps/api/src/modules/briefings/briefings.service.ts`
- `apps/api/src/modules/briefings/briefings.controller.ts`
- `apps/api/src/modules/briefings/briefings.service.spec.ts`
- `packages/db/src/schema/briefings.ts`
- `packages/shared/src/schemas/briefing.schema.ts`
- `deploy/test-pipeline.sh`

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- N/A

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- `_bmad-output/implementation-artifacts/8-3-backfill-briefing-generation-for-new-consultants.md` (CREATED)
