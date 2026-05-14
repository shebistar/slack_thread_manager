# Story 5.5: Read/Unread State & Source Deep-Links

Status: done

## Story

As a **team member**,
I want to track which briefing items I've already reviewed and jump directly to the original Slack thread,
so that I can resume scanning without re-reading and verify any summary with one click.

## Acceptance Criteria

1. **Given** a briefing is displayed with multiple BriefingCards, **When** a user interacts with a card (expands in News Feed, selects in Split Panel), **Then** the card transitions from `unread` state (full opacity, 2px left border in workstream color) to `read` state (opacity 0.6, no left border) — UX-DR12.

2. **Given** a user marks a briefing item as read, **When** they navigate away and return, **Then** the read state persists across page navigation and browser refreshes (stored via API: `briefing_item_reads` table with `user_id`, `briefing_item_id`, `read_at`).

3. **Given** read state is persisted, **When** the next daily briefing is generated (new briefing = fresh slate), **Then** read state resets — previous day's reads do not carry over because the new briefing has new `briefing_item` IDs.

4. **Given** every BriefingCard (standard and compact variants), **Then** it includes a "View in Slack →" link (blue-50, right-aligned, opens in new tab via `target="_blank"`) — UX-DR13. This is ALREADY implemented — verify no regressions.

5. **Given** the deep-link URL, **Then** it points to the specific thread message in Slack (using `thread_ts` for permalink construction). This is ALREADY implemented via `buildSlackPermalink()` in `briefings.service.ts` — verify no regressions.

6. **Given** the Executive Scan (Dashboard) layout, **Then** it does NOT use read state — it's a snapshot view (UX-DR12 exception). Compact cards in the Key Decisions panel show no read/unread visual distinction.

7. **Given** content ingested via text-paste import that reaches approved/delivered states, **When** read/unread state is applied, **Then** behavior is identical to Slack API-ingested content — the read tracking is per `briefing_item_id` regardless of ingestion source.

## Tasks / Subtasks

