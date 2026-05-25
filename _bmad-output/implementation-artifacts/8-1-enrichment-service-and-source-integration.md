# Story 8.1: Enrichment Service & Source Integration

Status: ready-for-dev

## Story

As a **developer**,
I want an enrichment service that queries external knowledge sources (NotebookLM, OpenShift docs) for context related to a selected topic,
so that the Intelligence Report side panel can display relevant documentation alongside thread analysis.

## Acceptance Criteria

1. **Given** a user selects a BriefingCard in the Intelligence Report layout, **When** the enrichment service is called with a thread/topic context, **Then** it queries configured external sources in parallel:
   - NotebookLM source (enterprise API integration)
   - OpenShift docs source (public docs lookup)
   - Similar past discussions source (reuse semantic similarity against existing embeddings)

2. **Given** source queries complete, **Then** each result is normalized to:
   - `title`
   - `description`/`snippet`
   - `sourceUrl`
   - `sourceType` (`NOTEBOOKLM` | `OPENSHIFT_DOCS` | `PAST_DISCUSSION`)
   - `relevanceScore`

3. **Given** repeated enrichment requests for the same thread/topic on the same day, **Then** results are served from cache (or persisted same-day snapshot) instead of re-querying every external source.

4. **Given** one source fails or times out, **Then** remaining sources still return results (partial-success semantics) and the endpoint still responds successfully with available sections.

5. **Given** all external sources are unavailable, **Then** `GET /api/enrichment/:threadId` still returns a valid payload shape (`{ data: { sections: [] } }`) and includes metadata enabling frontend fallback message rendering ("Enrichment temporarily unavailable").

6. **Given** an authenticated non-architect/consultant user calls the enrichment endpoint, **Then** access is denied by RBAC; architects/consultants can access their permitted enrichment data path.

7. **Given** text-paste-imported Slack data exists, **When** enrichment is requested for those threads, **Then** similar-past-discussion results and source composition behave identically to Slack API-ingested data.

## Tasks / Subtasks

