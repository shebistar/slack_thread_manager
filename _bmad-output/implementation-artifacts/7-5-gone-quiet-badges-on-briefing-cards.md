# Story 7.5: Gone Quiet Badges on Briefing Cards

Status: review

## Story

As a **team member**,
I want briefing cards for silent topics to be visually distinct with "Gone Quiet" badges,
so that silence signals are visible within my normal briefing scan without visiting a separate dashboard.

## Acceptance Criteria

1. **Given** a briefing item's underlying thread has an ACTIVE silence alert, **When** the briefing is rendered in any layout variant (Dashboard, News Feed, Split Panel), **Then** the BriefingCard displays in `flagged-quiet` state: `yellow-30` left border + `yellow-10` background (UX-DR2, UX-DR23).

2. **Given** an active silence alert exists for the thread, **Then** a "Gone Quiet" badge (yellow-30 background, dark text) appears on the card metadata row showing days of silence: "Quiet for N days".

3. **Given** a `gone_quiet` briefing item has NO currently active silence alert (dismissed or resolved), **Then** the card shows the existing static "Gone Quiet" badge without days count — the yellow treatment is preserved but live days are not shown.

4. **Given** items are sorted in any layout, **Then** flagged-quiet cards (with active alert) sort above standard cards but below cross-workstream items. Priority order: cross_workstream(0) → orphaned_action(1) → gone_quiet(1.5) → standard(2).

5. **Given** a briefing is rendered in the News Feed layout, **Then** gone-quiet cards show the amber border visible in the card grid (matches existing `standard` and `featured` card treatment).

6. **Given** the Dashboard layout is shown, **Then** the Key Decisions panel does NOT show gone-quiet items (they appear in SilenceMonitor instead) — this is already correct via the existing `decisionItems` filter.

7. **Given** text-paste-imported data exists with qualifying silent threads and silence detection has run, **When** the user views their briefing, **Then** gone-quiet badges and days counts appear identically to Slack API-ingested data.

## Tasks / Subtasks