- [x] Task 1: Add `briefing_item_reads` table to DB schema + generate migration (AC: #2, #3)
  - [x] Create the `briefingItemReads` table in `packages/db/src/schema/briefings.ts` with columns: `id` (uuid PK), `userId` (uuid FK → users.id), `briefingItemId` (uuid FK → briefing_items.id, onDelete cascade), `readAt` (timestamp with timezone, defaultNow).
  - [x] Add unique constraint on `(userId, briefingItemId)` — a user can only mark the same item read once.
  - [x] Add index on `userId` for fast lookup of all reads by a user.
  - [x] Add Drizzle relations: `briefingItemReads` → `users` (many-to-one), `briefingItemReads` → `briefingItems` (many-to-one). Also add a `reads` relation on `briefingItems` (one-to-many).
  - [x] Export types: `BriefingItemRead`, `NewBriefingItemRead`.
  - [x] Re-export from `packages/db/src/schema/index.ts`.
  - [x] Run `pnpm db:generate` from `packages/db` to create migration SQL.
  - [x] Verify migration file is generated in `packages/db/src/migrations/`.

- [x] Task 2: Add Zod schemas for read-state API (AC: #2)
  - [x] In `packages/shared/src/schemas/briefing.schema.ts`, add:
    - `markItemReadResponseSchema`: `z.object({ briefingItemId: z.string().uuid(), readAt: z.string() })`.
  - [x] Export corresponding TypeScript types.
  - [x] Verify re-export from `packages/shared/src/schemas/index.ts` (already has `export * from './briefing.schema.js'`).

- [x] Task 3: Add read-state API endpoints to BriefingsController (AC: #2, #6)
  - [x] `POST /briefings/items/:itemId/read` — marks a single briefing item as read for the authenticated user. Uses upsert (`onConflictDoNothing`) to be idempotent. Returns `{ data: { briefingItemId, readAt } }` with `HttpStatus.CREATED`. Validates `itemId` is a valid UUID.
  - [x] Extend `GET /briefings/today` response to include a `readItemIds: string[]` field alongside existing `briefing`, `items`, `nextBatchScheduledAt`. This is an array of `briefing_item_id` values that the current user has marked as read. Query: join `briefing_item_reads` where `userId = currentUser` and `briefingItemId IN (item ids from this briefing)`.
  - [x] The `readItemIds` field is ONLY populated for `filtered_brief` and `intelligence_report` shapes. For `executive_scan`, return `readItemIds: []` (empty array — Dashboard does not use read state per AC #6).

- [x] Task 4: Add read-state service methods in BriefingsService (AC: #2)
  - [x] `markItemAsRead(userId: string, briefingItemId: string): Promise<{ briefingItemId: string; readAt: Date }>` — upsert into `briefing_item_reads`. Use `onConflictDoNothing` on unique `(userId, briefingItemId)`. If conflict (already read), return existing read record. If item does not exist, throw `NotFoundException`.
  - [x] `getReadItemIds(userId: string, briefingId: string): Promise<string[]>` — returns array of briefing_item_ids that this user has marked as read for the given briefing. Used by `getTodayBriefing()`.
  - [x] Modify `getTodayBriefing()` to call `getReadItemIds()` and include result in response.

- [x] Task 5: Update frontend types and data layer for read state (AC: #1, #2)
  - [x] In `apps/web/src/hooks/use-briefings.ts`:
    - Add `readItemIds: string[]` to `BriefingWithItems` interface.
    - Create `useMarkItemRead()` mutation hook: calls `POST /briefings/items/:itemId/read` via `api.post`. On success, use optimistic update: immediately add the itemId to the local `readItemIds` array in the cached `BriefingWithItems` data via `queryClient.setQueryData`. Also call `queryClient.invalidateQueries` on settled to ensure server consistency.
  - [x] The mutation should NOT trigger a full page re-render — use TanStack Query's `setQueryData` for snappy visual feedback.

- [x] Task 6: Add read/unread visual states to BriefingCard (AC: #1, #6)
  - [x] Add new optional prop to `BriefingCardProps`: `isRead?: boolean`.
  - [x] **Unread state** (default, `isRead` falsy): full opacity. For standard/featured variant: 2px left border in `--color-blue-50` (workstream accent). This left border is NEW and applies to all standard/featured cards that are unread.
  - [x] **Read state** (`isRead` true): card wrapper gets `opacity-60`. Remove the workstream-color left border. The `gone_quiet` and `orphaned_action` left borders (yellow-30) should still be suppressed when read — read state takes visual precedence.
  - [x] **Interaction with `selected` state** (Split Panel): when a card is both `selected` AND `read`, the `selected` styling (blue border + blue-10 bg) takes precedence over read opacity. The card should NOT appear at 0.6 opacity while actively selected.
  - [x] **Compact variant**: NO read/unread visual changes. Compact is used in Dashboard Key Decisions panel which does not use read state (AC #6).
  - [x] Transition: `opacity` change uses `transition-opacity duration-200 ease-out motion-reduce:transition-none`.

- [x] Task 7: Wire read-state into FeedLayout and SplitPanelLayout (AC: #1, #6)
  - [x] In `briefings.tsx` **FeedLayout**: pass `isRead` prop to each `BriefingCard` and `FeedFeaturedCard`. Derive from `readItemIds` in the briefing data. When user expands a card (existing `onClick` on the expand button), call `markItemRead` mutation for that item.
  - [x] In `briefings.tsx` **SplitPanelLayout**: pass `isRead` prop to each `BriefingCard`. When user selects a card (`onSelect` callback), call `markItemRead` mutation for that item.
  - [x] In `briefings.tsx` **DashboardLayout**: do NOT pass `isRead` to compact cards. No mutations. No visual changes.
  - [x] Ensure the `FeedFeaturedCard` component also receives and passes `isRead` to its inner `BriefingCard`.

- [x] Task 8: Backend tests for read-state service and controller (AC: #2, #6)
  - [x] In `briefings.service.spec.ts` (or create if doesn't exist): test `markItemAsRead()` — successful insert, idempotent re-read (conflict does nothing), NotFoundException for invalid item.
  - [x] Test `getReadItemIds()` — returns correct IDs, returns empty for no reads.
  - [x] Test `getTodayBriefing()` — verify `readItemIds` is included in response, verify it's empty array for executive_scan shape.
  - [x] In `briefings.controller.spec.ts` (or create if doesn't exist): test `POST /briefings/items/:itemId/read` — returns 201, idempotent, validates UUID.

- [x] Task 9: Frontend tests for read-state UI (AC: #1, #6)
  - [x] In `briefing-card.test.tsx`: add tests for:
    - Unread state: standard card has full opacity and left border `border-l-[--color-blue-50]`.
    - Read state: standard card has `opacity-60` class and no left border.
    - Read + selected: selected state overrides read opacity (no `opacity-60` when selected).
    - Read + gone_quiet: gone_quiet yellow border removed, opacity applied.
    - Compact variant: `isRead` prop does not affect visual output.
  - [x] Verify all existing 138+ web tests continue passing with zero regressions.

- [x] Task 10: E2E validation with imported test data (MANDATORY)
  - [x] Applied migration to local DB via `pnpm push`.
  - [x] Ran E2E validation script against real PostgreSQL database.
  - [x] Verified: table creation, insert read record, persistence, unique constraint idempotency, FK cascade on delete.
  - [x] All operations confirmed working with real DB data.
  - [x] Source deep-links (`sourceThreadUrl`) remain functional — no regressions (verified through existing tests passing).
  - [x] Document what was validated and any discovered gaps in Completion Notes.

## Dev Notes

### Story Scope and Intent

- This story adds **server-persisted read/unread state** for briefing items, enabling users to track their scanning progress across sessions. Read state is stored in a new `briefing_item_reads` junction table and returned alongside briefing data.
- Deep-links to source Slack threads are ALREADY fully implemented (via `buildSlackPermalink()` in the service and "View in Slack →" links in BriefingCard). This story verifies no regressions — no new deep-link work is needed.
- Read state applies to **FeedLayout** (PM role) and **SplitPanelLayout** (ARCHITECT/CONSULTANT roles) only. **DashboardLayout** (SALES/TRAINING/ADMIN) is explicitly excluded per the UX spec (it's a snapshot, not a scanning experience).
- Read state resets naturally with each new daily briefing because new `briefing_items` rows get new UUIDs — no explicit "reset" logic needed.

### Existing Code Intelligence (Read Completely Before Editing)

- **`packages/db/src/schema/briefings.ts`**
  - Current state: defines `briefings` table and `briefingItems` table with enums, indexes, and relations. Types exported: `Briefing`, `NewBriefing`, `BriefingItem`, `NewBriefingItem`, `BriefingShapeValue`, `BriefingItemTypeValue`.
  - This story changes: add `briefingItemReads` table, its relations, and exported types in the SAME file.
  - Must preserve: all existing tables, enums, indexes, relations, type exports.

- **`packages/db/src/schema/index.ts`**
  - Current state: re-exports from 11 schema files including `briefings.js`.
  - This story changes: NONE — `briefingItemReads` is in `briefings.ts`, already re-exported.

- **`apps/api/src/modules/briefings/briefings.service.ts`**
  - Current state: `BriefingsService` with `generateBriefingsForAllUsers()`, `generateBriefingForUser()`, `getTodayBriefing()`, `buildBriefingItems()`, `buildSlackPermalink()`. Injects `DATABASE_TOKEN`.
  - This story changes: add `markItemAsRead()` and `getReadItemIds()` methods. Modify `getTodayBriefing()` to include `readItemIds` in its return value.
  - Must preserve: all existing methods and their behavior. `buildSlackPermalink()` is correct and should not be touched.
  - `getTodayBriefing()` currently returns `{ briefing, items }` — extend to `{ briefing, items, readItemIds }`.
  - The `resolveUserId()` private method is already available for user lookup by email/sub.

- **`apps/api/src/modules/briefings/briefings.controller.ts`**
  - Current state: single `GET /briefings/today` endpoint protected by `JwtAuthGuard`. No `@Roles` decorator — all authenticated users can access.
  - This story changes: add `POST /briefings/items/:itemId/read` endpoint. Extend `getTodayBriefing()` response to include `readItemIds`.
  - Must preserve: existing `GET today` endpoint shape (adding `readItemIds` to `data` object alongside existing fields).
  - Import `Param`, `Post`, `HttpCode`, `HttpStatus`, `NotFoundException` from `@nestjs/common`.
  - Use `ZodValidationPipe` for the `itemId` param (validate UUID format).

- **`apps/api/src/modules/briefings/briefings.module.ts`**
  - Current state: imports `PipelineModule`, provides `BriefingsService` + `BriefingGenerationJob`, exports `BriefingsService`.
  - This story changes: NONE — no new providers needed, `briefingItemReads` table is accessed through existing `BriefingsService`.

- **`packages/shared/src/schemas/briefing.schema.ts`**
  - Current state: exports `briefingShapeSchema`, `briefingItemTypeSchema`, `briefingItemResponseSchema`, `briefingResponseSchema` with types. Uses UPPER_CASE enum values (e.g., `'EXECUTIVE_SCAN'`).
  - This story changes: add `markItemReadRequestSchema`, `markItemReadResponseSchema`, `briefingItemReadStateSchema`.
  - Must preserve: all existing schemas and exports.

- **`apps/web/src/hooks/use-briefings.ts`**
  - Current state: `useTodayBriefing()` hook, `BriefingItem`, `Briefing`, `BriefingWithItems` interfaces. `BRIEFINGS_KEY = ['briefings', 'today']`.
  - This story changes: add `readItemIds: string[]` to `BriefingWithItems`. Add `useMarkItemRead()` mutation hook.
  - Must preserve: existing hook, types, key.

- **`apps/web/src/components/briefing-card/briefing-card.tsx`**
  - Current state: `BriefingCardProps` with `selected?`, `onSelect?`. Standard/featured variant has expand/collapse or select mode. Compact variant. `StandardCardHeader` helper component. Deep-link "View in Slack →" with `stopPropagation`.
  - This story changes: add `isRead?: boolean` prop. Add visual states: unread (left border + full opacity) → read (no left border + opacity 0.6). Handle interaction with `selected` and `gone_quiet`/`orphaned_action` states.
  - Must preserve: all existing visual states, expand/collapse behavior, selection behavior, deep-link rendering. Do NOT break backward compatibility.

- **`apps/web/src/routes/briefings.tsx`**
  - Current state: 620 lines. `FeedLayout`, `SplitPanelLayout`, `DashboardLayout`, `SidePanel`, skeletons, `FreshnessTimestamp`. `ITEM_TYPE_PRIORITY` for sorting.
  - This story changes: wire `isRead` into FeedLayout and SplitPanelLayout cards. Add `markItemRead` mutation calls on card interaction (expand / select). Pass `readItemIds` from briefing data.
  - Must preserve: all existing layouts, error/empty states, skeletons, FreshnessTimestamp, DashboardPanels, side panel behavior. Do NOT reorganize or refactor existing code.
  - FeedLayout: the expand `onClick` on the `<button>` inside the card (when `onSelect` is NOT provided) is where to trigger the mark-read mutation.
  - SplitPanelLayout: the `onSelect` callback is where to trigger the mark-read mutation.

- **`apps/web/src/lib/api-client.ts`**
  - Current state: `api.get`, `api.post`, `api.put`, `api.patch`, `api.delete` methods.
  - This story changes: NONE — `useMarkItemRead()` will use existing `api.post`.

### Architecture Compliance

- New `briefing_item_reads` table follows Drizzle ORM patterns: `pgTable`, `uuid().primaryKey().defaultRandom()`, `references(() => ...)`, `timestamp({ withTimezone: true })`.
- `onDelete: 'cascade'` on `briefingItemId` FK — when a briefing item is deleted (via briefing cascade), reads are cleaned up automatically.
- API: `POST` for creating a read record, returns `201 CREATED`. Idempotent via `onConflictDoNothing`.
- Response shape: `{ data: { briefingItemId, readAt } }` — follows existing envelope pattern.
- Frontend: TanStack Query `useMutation` with optimistic update via `queryClient.setQueryData` for snappy UI, `invalidateQueries` on settled for server consistency.
- ESM `.js` suffix on all relative imports.
- NestJS Logger — never `console.log`.
- Zod schemas in `packages/shared` — frontend and backend share types.

### Library & Framework Requirements

- **Drizzle ORM ^0.41.0** — use `pgTable`, `uuid`, `timestamp`, `uniqueIndex`, `index`, `relations`. Use `.onConflictDoNothing()` for upsert-style idempotent writes.
- **TanStack Query ^5.100.9** — `useMutation` with `onMutate` for optimistic update (update cache via `queryClient.setQueryData`), `onSettled` for `invalidateQueries`. Use `queryClient.cancelQueries` in `onMutate` to prevent races.
- **Vitest ^3.2.0** — all test mocks use `vi.fn()`, `vi.fn().mockResolvedValue()`.
- **Zod ^3.24.0** — request/response validation schemas.

### File Structure Requirements

Expected changes:

- `packages/db/src/schema/briefings.ts` (UPDATE — add `briefingItemReads` table, relations, types)
- `packages/db/src/migrations/XXXX_*.sql` (NEW — auto-generated by `pnpm db:generate`)
- `packages/db/src/migrations/meta/XXXX_snapshot.json` (NEW — auto-generated)
- `packages/shared/src/schemas/briefing.schema.ts` (UPDATE — add read-state schemas)
- `apps/api/src/modules/briefings/briefings.controller.ts` (UPDATE — add POST endpoint, extend GET response)
- `apps/api/src/modules/briefings/briefings.service.ts` (UPDATE — add read methods, extend getTodayBriefing)
- `apps/api/src/modules/briefings/briefings.service.spec.ts` (UPDATE or NEW — add read-state tests)
- `apps/api/src/modules/briefings/briefings.controller.spec.ts` (UPDATE or NEW — add endpoint test)
- `apps/web/src/hooks/use-briefings.ts` (UPDATE — add readItemIds, useMarkItemRead mutation)
- `apps/web/src/components/briefing-card/briefing-card.tsx` (UPDATE — add isRead prop, visual states)
- `apps/web/src/components/briefing-card/briefing-card.test.tsx` (UPDATE — add read state tests)
- `apps/web/src/routes/briefings.tsx` (UPDATE — wire isRead and mutations into layouts)

No new files expected beyond auto-generated migrations.

### Testing Requirements

- Backend: unit tests for `markItemAsRead()` (success, idempotent, not found), `getReadItemIds()` (returns correct IDs, empty for no reads), `getTodayBriefing()` with `readItemIds` field.
- Frontend: component tests for BriefingCard read/unread visual states, interaction with selected and item-type states. Compact variant unaffected.
- All existing 138+ web tests must continue passing with zero regressions.
- E2E validation mandatory with text-paste imported data.

### Previous Story Intelligence (Story 5.4)

- Story 5.4 implemented the Split Panel layout with selectable BriefingCards, collapsible side panel, and keyboard accessibility. All 138 web tests pass.
- **Review findings applied in 5.4:** switched to `role="listbox"` / `role="option"` / `aria-selected` pattern. Added `focus-visible` ring. Fixed stale `selectedItemId` via `useEffect`. Suppressed `gone_quiet`/`orphaned_action` background when `selected`. Added Space-key test.
- **Key patterns to follow from 5.4:**
  - Add props to `BriefingCardProps` (not a new component).
  - Keep layouts within `briefings.tsx` — do NOT extract to separate files.
  - Use `useMemo` for derived data.
  - Use CSS custom properties via `text-[--color-*]` / `bg-[--color-*]` / `border-[--color-*]`.
  - Motion-reduce respect: `motion-reduce:transition-none` on all transitions.
  - `stopPropagation()` on deep-link `<a>` clicks to prevent parent card interactions.
- **No gaps were discovered** in 5.4 E2E validation.
- Deferred gap from 5.4: route-level tests for SplitPanelLayout (pre-existing gap in route test infrastructure).

### Git Intelligence Summary

Recent commits (Epic 5):

- `fix(5.4): address code review findings` — aria-selected, focus ring, stale selectedItemId, CSS conflicts
- `feat(5.4): add intelligence report split panel layout for architect/consultant roles`
- `chore(5.3): mark story done after code review`
- `fix(5.3): align feed card visibility with acceptance criteria`
- `feat(5.3): add filtered brief news feed layout for PM role`
- `feat(5.2): add executive scan dashboard layout with briefing API endpoint`
- `feat(5.1): add briefing generation service with scheduling and DB schema`

Actionable takeaways:
- Commit as `feat(5.5): add read/unread state tracking with briefing_item_reads persistence`.
- Include migration files in the commit.
- Recent code review fixes show importance of handling CSS class interactions (selected + gone_quiet + read).

### Latest Tech Information

- **Drizzle ORM** — `onConflictDoNothing({ target: [...] })` is the correct pattern for idempotent inserts. Use `uniqueIndex` for the constraint that powers the conflict detection.
- **TanStack Query v5** — `useMutation` with optimistic updates uses `onMutate` to cancel in-flight queries, snapshot previous data, and update cache directly. Return snapshot from `onMutate` for rollback in `onError`. Use `onSettled` for `invalidateQueries` to ensure eventual consistency.
- **NestJS** — `@Param('itemId')` with custom validation for UUID format. `@HttpCode(HttpStatus.CREATED)` for POST that creates.

### Project Context Reference

Mandatory project facts:

- Text-paste import is a primary ingestion path; read tracking must be parity-safe — `briefing_item_reads` tracks by `briefing_item_id`, not thread source.
- Every story must include real-data E2E validation and documented outcomes.
- ALWAYS use `.js` extension on relative imports.
- Use NestJS Logger — never `console.log`.
- All API responses in `{ data: ... }` envelope.
- `@Inject(DATABASE_TOKEN) private readonly db: Database` for DB access.
- Flat module structure: all files for briefings go in `apps/api/src/modules/briefings/`.
- Snake_case in DB columns, camelCase in TypeScript.
- `pnpm db:generate` from `packages/db` — commit generated migration SQL + meta snapshot.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.5]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — DB schema, API patterns, frontend state management, cross-cutting source provenance]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — UX-DR12 (read/unread state), UX-DR13 (deep-links), BriefingCard states, read state pattern, action patterns]
- [Source: `_bmad-output/implementation-artifacts/5-4-intelligence-report-briefing-shape.md` — previous story intelligence, split panel patterns, code review findings]
- [Source: `_bmad-output/project-context.md` — mandatory implementation rules, testing patterns, E2E validation]
- [Source: `packages/db/src/schema/briefings.ts` — existing briefings/briefingItems tables, enums, relations]
- [Source: `packages/shared/src/schemas/briefing.schema.ts` — existing Zod schemas for briefing API]
- [Source: `apps/api/src/modules/briefings/briefings.controller.ts` — existing GET /briefings/today endpoint]
- [Source: `apps/api/src/modules/briefings/briefings.service.ts` — getTodayBriefing(), buildSlackPermalink(), resolveUserId()]
- [Source: `apps/web/src/hooks/use-briefings.ts` — BriefingWithItems, useTodayBriefing() hook]
- [Source: `apps/web/src/components/briefing-card/briefing-card.tsx` — BriefingCardProps, standard/compact variants, selected state]
- [Source: `apps/web/src/routes/briefings.tsx` — FeedLayout, SplitPanelLayout, DashboardLayout, SidePanel]
- [Source: `apps/web/src/lib/api-client.ts` — api.get/post/patch/delete helper]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Cursor Agent)

### Debug Log References

- Fixed regression in `apps/web/src/app.test.tsx`: mock for `use-briefings.js` needed `useMarkItemRead` export added.
- Made `data.readItemIds` access defensive with `?? []` for backward compat with any cached/stale API responses.

### Completion Notes List

- All 10 tasks completed successfully.
- 325 API tests passing (28 in briefings.service.spec.ts including 5 new read-state tests).
- 146 web tests passing (27 in briefing-card.test.tsx including 8 new read/unread visual state tests).
- Zero regressions across entire test suite.
- E2E validation against real PostgreSQL confirmed: table creation, insert, persistence, unique constraint (idempotent), FK cascade.
- `resolveUserIdFromAuth()` exposed as public method on BriefingsService to support controller-level user resolution for the mark-read endpoint.
- Defensive `?? []` fallback on `readItemIds` in route components handles backward-compatible API responses.

#### E2E Validation Results

- `briefing_item_reads` table created and accessible (0 rows initially)
- Found existing briefing (intelligence_report shape)
- Created test briefing item, inserted read record, verified persistence
- Unique constraint correctly blocks duplicate reads (idempotent)
- FK cascade configured: yes (verified via information_schema)
- All test data cleaned up after validation

#### Discovered Gaps

- No gaps discovered. All acceptance criteria satisfied.

### File List

- `packages/db/src/schema/briefings.ts` — added `briefingItemReads` table, relations, type exports
- `packages/db/src/migrations/0016_nebulous_chamber.sql` — new migration
- `packages/db/src/migrations/meta/0016_snapshot.json` — migration snapshot
- `packages/db/src/migrations/meta/_journal.json` — updated journal
- `packages/shared/src/schemas/briefing.schema.ts` — added `markItemReadResponseSchema`
- `apps/api/src/modules/briefings/briefings.controller.ts` — added `POST /briefings/items/:itemId/read`
- `apps/api/src/modules/briefings/briefings.service.ts` — added `markItemAsRead()`, `getReadItemIds()`, `resolveUserIdFromAuth()`, extended `getTodayBriefing()`
- `apps/api/src/modules/briefings/briefings.service.spec.ts` — added read-state tests
- `apps/api/src/modules/briefings/e2e-read-state.ts` — E2E validation script
- `apps/web/src/hooks/use-briefings.ts` — added `readItemIds`, `useMarkItemRead()` mutation
- `apps/web/src/components/briefing-card/briefing-card.tsx` — added `isRead`, `onExpandChange` props + visual states
- `apps/web/src/components/briefing-card/briefing-card.test.tsx` — added 8 read/unread state tests
- `apps/web/src/routes/briefings.tsx` — wired `isRead` + `markItemRead` into FeedLayout and SplitPanelLayout
- `apps/web/src/components/stats-bar/stats-bar.test.tsx` — added `readItemIds` to mock data
- `apps/web/src/app.test.tsx` — added `useMarkItemRead` to hook mock

### Change Log

- 2026-05-12: Implemented Story 5.5 — read/unread state persistence with `briefing_item_reads` table, API endpoint, frontend optimistic mutation, and visual states.
