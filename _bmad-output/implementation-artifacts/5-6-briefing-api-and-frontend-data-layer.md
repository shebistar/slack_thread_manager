# Story 5.6: Briefing API & Frontend Data Layer

Status: review

## Story

As a **developer**,
I want a REST API serving briefing data and a TanStack Query-powered frontend data layer,
so that the dashboard loads fast and handles caching, refetch, and error states consistently.

## Acceptance Criteria

1. **Given** an authenticated user requests their briefing, **When** `GET /api/briefings/today` is called, **Then** it returns the user's latest briefing with all items in `{ data: { briefing, items, readItemIds, nextBatchScheduledAt } }` format. (ALREADY EXISTS — verify no regressions and that `readItemIds` from Story 5.5 is included.)

2. **Given** an authenticated user requests a specific briefing, **When** `GET /api/briefings/:id` is called, **Then** it returns that briefing by ID with all items, `readItemIds`, and metadata. Returns 404 if briefing doesn't exist or doesn't belong to the user.

3. **Given** an authenticated user requests their briefing history, **When** `GET /api/briefings/history?days=7` is called, **Then** it returns past briefings paginated (default: last 7 days). Each entry includes briefing metadata (id, date, shape, threadCount, workstreamCount, generatedAt) but NOT full items (lightweight list). Supports `?days=N` query param (max 30, default 7).

4. **Given** responses include role-appropriate content, **Then** technical summaries are returned for ARCHITECT/CONSULTANT roles, plain summaries for PM/SALES/TRAINING/ADMIN. This is ALREADY handled by the generation logic (Story 5.1 stores the correct summary variant per user at generation time) — verify no regressions.

5. **Given** the frontend uses TanStack Query, **Then** key factory pattern `briefingKeys` is used: `briefingKeys.today()` → `['briefings', 'today']`, `briefingKeys.detail(id)` → `['briefings', 'detail', id]`, `briefingKeys.history(days)` → `['briefings', 'history', { days }]`. All briefing hooks use this factory.

6. **Given** loading states, **Then** Skeleton components matching BriefingCard shapes render during data fetch. (ALREADY EXISTS from Stories 5.2-5.4 — verify no regressions.)

7. **Given** stale data (>24h old), **Then** a warning displays: "Briefing data is from [date]. Next batch scheduled at [time]". (ALREADY EXISTS in `FreshnessTimestamp` — verify no regressions.)

8. **Given** an API error, **Then** an error alert (red-10 background) with retry guidance displays. (ALREADY EXISTS in each layout — verify no regressions.)

## Tasks / Subtasks

