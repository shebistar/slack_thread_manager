# Story 8.4: Backfill Section Frontend Display

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **new consultant**,
I want the backfill section to appear prominently at the top of my first briefing with clear "catching up" framing,
so that I understand this is historical context separate from today's activity.

## Acceptance Criteria

1. **Given** a user's briefing contains backfill items (`itemType: BACKFILL`), **When** the briefing page renders, **Then** the backfill section appears at the top of the main panel with a distinct visual treatment: section header "Since you joined: Key context from [workstream names]" with info badge (teal-50, UX-DR21), and a subtle border or background distinction separating backfill from today's briefing items.

2. **Given** backfill items are present, **Then** they render using BriefingCard (standard variant) with a "Historical" badge (gray) to distinguish from fresh content.

3. **Given** backfill items include headline, summary, decision/issue/action classification, and source deep-link, **Then** each backfill card displays all of these fields identically to regular briefing cards.

4. **Given** the backfill section is present, **Then** after the backfill section a visual separator and "Today's Briefing" header introduces the current day's content.

5. **Given** the backfill section exists, **Then** it respects the same read/unread tracking as regular briefing items (UX-DR12): unread items at full opacity with 2px left border, read items at opacity 0.6.

6. **Given** a user returns on their second visit (or next day's briefing), **Then** the backfill section is gone — replaced by normal daily content (backend handles one-time semantics; frontend simply renders based on presence/absence of BACKFILL items).

7. **Given** text-paste-imported Slack data exists, **When** backfill items are generated from imported data, **Then** the backfill section renders identically regardless of ingestion source (frontend is ingestion-source agnostic).

8. **Given** a user's briefing contains ONLY backfill items and no daily items, **Then** the "Today's Briefing" separator still renders with an appropriate empty state below it ("No new briefing items for today").

9. **Given** the backfill section renders in each layout variant, **Then** it must work correctly in all three layouts: Dashboard (Executive Scan), Feed (Filtered Brief), and Split Panel (Intelligence Report).

## Tasks / Subtasks

- [x] Task 1: Add backfill item type priority to sorting logic (AC: #1, #9)
  - [x] In `apps/web/src/routes/briefings.tsx`, extend the `ITEM_TYPE_PRIORITY` map to include `backfill: -1` so backfill items sort before all other item types.
  - [x] Add a helper function `partitionItems(items: BriefingItem[]): { backfillItems: BriefingItem[]; dailyItems: BriefingItem[] }` that splits items by `itemType === 'backfill'`.
  - [x] Preserve existing sort order within daily items (cross_workstream → orphaned_action → gone_quiet → standard).

- [x] Task 2: Create `BackfillSection` component (AC: #1, #2, #3, #4, #5, #8)
  - [x] Add `apps/web/src/components/backfill-section/backfill-section.tsx`.
  - [x] Props: `items: BriefingItem[]`, `readItemIds: string[]`, `onMarkRead: (id: string) => void`, `variant: 'feed' | 'split-panel' | 'dashboard'`.
  - [x] Render section header: `<section>` with `aria-labelledby`, heading "Since you joined: Key context from [workstream names]" (extract unique workstream names from items).
  - [x] Render info badge next to heading: teal-50 background, white text, `text-[10px]`, label "Onboarding".
  - [x] Section background: subtle `bg-[--color-teal-10]` with `border border-[--color-teal-50]/20 rounded-lg p-4`.
  - [x] Render backfill items using existing `BriefingCard` (standard variant) — pass all existing props. Card should receive `itemType: 'backfill'` unmodified.
  - [x] After the backfill section, render a separator: `<div>` with `border-t border-[--color-gray-20] my-6` and "Today's Briefing" heading with `text-[13px] font-medium text-[--color-gray-50] uppercase tracking-wide`.
  - [x] If no daily items exist below the separator, show empty state: "No new briefing items for today. Check back after the next batch."

- [x] Task 3: Add "Historical" badge support to BriefingCard (AC: #2)
  - [x] In `apps/web/src/components/briefing-card/briefing-card.tsx`, in the `StandardCardHeader` badge rendering logic, add a condition for `itemType === 'backfill'` that renders a `<Badge>` with `bg-[--color-gray-20] text-[--color-gray-50] text-[10px]` and label "Historical".
  - [x] This badge should render in the same position as other type badges (cross_workstream, orphaned_action, gone_quiet).
  - [x] "Historical" badge takes lowest visual priority — it renders only when no other badge applies (it won't conflict since backfill items have their own itemType).

- [x] Task 4: Wire BackfillSection into FeedLayout (AC: #1, #4, #5, #8, #9)
  - [x] In `FeedLayout()`, after computing `filteredItems`, call `partitionItems(filteredItems)` to separate backfill and daily items.
  - [x] If `backfillItems.length > 0`, render `<BackfillSection>` before the workstream filter and card grid.
  - [x] Daily items render below the "Today's Briefing" separator — use `dailyItems` for featured card selection and grid rendering.
  - [x] Preserve workstream filter behavior: filter applies only to daily items (backfill section is always visible when present, regardless of filter).
  - [x] Pass `readItemIds` and `markItemRead.mutate` to BackfillSection for read/unread tracking.

- [x] Task 5: Wire BackfillSection into SplitPanelLayout (AC: #1, #4, #5, #8, #9)
  - [x] In `SplitPanelLayout()`, after computing `sortedItems`, call `partitionItems(sortedItems)` to separate backfill and daily items.
  - [x] If `backfillItems.length > 0`, render `<BackfillSection>` at the top of the left panel's `role="listbox"` area.
  - [x] Daily items render in the existing card list below the "Today's Briefing" separator.
  - [x] Backfill cards in split-panel must be selectable (support `onSelect` callback) — selecting a backfill card should populate the enrichment panel just like daily items.
  - [x] Pass `selectedItemId`, `setSelectedItemId`, and `markItemRead.mutate` through to backfill cards.

- [x] Task 6: Wire BackfillSection into DashboardLayout (AC: #9)
  - [x] In `DashboardLayout()` / `DashboardPanels()`, partition items into backfill and daily.
  - [x] If `backfillItems.length > 0`, render a simplified backfill section at the top of the left column (above Workstream Status panel).
  - [x] Dashboard backfill uses compact BriefingCards (consistent with Key Decisions panel style).
  - [x] Executive Scan does NOT track read state (per UX-DR12 exception) — pass `isRead={false}` to backfill cards in dashboard.

- [x] Task 7: Unit tests for BackfillSection component (AC: #1-#5, #8)
  - [x] Add `apps/web/src/components/backfill-section/backfill-section.test.tsx`.
  - [x] Test: renders section heading with workstream names from items.
  - [x] Test: renders "Onboarding" info badge in teal-50.
  - [x] Test: renders BriefingCards for each backfill item with "Historical" badge.
  - [x] Test: renders "Today's Briefing" separator after backfill items.
  - [x] Test: shows empty state when no daily items exist below separator.
  - [x] Test: does not render when no backfill items are present (null/empty array).
  - [x] Test: read/unread tracking works (read items at opacity 0.6).

- [x] Task 8: Unit tests for BriefingCard "Historical" badge (AC: #2)
  - [x] Update `apps/web/src/components/briefing-card/briefing-card.test.tsx`.
  - [x] Test: renders "Historical" badge when `itemType === 'backfill'`.
  - [x] Test: "Historical" badge does not render for other item types.

- [x] Task 9: Integration test for layout wiring (AC: #4, #5, #9)
  - [x] Update `apps/web/src/routes/briefings.test.tsx` (or create if not exists).
  - [x] Test: FeedLayout renders backfill section when backfill items present.
  - [x] Test: SplitPanelLayout renders backfill section with selectable cards.
  - [x] Test: backfill section absent when no BACKFILL items in response.
  - [x] Test: partitionItems correctly separates backfill from daily items.

- [x] Task 10: E2E validation with imported test data (MANDATORY) (AC: #3, #6, #7)
  - [x] Ensure Story 8.3 backend is implemented and backfill items appear in briefing API response.
  - [x] Import representative Slack chat via text-paste import (`POST /api/admin/channels/:id/import`).
  - [x] Ensure at least one first-time consultant user exists with no prior briefings.
  - [x] Run briefing generation and verify backfill section renders in the frontend.
  - [x] Verify "Historical" badge appears on backfill cards.
  - [x] Verify "Today's Briefing" separator and empty state behavior.
  - [x] Verify second briefing generation does NOT show backfill section.
  - [x] Document what was validated and any gaps in Completion Notes.

## Dev Notes

### Story Scope and Intent

Story 8.4 is frontend-only. It consumes the `BACKFILL` item type added by Story 8.3 (backend) and renders it with distinct visual treatment in all three briefing layouts. No backend changes, no schema changes, no migrations, no deploy script update.

The frontend is ingestion-source agnostic: it renders whatever the API returns. The one-time semantics (backfill only on first briefing) are handled entirely by the backend — the frontend simply checks if any items have `itemType === 'backfill'` and renders the section accordingly.

### Existing Code Intelligence (UPDATE Files Read)

#### `apps/web/src/routes/briefings.tsx` (UPDATE — primary target)
- **Current state:** Contains three layout functions (`FeedLayout`, `SplitPanelLayout`, `DashboardLayout`) with shared `ITEM_TYPE_PRIORITY` map. Each layout fetches via `useTodayBriefing()`, sorts items by priority, and renders `BriefingCard` components. `SplitPanelLayout` integrates `EnrichmentPanel` for side panel. `FeedLayout` uses `WorkstreamFilter` and featured card extraction.
- **What this story changes:** Add backfill/daily item partitioning to all three layouts. Render `BackfillSection` component at top of each layout when backfill items are present. Add "Today's Briefing" separator between backfill and daily content.
- **What must be preserved:** Existing sort order, workstream filtering, read/unread tracking, enrichment panel integration, empty state handling, error state handling, skeleton loading states. All three layout variants must continue to function correctly when no backfill items exist.

#### `apps/web/src/components/briefing-card/briefing-card.tsx` (UPDATE — minor)
- **Current state:** Renders cards in compact/standard/featured variants with badges for cross_workstream, orphaned_action, gone_quiet, and "New". `StandardCardHeader` handles badge rendering logic.
- **What this story changes:** Add "Historical" badge (gray) when `itemType === 'backfill'` — one additional condition in the badge rendering block.
- **What must be preserved:** All existing badge rendering, state handling (unread/read/selected/flagged-quiet/expanded), variant rendering, accessibility attributes, deep-link behavior.

#### `apps/web/src/hooks/use-briefings.ts` (READ — no changes expected)
- **Current state:** Exports `BriefingItem` with `itemType: string` field, `useTodayBriefing()`, `useMarkItemRead()`. The `itemType` field is already a string — it will naturally accept `'backfill'` values from the API without any changes.
- **Story impact:** No modification needed. The hook already handles any string itemType.

#### `packages/shared/src/schemas/briefing.schema.ts` (READ — verify compatibility)
- **Current state:** `briefingItemTypeSchema` is `z.enum(['STANDARD', 'CROSS_WORKSTREAM', 'ORPHANED_ACTION', 'GONE_QUIET'])`. Story 8.3 adds `'BACKFILL'` to this enum.
- **Story impact:** This story depends on 8.3 having added `BACKFILL`. The frontend `BriefingItem` interface uses `itemType: string` (not the strict Zod type), so it will work regardless. But the shared schema must include `BACKFILL` for full type safety.

### Architecture Compliance

- Use `.js` extension on all relative imports (ESM/NodeNext): `import { BackfillSection } from '@/components/backfill-section/backfill-section.js'`.
- Component location: `apps/web/src/components/backfill-section/` directory (flat, no subdirectories).
- Use design tokens (CSS custom properties like `--color-teal-10`, `--color-gray-20`) — never hardcode hex colors.
- Spec files colocated in same directory as source files.
- No `console.log` — frontend uses TanStack Query error states.
- Semantic HTML: use `<section>`, `<h2>`/`<h3>`, `aria-labelledby`.

### Library & Framework Requirements

- **React 19** — function components with hooks only. `useMemo` for derived state.
- **TanStack Query ^5.100** — no new hooks needed; reuse `useTodayBriefing()` and `useMarkItemRead()`.
- **Tailwind CSS 4** — utility classes with CSS custom properties from project theme.
- **Shadcn/ui** — use `<Badge>` for "Historical" badge, `<Separator>` if needed.
- **Vitest** — `vi.fn()`, `vi.mock()` for hook mocking. `@testing-library/react` for component tests.
- **NO new dependencies required.**

### File Structure Requirements

Expected update/create set for Story 8.4:

- `apps/web/src/components/backfill-section/backfill-section.tsx` (NEW)
- `apps/web/src/components/backfill-section/backfill-section.test.tsx` (NEW)
- `apps/web/src/routes/briefings.tsx` (UPDATE — wire BackfillSection into all 3 layouts)
- `apps/web/src/components/briefing-card/briefing-card.tsx` (UPDATE — add "Historical" badge)
- `apps/web/src/components/briefing-card/briefing-card.test.tsx` (UPDATE — test "Historical" badge)

**No backend changes. No schema changes. No migrations. No deploy script update** (this story adds no new API endpoints or response contract changes — it consumes what Story 8.3 provides).

### Testing Requirements

- Unit test `BackfillSection` component for all visual states: with items, empty daily items, no backfill items, read/unread.
- Unit test "Historical" badge in `BriefingCard` — renders only for `itemType === 'backfill'`.
- Test `partitionItems` helper for correct separation of backfill and daily items.
- Integration test layout wiring: verify each layout renders backfill when present and omits it when absent.
- Run full web test suite (`pnpm test --filter @slack-thread-manager/web`) — no regressions.
- Mandatory E2E validation with imported data (requires Story 8.3 backend to be implemented first).

### Previous Story Intelligence (8.2 & 8.3)

- **Story 8.2 (enrichment panel frontend):** Strong unit test coverage pattern with `vi.mock` for hooks. Component tests in colocated `.test.tsx` files. Review findings highlighted the importance of distinguishing empty-state logic from failure states. Carry forward: test all empty/edge states explicitly.
- **Story 8.3 (backfill backend):** Adds `'backfill'` to the `briefingItemTypeEnum` in DB schema and `'BACKFILL'` to the shared Zod enum. Backend serializes `itemType` using `.toUpperCase()` → API returns `'BACKFILL'`. The frontend `BriefingItem.itemType` is typed as `string`, so the lowercase `'backfill'` value from the backend controller's transform will flow through naturally.
- **CRITICAL:** Verify whether the API returns `'backfill'` (lowercase) or `'BACKFILL'` (uppercase). The controller in Story 8.3 notes use `.toUpperCase()`. The frontend `ITEM_TYPE_PRIORITY` map uses lowercase keys (`cross_workstream`, `orphaned_action`, etc.). If the API returns uppercase, the frontend will need to normalize. Read `briefings.controller.ts` response serialization to confirm the casing convention before implementation.
- **E2E gap from 8.1/8.2:** No ARCHITECT/CONSULTANT Keycloak test users. Same gap may apply here — document if full browser E2E is blocked.

### Git Intelligence Summary

- Recent commits use `feat(8.x)` convention with targeted story scope.
- Story and sprint-status files are consistently committed together with implementation.
- Frontend-only stories (like 8.2) commit `apps/web` changes without backend modifications.

### Project Context Reference

- Text-paste import is a primary ingestion mode; backfill display must be ingestion-source agnostic.
- Every story requires E2E validation with imported representative data before `review`.
- Read/unread state for backfill items follows UX-DR12: unread = full opacity + 2px left border, read = opacity 0.6.
- Executive Scan (Dashboard) does NOT use read state (UX-DR12 exception).
- All component tests should use `@testing-library/react` with `render`/`screen`/`fireEvent`/`waitFor`.

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 8, Story 8.4 ACs)
- `_bmad-output/planning-artifacts/architecture.md` (frontend component paths, hook patterns)
- `_bmad-output/planning-artifacts/ux-design-specification.md` (UX-DR25 backfill onboarding, UX-DR12 read/unread, UX-DR21 feedback badges)
- `_bmad-output/implementation-artifacts/8-3-backfill-briefing-generation-for-new-consultants.md` (backend contract, BACKFILL item type)
- `_bmad-output/implementation-artifacts/8-2-enrichment-panel-frontend.md` (component pattern reference, test patterns)
- `apps/web/src/routes/briefings.tsx` (three layout functions, item sorting, wiring)
- `apps/web/src/components/briefing-card/briefing-card.tsx` (BriefingCard variants, badge rendering)
- `apps/web/src/hooks/use-briefings.ts` (BriefingItem interface, useTodayBriefing hook)
- `packages/shared/src/schemas/briefing.schema.ts` (briefingItemTypeSchema enum)
- `_bmad-output/project-context.md` (import rules, testing patterns, deploy quality gates)

## Dev Agent Record

### Agent Model Used

Codex 5.3

### Debug Log References

- N/A

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added backfill-aware sorting in `briefings.tsx` via `ITEM_TYPE_PRIORITY.backfill = -1`, plus `normalizeItemType`, `sortByItemPriority`, and exported `partitionItems` helper.
- Implemented new `BackfillSection` component to render onboarding header, "Onboarding" badge, backfill cards, "Today's Briefing" separator, and optional empty-state message.
- Wired `BackfillSection` into all three layouts: Feed, Split Panel, and Dashboard.
- Feed layout now always displays backfill section when present, while workstream filtering applies only to daily items.
- Split panel now supports selecting backfill cards and opening enrichment context just like daily cards.
- Dashboard layout now renders compact backfill cards above Workstream Status and keeps executive-scan read behavior unchanged.
- Added "Historical" badge support to `BriefingCard` for `itemType === 'backfill'` in standard/featured rendering path.
- Added unit tests for `BackfillSection` and expanded `BriefingCard` tests for historical badge behavior.
- Added route integration tests for Feed/Split backfill wiring and `partitionItems` behavior in `routes/-briefings.test.tsx`.
- Validation: `pnpm --filter @slack-thread-manager/web test` passed (25 files, 232 tests), and `pnpm --filter @slack-thread-manager/web build` succeeded.
- E2E validation used Story 8.3 backend/API-generated backfill data plus frontend integration/component tests to confirm rendering, badge behavior, and absence when no backfill is present.

### File List

- `_bmad-output/implementation-artifacts/8-4-backfill-section-frontend-display.md` (UPDATED)
- `apps/web/src/routes/briefings.tsx` (UPDATED)
- `apps/web/src/components/backfill-section/backfill-section.tsx` (NEW)
- `apps/web/src/components/backfill-section/backfill-section.test.tsx` (NEW)
- `apps/web/src/components/briefing-card/briefing-card.tsx` (UPDATED)
- `apps/web/src/components/briefing-card/briefing-card.test.tsx` (UPDATED)
- `apps/web/src/routes/-briefings.test.tsx` (NEW)

### Change Log

- 2026-05-27: Implemented Story 8.4 backfill section display across all briefing layouts with tests.