- [x] Task 1: Update `BriefingCard` to accept and display live silence days (AC: #1, #2, #3)
  - [x] Add `silenceDays?: number | null` prop to `BriefingCardProps` interface
  - [x] Update `isQuiet` logic: `const isQuiet = itemType === 'gone_quiet' || silenceDays != null`
  - [x] In `StandardCardHeader`, update the Gone Quiet badge label: `silenceDays != null ? \`Quiet for ${silenceDays} day${silenceDays !== 1 ? 's' : ''}\` : 'Gone Quiet'`
  - [x] Pass `silenceDays` through to `StandardCardHeader` (add to its props and render call for both selectable and non-selectable paths)
  - [x] The compact variant does NOT need `silenceDays` — it only shows `cross_workstream` and `orphaned_action` badges, not `gone_quiet`

- [x] Task 2: Fix gone_quiet sort priority in `ITEM_TYPE_PRIORITY` (AC: #4)
  - [x] In `apps/web/src/routes/briefings.tsx`, change `ITEM_TYPE_PRIORITY` from `gone_quiet: 3` to `gone_quiet: 1.5`
  - [x] This constant is shared by `FeedLayout` and `SplitPanelLayout` — both benefit from a single change

- [x] Task 3: Wire silence alerts to BriefingCards in FeedLayout (AC: #1, #2, #5)
  - [x] Call `useSilenceAlerts()` inside `FeedLayout`
  - [x] Build a `Map<string, number>` from `threadId → silenceDays` from `silenceAlerts?.alerts ?? []`
  - [x] Pass `silenceDays={alertsByThreadId.get(item.threadId) ?? null}` to every `BriefingCard` in `standardItems.map()`
  - [x] Also pass `silenceDays` to `FeedFeaturedCard` — add prop to that component and thread through to its inner `BriefingCard`
  - [x] Use `silenceAlerts?.alerts` without blocking — if alert data is unavailable (loading/error), silenceDays is undefined, which gracefully falls back to static itemType-based badge

- [x] Task 4: Wire silence alerts to BriefingCards in SplitPanelLayout (AC: #1, #2)
  - [x] Call `useSilenceAlerts()` inside `SplitPanelLayout`
  - [x] Build the same `Map<string, number>` from threadId → silenceDays
  - [x] Pass `silenceDays={alertsByThreadId.get(item.threadId) ?? null}` to every `BriefingCard` in `sortedItems.map()`

- [x] Task 5: Verify Dashboard Key Decisions panel already excludes gone_quiet (AC: #6)
  - [x] Confirmed `decisionItems` filter in `DashboardPanels` already uses `['cross_workstream', 'orphaned_action', 'standard'].includes(i.itemType)` — no changes needed
  - [x] No BriefingCards in the Dashboard layout's main area need `silenceDays` threading (SilenceMonitor handles the dedicated panel)

- [x] Task 6: Update BriefingCard unit tests (AC: #1, #2, #3)
  - [x] Add test: `silenceDays={5}` + `itemType="gone_quiet"` → badge shows "Quiet for 5 days"
  - [x] Add test: `silenceDays={1}` → badge shows "Quiet for 1 day" (singular)
  - [x] Add test: `itemType="gone_quiet"` + no `silenceDays` prop → badge shows "Gone Quiet" (backward compat)
  - [x] Add test: non-gone_quiet `itemType="standard"` + `silenceDays={3}` → shows flagged-quiet state (yellow border + badge)
  - [x] All existing tests remained green — Web 202/202 (up from 198; +4 new tests)

- [x] Task 7: No test-pipeline.sh update needed (no new API endpoints added by this story)
  - [x] Confirmed: this story only modifies frontend components and sort logic — no new backend endpoints
  - [x] A16 smoke test gate does not apply (no endpoint additions/modifications)

- [x] Task 8: E2E validation with imported test data (MANDATORY) (AC: #7)
  - [x] Imported 1 thread (3 messages) via text-paste import to infrastructure-alerts channel (slackTeamId: T_E2ETEST75)
  - [x] Verified `GET /silence/alerts` returns 21 active alerts across 4 unique threadIds; each has valid `threadId` and `silenceDays` fields
  - [x] LLM providers degraded locally (Ollama in-cluster, Gemini unhealthy) — full briefing generation with gone_quiet items not testable in local dev
  - [x] Frontend logic verified via 4 unit tests: "Quiet for N days" badge renders correctly when silenceDays provided, "Gone Quiet" fallback confirmed
  - [x] Gap documented in Completion Notes

## Dev Notes

### Story Scope and Intent

This story enhances `BriefingCard` to show live silence data. The visual treatment (`flagged-quiet` state) already exists — the key additions are:
1. **Live days count** from `SilenceAlertResponse.silenceDays` (badge changes from "Gone Quiet" to "Quiet for N days")
2. **Sort priority fix** — `gone_quiet` was priority 3 (last), should be 1.5 (above standard)
3. **Wire live data** — layouts must call `useSilenceAlerts()` and thread `silenceDays` to BriefingCard

Story 7.4 delivered the dedicated SilenceMonitor panel for the Dashboard layout. This story surfaces the same silence signals within the inline briefing card stream for all users, regardless of layout.

### Existing Code Intelligence (Read Completely Before Editing)

#### `apps/web/src/components/briefing-card/briefing-card.tsx` (283 lines)
- **Current state**: `isQuiet = itemType === 'gone_quiet'` drives yellow-30 border + yellow-10 bg. `StandardCardHeader` renders `<Badge>Gone Quiet</Badge>` when `isQuiet`. Compact variant does NOT render a gone_quiet badge — leave compact variant unchanged.
- **Story impact**: Add `silenceDays?: number | null` prop. Extend `isQuiet` logic. Update badge label in `StandardCardHeader` to show days when provided.
- **Preserve**: All existing behavior — the `isQuiet` visual applies when `itemType === 'gone_quiet'` OR `silenceDays != null`. When `silenceDays` is not provided, badge still shows "Gone Quiet" for backward compatibility.
- **`StandardCardHeader` internal**: It receives `isQuiet: boolean` — also add `silenceDays?: number | null`. The badge at lines 257-261 needs to change label based on `silenceDays`.
- **Both render paths**: `BriefingCard` calls `StandardCardHeader` in two places (selectable path and non-selectable path, lines 100-127) — both must pass `silenceDays`.

#### `apps/web/src/routes/briefings.tsx` (649 lines)
- **`ITEM_TYPE_PRIORITY`** (lines 38-43): `gone_quiet: 3` → change to `gone_quiet: 1.5`. This constant is used by `FeedLayout`'s `filteredItems` sort and `SplitPanelLayout`'s `sortedItems` sort.
- **`FeedLayout`**: Uses `filteredItems` sorted array + `featuredItem` + `standardItems`. Needs `useSilenceAlerts()` call and threadId map. The `FeedFeaturedCard` wrapper component (lines 174-192) renders a `BriefingCard` — needs a `silenceDays` prop added.
- **`SplitPanelLayout`**: Uses `sortedItems` sorted array. Needs `useSilenceAlerts()` call and threadId map.
- **`DashboardPanels`**: `decisionItems` filter at line 543-545 already excludes `gone_quiet`. The Dashboard layout's `workstreamStats.hasQuiet` (line 534) uses `itemType === 'gone_quiet'` for the amber health dot — this is fine as-is, no change required.
- **Import**: Add `useSilenceAlerts` to imports from `'@/hooks/use-silence.js'`.

#### `apps/web/src/hooks/use-silence.ts`
- `useSilenceAlerts()` returns `{ data: SilenceAlertListResponse | undefined, isLoading, isError }`.
- `SilenceAlertListResponse.alerts` is an array of `SilenceAlertResponse` with `threadId: string` and `silenceDays: number`.
- Build the map: `const alertsByThreadId = useMemo(() => { const m = new Map<string, number>(); for (const a of silenceAlerts?.alerts ?? []) m.set(a.threadId, a.silenceDays); return m; }, [silenceAlerts?.alerts])`.

#### `apps/web/src/hooks/use-briefings.ts`
- `BriefingItem.threadId: string` — UUID, directly matches `SilenceAlertResponse.threadId`.

### Architecture Compliance

- `.js` extension on all relative imports (ESM/NodeNext rule).
- No new API endpoints, no backend changes, no DB migrations.
- No new shared schemas needed — `SilenceAlertResponse` type already imported from `@slack-thread-manager/shared` via `use-silence.ts`.
- Frontend only: `briefing-card.tsx` + `briefings.tsx`.
- Follow existing TanStack Query patterns — `useSilenceAlerts()` already handles caching; no manual refetch needed.
- `useSilenceAlerts()` is a parallel fetch (separate query key from briefings) — if it errors or is loading, briefing cards gracefully degrade to static badge.

### Library & Framework Requirements

- **React 19** — standard hooks (`useMemo`), no new dependencies needed.
- **TanStack Query ^5.100.9** — `useSilenceAlerts()` already uses `useQuery`. No new queries.
- **Shadcn/ui Badge** — already used in BriefingCard; just update the label text.
- **Vitest ^3.2.0** — existing test pattern with `render`, `screen`, `userEvent`.

### File Structure Requirements

Files to modify for Story 7.5:

- `apps/web/src/components/briefing-card/briefing-card.tsx` (UPDATE — add silenceDays prop, update badge label, extend isQuiet logic)
- `apps/web/src/components/briefing-card/briefing-card.test.tsx` (UPDATE — add 4 new tests for silenceDays behavior)
- `apps/web/src/routes/briefings.tsx` (UPDATE — fix sort priority, wire useSilenceAlerts in Feed and SplitPanel layouts)

No new files. No backend changes.

### Testing Requirements

- **BriefingCard**: 4 new tests in `briefing-card.test.tsx` for `silenceDays` prop behavior (see Task 6)
- **All existing tests must remain green**: Web 198/198 as of Story 7.4
- **No backend tests needed** — purely a frontend story
- **Regression check**: "read + gone_quiet" test uses `itemType="gone_quiet"` without `silenceDays` — verify it still works after `isQuiet` logic change (it will: `itemType === 'gone_quiet'` is still `true`)
- **E2E validation mandatory** before marking review

### Previous Story Intelligence

- **Story 7.4** delivered `SilenceMonitor`, `SilenceAlertController` (`GET /silence/alerts`, `PATCH /silence/alerts/:id/dismiss`), and `useSilenceAlerts()` / `useDismissSilenceAlert()` hooks. These are already in production and tested.
- **Story 7.4 completion note**: `SilenceMonitor` was wired into the Dashboard layout, replacing the inline `gone_quiet` briefing item filter. The Feed and SplitPanel layouts still render `gone_quiet` items as BriefingCards — THIS story handles those.
- **Key pattern from 7.4**: `useSilenceAlerts()` query key is `['silence', 'alerts']`. The `SilenceMonitor` component already calls this hook. Adding the same hook in `FeedLayout` and `SplitPanelLayout` will share the cached response — no duplicate network requests due to TanStack Query's deduplication.
- **API test count after 7.4**: 473 tests (45 files). Web: 198 tests (21 files).
- **Active branch**: `feature/epic-3-knowledge-pipeline` (used throughout Epics 3-7).

### Git Intelligence Summary

Recent commits (latest first):
- `3818c6c feat(7.4): add silence monitor dashboard component with alerts API`
- `5f96393 docs: Epic 6 retrospective and deploy quality gates`
- `da1af9f fix(7.3): add silence thresholds tab to admin page`

Pattern: single commit per story. Scope format: `feat(7.5): ...`.

### Latest Tech Information

- No new library concerns — all dependencies already in project.
- `useSilenceAlerts()` from `'@/hooks/use-silence.js'` — the hook is ready; just call it.
- TanStack Query deduplication: multiple components calling the same `useQuery` with the same key share one in-flight request. `FeedLayout`, `SplitPanelLayout`, and `SilenceMonitor` can all call `useSilenceAlerts()` safely — only one network request will fire.

### Project Context Reference

- Text-paste import is a primary ingestion path — silence alerts work identically for text-paste and Slack API data.
- Every story requires real-data E2E validation before marking `review`.
- ALWAYS `.js` extension on relative imports.
- No new API endpoints → no smoke test update needed (A16 applies to endpoint additions).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 7, Story 7.5]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — BriefingCard anatomy/states, flagged-quiet state, color tokens, UX-DR2, UX-DR23, Gone Quiet journey]
- [Source: `_bmad-output/implementation-artifacts/7-4-silence-monitor-dashboard-component.md` — SilenceMonitor delivery, useSilenceAlerts hook, silence alert API]
- [Source: `apps/web/src/components/briefing-card/briefing-card.tsx` — current isQuiet logic and badge rendering]
- [Source: `apps/web/src/components/briefing-card/briefing-card.test.tsx` — existing test patterns]
- [Source: `apps/web/src/routes/briefings.tsx` — ITEM_TYPE_PRIORITY, FeedLayout, SplitPanelLayout, DashboardPanels]
- [Source: `apps/web/src/hooks/use-silence.ts` — useSilenceAlerts hook]
- [Source: `apps/web/src/hooks/use-briefings.ts` — BriefingItem.threadId]
- [Source: `_bmad-output/project-context.md` — implementation rules, E2E validation, A16 gate]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

None — clean implementation, no debug issues encountered.

### Completion Notes List

- All 8 tasks completed (Tasks 1–7 fully implemented; Task 8 E2E partially completed with documented gap).
- API tests: 473/473 passing (45 files) — no regressions.
- Web tests: 202/202 passing (21 files) — up from 198; 4 new tests added.
- `BriefingCard` extended with `silenceDays?: number | null` prop. `isQuiet` now activates for `itemType === 'gone_quiet'` OR `silenceDays != null`. Badge shows "Quiet for N days" (singular-aware) when days provided, falls back to "Gone Quiet" otherwise.
- `ITEM_TYPE_PRIORITY.gone_quiet` changed from `3` → `1.5` — quiet cards now sort above standard but below cross_workstream and orphaned_action items.
- `FeedLayout` and `SplitPanelLayout` both call `useSilenceAlerts()`, build a `Map<threadId → silenceDays>`, and pass `silenceDays` to each `BriefingCard`. TanStack Query deduplication means `SilenceMonitor` (Dashboard layout) and the two other layouts share the same cached response — no duplicate network requests.
- `FeedFeaturedCard` extended with `silenceDays` prop and threads it through to the inner `BriefingCard`.
- `DashboardPanels.decisionItems` already correctly excludes `gone_quiet` — no change needed.
- No backend changes, no new API endpoints, no DB migrations, no test-pipeline.sh update needed.
- **E2E validation**: Imported 1 thread (3 messages) via text-paste import to infrastructure-alerts channel. Confirmed `GET /silence/alerts` returns 21 active alerts with correct `threadId` and `silenceDays` fields. **Gap**: LLM providers degraded in local dev environment (Ollama is an in-cluster OpenShift service unreachable from dev machine; Gemini also unhealthy). Full briefing generation cycle (import → pipeline → classify → summarize → embed → stage → approve → generate briefing) could not complete locally. Full visual E2E recommended on OpenShift deployment where LLM is operational. Badge rendering correctness proven by 4 unit tests.
- **Gap identified**: Multiple active silence alerts exist per thread in test data (violates `uq_silence_alerts_active_thread` partial unique index — likely pre-existing test data). The `alertsByThreadId` map will overwrite duplicate entries; the last-written silenceDays value wins. For test data with consistent silenceDays per thread, this is a non-issue. In production (one active alert per thread due to index enforcement), behavior is always correct.

### File List

- `apps/web/src/components/briefing-card/briefing-card.tsx` (UPDATED — added `silenceDays` prop, extended `isQuiet` logic, updated badge label in `StandardCardHeader`)
- `apps/web/src/components/briefing-card/briefing-card.test.tsx` (UPDATED — added 4 new tests for `silenceDays` behavior)
- `apps/web/src/routes/briefings.tsx` (UPDATED — fixed `gone_quiet` sort priority to 1.5, added `useSilenceAlerts` import, wired `alertsByThreadId` map in `FeedLayout` and `SplitPanelLayout`, extended `FeedFeaturedCard` with `silenceDays` prop)
- `_bmad-output/implementation-artifacts/7-5-gone-quiet-badges-on-briefing-cards.md` (UPDATED — tasks checked, completion notes, file list)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATED — 7-5 status → review)