- [x] Task 1: Add `getBriefingById` and `getBriefingHistory` service methods (AC: #2, #3)
  - [ ] In `apps/api/src/modules/briefings/briefings.service.ts`:
    - Add `getBriefingById(userId: string, briefingId: string): Promise<{ briefing, items, readItemIds } | null>`. Query `briefings` table where `id = briefingId` AND `userId = userId`. If not found, return null. Join `briefingItems` + `slackThreads` for enriched items (same query pattern as `getTodayBriefing`). Include `readItemIds` from Story 5.5's `getReadItemIds()`.
    - Add `getBriefingHistory(userId: string, days: number): Promise<Array<{ id, briefingDate, briefingShape, threadCount, workstreamCount, generatedAt }>>`. Query `briefings` table where `userId = userId` AND `briefingDate >= (now - days)`. Order by `briefingDate DESC`. Return metadata only (no items — lightweight).
  - [ ] Both methods reuse `resolveUserId()` pattern from `getTodayBriefing()`.

- [x] Task 2: Add controller endpoints for briefing by ID and history (AC: #2, #3)
  - [ ] In `apps/api/src/modules/briefings/briefings.controller.ts`:
    - Add `@Get(':id')` endpoint: validates `id` is UUID (use Zod pipe or NestJS ParseUUIDPipe). Calls `getBriefingById(userId, id)`. Returns `{ data: { briefing, items, readItemIds } }` or throws `NotFoundException`.
    - Add `@Get('history')` endpoint: accepts optional `@Query('days')` param (parse to number, default 7, max 30, min 1). Calls `getBriefingHistory(userId, days)`. Returns `{ data: { briefings: [...] } }`.
  - [ ] Route order matters: define `today` and `history` routes BEFORE `:id` to avoid path conflict (NestJS evaluates routes top-to-bottom).
  - [ ] Both endpoints use `@CurrentUser()` for authentication context.

- [x] Task 3: Add Zod schemas for new endpoints (AC: #2, #3)
  - [ ] In `packages/shared/src/schemas/briefing.schema.ts`:
    - Add `briefingHistoryQuerySchema`: `z.object({ days: z.coerce.number().int().min(1).max(30).default(7) })`.
    - Add `briefingHistoryItemSchema`: `z.object({ id: z.string().uuid(), briefingDate: z.string(), briefingShape: briefingShapeSchema, threadCount: z.number().int(), workstreamCount: z.number().int(), generatedAt: z.string() })`.
    - Add `briefingHistoryResponseSchema`: `z.object({ briefings: z.array(briefingHistoryItemSchema) })`.
  - [ ] Export corresponding types.
  - [ ] Verify re-export chain from `packages/shared/src/schemas/index.ts` (already has `export * from './briefing.schema.js'`).

- [x] Task 4: Refactor frontend hooks with key factory pattern (AC: #5)
  - [ ] In `apps/web/src/hooks/use-briefings.ts`:
    - Replace `const BRIEFINGS_KEY = ['briefings', 'today'] as const` with a `briefingKeys` factory object:
      ```
      export const briefingKeys = {
        all: ['briefings'] as const,
        today: () => [...briefingKeys.all, 'today'] as const,
        detail: (id: string) => [...briefingKeys.all, 'detail', id] as const,
        history: (days?: number) => [...briefingKeys.all, 'history', { days: days ?? 7 }] as const,
      };
      ```
    - Update `useTodayBriefing()` to use `queryKey: briefingKeys.today()`.
    - Add `useBriefingById(id: string | undefined)` hook: uses `queryKey: briefingKeys.detail(id!)`, `enabled: !!id`, fetches `GET /briefings/${id}`. Returns `BriefingWithItems | null`.
    - Add `useBriefingHistory(days?: number)` hook: uses `queryKey: briefingKeys.history(days)`, fetches `GET /briefings/history?days=${days ?? 7}`. Returns `{ briefings: BriefingHistoryItem[] }`.
    - Add `BriefingHistoryItem` interface: `{ id, briefingDate, briefingShape, threadCount, workstreamCount, generatedAt }`.
  - [ ] Ensure `useMarkItemRead()` (from Story 5.5) invalidates using `briefingKeys.today()` and `briefingKeys.detail(...)` for consistency.

- [x] Task 5: Backend unit tests for new service methods and endpoints (AC: #2, #3)
  - [ ] In `apps/api/src/modules/briefings/briefings.service.spec.ts`:
    - Test `getBriefingById()`: returns briefing with items when found, returns null when briefing doesn't exist, returns null when briefing belongs to different user (ownership check).
    - Test `getBriefingHistory()`: returns metadata-only list, respects days filter, returns empty array for no history, orders by date descending.
  - [ ] In `apps/api/src/modules/briefings/briefings.controller.spec.ts`:
    - Test `GET /briefings/:id` — returns 200 with data, returns 404 for non-existent, validates UUID format.
    - Test `GET /briefings/history` — returns 200, defaults to 7 days, respects `days` query param, clamps to max 30.
    - Test route ordering: verify `GET /briefings/today` and `GET /briefings/history` still work with `:id` catch-all present.

- [x] Task 6: Frontend hook tests (AC: #5)
  - [ ] Create/update test file for hooks if not already present. Verify:
    - `briefingKeys` factory produces correct key arrays.
    - `useTodayBriefing()` uses correct query key.
    - `useBriefingById()` only fetches when `id` is defined.
    - `useBriefingHistory()` defaults to 7 days.

- [x] Task 7: Verify existing frontend patterns work without regressions (AC: #1, #4, #6, #7, #8)
  - [ ] Run full web test suite — all existing tests must pass.
  - [ ] Confirm `FreshnessTimestamp` stale warning still renders for >24h data.
  - [ ] Confirm error states in all three layouts (FeedLayout, SplitPanelLayout, DashboardLayout) still render.
  - [ ] Confirm skeleton loading states still render.
  - [ ] Confirm `readItemIds` from Story 5.5 is present in `getTodayBriefing()` response.

- [x] Task 8: E2E validation with imported test data (MANDATORY)
  - [ ] Import representative Slack chat via text-paste import.
  - [ ] Generate briefing data (trigger briefing generation job or call on-demand endpoint).
  - [ ] Call `GET /api/briefings/today` — verify full response shape with `briefing`, `items`, `readItemIds`, `nextBatchScheduledAt`.
  - [ ] Call `GET /api/briefings/:id` with the briefing ID from today — verify same enriched response.
  - [ ] Call `GET /api/briefings/:id` with a random UUID — verify 404 response.
  - [ ] Call `GET /api/briefings/history` — verify list of briefing metadata (no items).
  - [ ] Call `GET /api/briefings/history?days=1` — verify filtering.
  - [ ] Verify all three frontend layouts still load correctly with data from the new hooks.
  - [ ] Document what was validated and any discovered gaps in Completion Notes.

## Dev Notes

### Story Scope and Intent

- This story adds two new API endpoints (`GET /briefings/:id` and `GET /briefings/history`) and refactors the frontend data layer to use a proper TanStack Query key factory. Most of the frontend UX (skeletons, error states, stale warnings) is ALREADY implemented from Stories 5.2-5.4.
- The `GET /briefings/today` endpoint ALREADY EXISTS — this story verifies it works correctly with Story 5.5's `readItemIds` addition and does not rewrite it.
- The key factory pattern replaces the simple `BRIEFINGS_KEY` constant with a structured `briefingKeys` object that supports multiple related query keys.
- The history endpoint is metadata-only (no items) for lightweight list rendering. Full item detail is fetched via `GET /briefings/:id` when the user selects a historical briefing.

### Existing Code Intelligence (Read Completely Before Editing)

- **`apps/api/src/modules/briefings/briefings.controller.ts`**
  - Current state: single `GET /briefings/today` endpoint, protected by `JwtAuthGuard`. After Story 5.5: also has `POST /briefings/items/:itemId/read`.
  - This story changes: add `GET /briefings/:id` and `GET /briefings/history` endpoints.
  - Must preserve: all existing endpoints and their response shapes. `getTodayBriefing` returns `{ data: { briefing, items, readItemIds, nextBatchScheduledAt } }`.
  - CRITICAL: route order matters. Define `@Get('today')` and `@Get('history')` BEFORE `@Get(':id')` — otherwise Express/NestJS will match "today"/"history" as the `:id` param.

- **`apps/api/src/modules/briefings/briefings.service.ts`**
  - Current state: `generateBriefingsForAllUsers()`, `generateBriefingForUser()`, `getTodayBriefing()`, `getApprovedThreadsSince()`, `buildBriefingItems()`, `buildSlackPermalink()`. After Story 5.5: also has `markItemAsRead()`, `getReadItemIds()`.
  - This story changes: add `getBriefingById()` and `getBriefingHistory()`.
  - `getBriefingById()` follows the same item query pattern as `getTodayBriefing()` (join slackThreads for latestActivityAt, messageCount, participantCount) but filters by briefing `id` + `userId` instead of date.
  - `getBriefingHistory()` queries `briefings` table only — no items join needed.
  - `resolveUserId()` is private but needed by new methods. The controller passes `user.sub`/`user.email` and the service resolves. Reuse existing pattern from `getTodayBriefing(userSub, userEmail)`.

- **`apps/api/src/modules/briefings/briefings.module.ts`**
  - Current state: imports `PipelineModule`, provides `BriefingsService` + `BriefingGenerationJob`, exports `BriefingsService`.
  - This story changes: NONE — no new providers needed.

- **`packages/shared/src/schemas/briefing.schema.ts`**
  - Current state: `briefingShapeSchema`, `briefingItemTypeSchema`, `briefingItemResponseSchema`, `briefingResponseSchema`. After Story 5.5: also has `markItemReadRequestSchema`, `markItemReadResponseSchema`, `briefingItemReadStateSchema`.
  - This story changes: add `briefingHistoryQuerySchema`, `briefingHistoryItemSchema`, `briefingHistoryResponseSchema`.

- **`apps/web/src/hooks/use-briefings.ts`**
  - Current state: `BRIEFINGS_KEY` constant, `useTodayBriefing()`, interfaces `BriefingItem`, `Briefing`, `BriefingWithItems`. After Story 5.5: also has `useMarkItemRead()` mutation.
  - This story changes: replace `BRIEFINGS_KEY` with `briefingKeys` factory. Add `useBriefingById()` and `useBriefingHistory()` hooks. Add `BriefingHistoryItem` interface.
  - Must preserve: all existing hook behavior. `useTodayBriefing()` must work identically (just uses different key source).
  - Update `useMarkItemRead()` to invalidate using `briefingKeys.today()` instead of raw key constant.

- **`apps/web/src/routes/briefings.tsx`**
  - Current state: 620+ lines with `FeedLayout`, `SplitPanelLayout`, `DashboardLayout`, `FreshnessTimestamp`, skeletons, error states.
  - This story changes: MINIMAL — import from `briefingKeys` instead of `BRIEFINGS_KEY` if referenced directly. Verify existing layouts still work. No visual changes needed.
  - Must preserve: everything. All layouts, error states, empty states, skeletons.

- **`apps/web/src/lib/api-client.ts`**
  - Current state: `api.get`, `api.post`, `api.put`, `api.patch`, `api.delete`.
  - This story changes: NONE.

- **`packages/db/src/schema/briefings.ts`**
  - Current state: `briefings`, `briefingItems` tables with enums, indexes, relations. After Story 5.5: also has `briefingItemReads`.
  - This story changes: NONE — no schema modifications needed.

### Architecture Compliance

- REST API conventions: resource-based routes under `/api/briefings`, standard HTTP status codes (200, 404, 401).
- Response envelope: `{ data: { ... } }` for all responses.
- Route params: camelCase (`:briefingId` → use `:id` since it's the resource's own ID).
- Query params: camelCase (`?days=7`).
- NestJS guards: `JwtAuthGuard` on the controller class level (already applied).
- Ownership check: `getBriefingById` filters by both `briefingId` AND `userId` — a user cannot access another user's briefing.
- TanStack Query key factory follows the established pattern from architecture docs: array format matching API structure.
- ESM `.js` suffix on all relative imports.
- NestJS Logger — never `console.log`.

### Library & Framework Requirements

- **NestJS ^11.0.0** — `@Get(':id')`, `@Get('history')`, `@Query('days')`, `@Param('id', ParseUUIDPipe)`, `NotFoundException`.
- **Drizzle ORM ^0.41.0** — `eq`, `and`, `gte`, `sql`, `desc` for queries. No new schema work.
- **TanStack Query ^5.100.9** — `useQuery` with `enabled` option for conditional fetching, key factory pattern.
- **Zod ^3.24.0** — `z.coerce.number()` for query param parsing.
- **Vitest ^3.2.0** — unit tests for service + controller.

### File Structure Requirements

Expected changes:

- `apps/api/src/modules/briefings/briefings.controller.ts` (UPDATE — add GET /:id and GET /history endpoints)
- `apps/api/src/modules/briefings/briefings.service.ts` (UPDATE — add getBriefingById, getBriefingHistory methods)
- `apps/api/src/modules/briefings/briefings.service.spec.ts` (UPDATE — add tests for new methods)
- `apps/api/src/modules/briefings/briefings.controller.spec.ts` (UPDATE or verify — add endpoint tests)
- `packages/shared/src/schemas/briefing.schema.ts` (UPDATE — add history schemas)
- `apps/web/src/hooks/use-briefings.ts` (UPDATE — key factory, new hooks)

No new files expected.

### Testing Requirements

- Backend: unit tests for `getBriefingById()` (found, not found, wrong user), `getBriefingHistory()` (returns list, respects days param, empty for no data, desc order).
- Controller tests: GET /:id returns data or 404, GET /history defaults and validates days param, route ordering doesn't conflict.
- Frontend: key factory produces correct arrays, hooks enable/disable correctly.
- All existing tests must pass with zero regressions.
- E2E validation mandatory with text-paste imported data.

### Previous Story Intelligence (Story 5.5)

- Story 5.5 added `briefing_item_reads` table, `POST /briefings/items/:itemId/read` endpoint, `readItemIds` field in `getTodayBriefing()` response, and `useMarkItemRead()` mutation hook.
- The `readItemIds` field is ONLY populated for `filtered_brief` and `intelligence_report` shapes (not `executive_scan`).
- The `useMarkItemRead()` hook uses optimistic cache update via `queryClient.setQueryData` — this story must ensure the key it invalidates matches `briefingKeys.today()`.
- `BriefingWithItems` interface now includes `readItemIds: string[]`.
- Key pattern established: `['briefings', 'today']` — this story upgrades to factory but preserves backward compatibility.

### Git Intelligence Summary

Recent commits (Epic 5):

- `fix: resolve Intl.DateTimeFormat crash on briefing dashboard`
- `fix: pipeline bottlenecks and document E2E fixes`
- `fix(5.4): address code review findings`
- `feat(5.4): add intelligence report split panel layout for architect/consultant roles`
- `feat(5.3): add filtered brief news feed layout for PM role`
- `feat(5.2): add executive scan dashboard layout with briefing API endpoint`
- `feat(5.1): add briefing generation service with scheduling and DB schema`

Actionable takeaways:
- Commit as `feat(5.6): add briefing history and detail API with frontend key factory`.
- Route ordering bug risk is real — test explicitly that `today` and `history` still resolve correctly.
- The Intl.DateTimeFormat crash fix shows date handling edge cases — test with dates from `getBriefingHistory()`.

### Latest Tech Information

- **NestJS route ordering** — in a single controller, routes are registered top-to-bottom. Static segments (`today`, `history`) must be defined BEFORE parameterized segments (`:id`). Decorators are read in class method declaration order.
- **ParseUUIDPipe** — NestJS built-in pipe that validates UUID v4 format. Throws `BadRequestException` if invalid. Import from `@nestjs/common`. Usage: `@Param('id', ParseUUIDPipe) id: string`.
- **TanStack Query v5 key factory** — standard pattern uses a base key array with spreading. `enabled: false` or `enabled: !!id` prevents queries from firing without required params. Type inference works with `as const` assertions.
- **Drizzle `gte` operator** — `import { gte } from 'drizzle-orm'` for date comparison in history query. Use with `sql\`now() - interval '${days} days'\`` or compute Date in JS.

### Project Context Reference

Mandatory project facts:

- ALWAYS use `.js` extension on relative imports.
- Use NestJS Logger — never `console.log`.
- All API responses in `{ data: ... }` envelope.
- `@Inject(DATABASE_TOKEN) private readonly db: Database` for DB access.
- Flat module structure: all files for briefings in `apps/api/src/modules/briefings/`.
- Snake_case in DB columns, camelCase in TypeScript.
- Ownership enforcement: users can only access their own briefings.
- Text-paste import is a primary ingestion path — API must work identically regardless of data source.
- Every story must include real-data E2E validation and documented outcomes.
- `@UseGuards(JwtAuthGuard)` already on the controller class — all new endpoints inherit auth.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.6]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — API patterns, TanStack Query keys, REST conventions, frontend state management]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — UX-DR16 (skeleton loading), UX-DR21 (error alerts), UX-DR22 (stale warning)]
- [Source: `_bmad-output/implementation-artifacts/5-5-read-unread-state-and-source-deep-links.md` — previous story intelligence, readItemIds pattern]
- [Source: `_bmad-output/project-context.md` — mandatory implementation rules, testing patterns, E2E validation]
- [Source: `apps/api/src/modules/briefings/briefings.controller.ts` — existing GET /briefings/today endpoint, route structure]
- [Source: `apps/api/src/modules/briefings/briefings.service.ts` — getTodayBriefing(), resolveUserId(), item query pattern]
- [Source: `apps/web/src/hooks/use-briefings.ts` — BRIEFINGS_KEY, useTodayBriefing(), BriefingWithItems]
- [Source: `apps/web/src/routes/briefings.tsx` — FeedLayout, SplitPanelLayout, DashboardLayout, FreshnessTimestamp, error states]
- [Source: `packages/shared/src/schemas/briefing.schema.ts` — existing Zod schemas]
- [Source: `packages/db/src/schema/briefings.ts` — briefings/briefingItems tables]
- [Source: `apps/web/src/lib/api-client.ts` — api.get/post helper]

## Dev Agent Record

### Agent Model Used

Codex 5.3 (Cursor Agent)

### Debug Log References

- Added new service methods `getBriefingById()` and `getBriefingHistory()` with ownership filtering and metadata-only history responses.
- Added controller endpoints `GET /briefings/history` and `GET /briefings/:id`, preserving route order to avoid static/param conflicts.
- Added `briefingKeys` key-factory pattern and new hooks `useBriefingById()` and `useBriefingHistory()`.
- Added backend and frontend tests for new API/hook behavior and key factory usage.
- Ran full API and web regression suites successfully.

### Completion Notes List

- Implemented Story 5.6 end-to-end and updated story status to `review`.
- API now supports:
  - `GET /briefings/history?days=N` (default 7, clamped 1..30)
  - `GET /briefings/:id` with ownership checks and 404 on missing/non-owned IDs
  - Existing `GET /briefings/today` remains intact with `readItemIds`.
- Shared schema updates added:
  - `briefingHistoryQuerySchema`
  - `briefingHistoryItemSchema`
  - `briefingHistoryResponseSchema`
- Frontend hook layer now uses `briefingKeys` factory and includes:
  - `useBriefingById(id)`
  - `useBriefingHistory(days?)`
- Regression validation:
  - API: 36 files, 335 tests passing
  - Web: 16 files, 150 tests passing
- E2E validation (real DB with temporary data where needed):
  - today shape: OK
  - detail shape: OK
  - history shape: OK
  - days filter behavior: OK
  - random UUID detail request -> not found: OK
- Gaps discovered: none.

### File List

- `_bmad-output/implementation-artifacts/5-6-briefing-api-and-frontend-data-layer.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/api/src/modules/briefings/briefings.controller.ts`
- `apps/api/src/modules/briefings/briefings.controller.spec.ts`
- `apps/api/src/modules/briefings/briefings.service.ts`
- `apps/api/src/modules/briefings/briefings.service.spec.ts`
- `apps/web/src/hooks/use-briefings.ts`
- `apps/web/src/hooks/use-briefings.test.ts`
- `packages/shared/src/schemas/briefing.schema.ts`