- [ ] Task 1: Create Enrichment module foundation and API endpoint (AC: #1, #5, #6)
  - [ ] Add `apps/api/src/modules/enrichment/enrichment.module.ts`
  - [ ] Add `apps/api/src/modules/enrichment/enrichment.controller.ts` with `GET /enrichment/:threadId`
  - [ ] Add `apps/api/src/modules/enrichment/enrichment.service.ts`
  - [ ] Register module in `apps/api/src/app.module.ts`
  - [ ] Apply `@Roles('ARCHITECT', 'CONSULTANT')` guarding for endpoint access
  - [ ] Enforce response wrapper `{ data: ... }` and typed response contract

- [ ] Task 2: Define shared schema contracts for enrichment payloads (AC: #2, #5)
  - [ ] Add `packages/shared/src/schemas/enrichment.schema.ts` with Zod schemas and inferred types
  - [ ] Export from `packages/shared/src/schemas/index.ts`
  - [ ] Use `ZodValidationPipe` on controller params (thread id) and response typing conventions

- [ ] Task 3: Implement source abstraction with parallel execution and per-source timeout isolation (AC: #1, #4)
  - [ ] Add source adapters under `apps/api/src/modules/enrichment/` (flat module structure):
    - [ ] `notebooklm.source.ts`
    - [ ] `openshift-docs.source.ts`
    - [ ] `similar-discussions.source.ts`
  - [ ] Add common source interface + result normalization utility
  - [ ] Execute source calls via `Promise.allSettled` and keep per-source timeout defaults (5s, configurable)
  - [ ] Capture structured logs for success/failure per source without aborting the full request

- [ ] Task 4: Implement similar-past-discussions source via existing search/embedding patterns (AC: #1, #2, #7)
  - [ ] Reuse existing vector search / embedding pathway from search module, not duplicate semantic ranking logic
  - [ ] Exclude current `threadId` from "similar" result set
  - [ ] Return top N similar approved threads with permalink/source context
  - [ ] Verify ingestion-source neutrality (Slack API and text-paste data both resolve through same `slack_threads` corpus)

- [ ] Task 5: Add same-day cache strategy for enrichment responses (AC: #3, #4, #5)
  - [ ] Implement cache key strategy (`threadId` + normalized topic signature + UTC date)
  - [ ] Use simple persisted table or in-process map with clear invalidation policy (prefer persisted if already-patterned)
  - [ ] Ensure cache hit path preserves exact response schema and source section ordering
  - [ ] Ensure cache miss + all-sources-failed still returns valid empty sections payload

- [ ] Task 6: Wire runtime configuration for enrichment source URLs/timeouts (AC: #1, #4)
  - [ ] Extend config schema (`apps/api/src/config/app.config.ts` or dedicated enrichment config) with optional vars:
    - [ ] NotebookLM base URL / credentials reference
    - [ ] OpenShift docs source base URL
    - [ ] Source timeout and max results controls
  - [ ] Keep new vars optional with safe defaults; do not introduce mandatory env vars without explicit justification

- [ ] Task 7: Testing coverage for endpoint, source orchestration, timeout isolation, and cache behavior (AC: #1-#6)
  - [ ] Unit tests for `enrichment.service.ts` success/partial/all-failed paths
  - [ ] Unit tests for each source adapter normalization and timeout behavior
  - [ ] Controller test for auth/RBAC and `{ data: { sections: [] } }` response envelope
  - [ ] Integration-style test for cache hit/miss behavior (same-day no re-fetch assertion)

- [ ] Task 8: Update deploy smoke test script for new endpoint verification (MANDATORY A16) (AC: #5, #6)
  - [ ] Add enrichment verification step in `deploy/test-pipeline.sh` after search/briefing setup
  - [ ] Validate authorized call returns 200 and `data.sections` array
  - [ ] Validate unauthorized/role-mismatched behavior per current auth strategy

- [ ] Task 9: E2E validation with imported test data (MANDATORY)
  - [ ] Import representative Slack chat via text-paste import (`POST /api/admin/channels/:id/import`)
  - [ ] Exercise enrichment endpoint for imported thread IDs
  - [ ] Verify similar-discussions source and payload composition from imported data
  - [ ] Document what was validated and any observed gaps in Completion Notes

## Dev Notes

### Story Scope and Intent

Story 8.1 is backend-only enablement for the Epic 8 enrichment panel. The goal is to deliver a resilient enrichment API contract that the Story 8.2 frontend can consume without coupling to source-specific failure modes.

### Existing Code Intelligence (Read Completely Before Editing)

#### `apps/api/src/app.module.ts`
- Current state: module registration includes auth/admin/slack/ingestion/pipeline/briefings/search/silence.
- Story impact: register `EnrichmentModule` and preserve global guards + config bootstrap.
- Preserve: no change to existing module order side effects unless required by DI.

#### `apps/api/src/modules/search/search.service.ts`
- Current state: already composes FTS + vector search + merge, uses DB joins + normalized result shaping.
- Story impact: reuse semantic similarity patterns for `similar-discussions.source.ts` (avoid reinvention).
- Preserve: existing search behavior and query performance constraints.

#### `apps/api/src/modules/search/search.module.ts`
- Current state: exports search providers and imports pipeline module.
- Story impact: enrichment module may depend on search/vector services; import/export should follow Nest module boundaries, not internal file imports.

#### `deploy/test-pipeline.sh`
- Current state: smoke-test chain covers Epics 1-7 and validates `/search`, briefing flows, silence endpoints.
- Story impact: add enrichment endpoint verification as explicit Epic 8 coverage per A16.
- Preserve: script readability, pass/fail reporting style, and non-destructive smoke-test semantics.

#### `packages/shared/src/schemas/index.ts`
- Current state: centralized schema export barrel for API contracts.
- Story impact: add enrichment schema export here; keep `.js` extension rule intact.

### Architecture Compliance

- Use NestJS module/controller/service pattern with logger-based observability.
- Use `.js` extension on all relative imports.
- Keep API response envelope `{ data: ... }`.
- Apply RBAC with `@Roles(...)` for role-specific endpoint gating.
- Keep module directory flat (`apps/api/src/modules/enrichment/` with no nested `sources/` directory if enforcing project-context flat rule).
- No controller-level bypass of service-layer resilience rules.

### Library & Framework Requirements

- **NestJS 11** with `HttpModule`-style timeout controls for external calls.
- **Drizzle ORM** for any persisted cache table, with migration if schema changes are introduced.
- **Zod** for request/response schema definitions in shared package.
- **Vitest** for service/controller/source tests.
- **NotebookLM** integration should target currently documented Enterprise API capability; keep adapter boundary to tolerate API evolution.

### File Structure Requirements

Expected update/create set for Story 8.1:

- `apps/api/src/modules/enrichment/enrichment.module.ts` (NEW)
- `apps/api/src/modules/enrichment/enrichment.controller.ts` (NEW)
- `apps/api/src/modules/enrichment/enrichment.service.ts` (NEW)
- `apps/api/src/modules/enrichment/notebooklm.source.ts` (NEW)
- `apps/api/src/modules/enrichment/openshift-docs.source.ts` (NEW)
- `apps/api/src/modules/enrichment/similar-discussions.source.ts` (NEW)
- `apps/api/src/app.module.ts` (UPDATE)
- `packages/shared/src/schemas/enrichment.schema.ts` (NEW)
- `packages/shared/src/schemas/index.ts` (UPDATE)
- `deploy/test-pipeline.sh` (UPDATE)
- `apps/api/src/modules/enrichment/*.spec.ts` (NEW tests)

If persistent cache storage is added:
- `packages/db/src/schema/*` (UPDATE/NEW as needed)
- `packages/db/src/migrations/*` + migration meta snapshot (MANDATORY when schema changes)

### Testing Requirements

- Validate endpoint contract shape for success, partial success, and all-failed-source fallback.
- Validate per-source timeout isolation and non-blocking behavior.
- Validate cache hit path avoids repeated external calls within same day.
- Validate RBAC behavior (`ARCHITECT`/`CONSULTANT` allowed, others denied).
- Validate enrichment behavior over text-paste-imported data path.
- Keep existing suites green (API + web unaffected by backend-only additions except smoke script updates).

### Latest Tech Information

- NotebookLM Enterprise exposes API docs and notebook operations via Google Cloud documentation; keep credentials/endpoint configuration externalized and avoid hardcoding assumptions.
- OpenShift public docs do not present a guaranteed first-class "search API" contract; implement OpenShift source as adapter with controlled query strategy and graceful degradation.
- NestJS external-call best practice remains: explicit timeouts, retries/backoff where appropriate, and fail-soft orchestration (`Promise.allSettled`) for multi-source aggregation.

### Project Context Reference

- Text-paste import is a primary ingestion mode; enrichment must be ingestion-source agnostic.
- Every endpoint change story must update `deploy/test-pipeline.sh` (A16).
- Every story must include mandatory real-data E2E validation before review.
- Never introduce required env vars without updating config schema and documenting rationale.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 8, Story 8.1]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — module structure, API conventions, integration boundaries]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — EnrichmentPanel behavior and source/content separation]
- [Source: `apps/api/src/app.module.ts`]
- [Source: `apps/api/src/modules/search/search.service.ts`]
- [Source: `apps/api/src/modules/search/search.module.ts`]
- [Source: `packages/shared/src/schemas/index.ts`]
- [Source: `deploy/test-pipeline.sh`]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

None.

### Completion Notes List

- Story context created with architecture, testing, and deployment guardrails.
- Includes mandatory A16 smoke-test update task and mandatory E2E validation task.
- Includes ingestion-source-neutral acceptance criteria for text-paste-imported data.

### File List

- `_bmad-output/implementation-artifacts/8-1-enrichment-service-and-source-integration.md` (CREATED)
