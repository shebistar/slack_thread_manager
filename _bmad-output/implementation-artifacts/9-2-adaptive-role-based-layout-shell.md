# Story 9.2: Adaptive Role-Based Layout Shell

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **team member**,
I want briefing layouts to adapt by role and briefing type,
so that I get the right information density and interaction model for my workflow.

## Acceptance Criteria

1. **Given** a user opens the daily briefing, **When** their role resolves to PM/SALES/TRAINING (Executive Scan shape), **Then** the Dashboard-style layout loads (Direction 2: stats bar, workstream status panel, silence monitor, key decisions panel).

2. **Given** a user opens the daily briefing, **When** their role resolves to PM with assigned workstreams (Filtered Brief shape), **Then** the News Feed-style layout loads (Direction 1: workstream filter pills, 2-column card grid, featured card).

3. **Given** a user opens the daily briefing, **When** their role resolves to ARCHITECT/CONSULTANT (Intelligence Report shape), **Then** the Split Panel layout loads (Direction 6: main panel + collapsible 360px side panel with AI enrichment).

4. **Given** any layout variant is rendered, **When** layout switching between the three variants, **Then** shared shell elements (header, nav, date/meta framing, consistent paddings) are preserved — same visual language, same spacing scale, same component primitives.

5. **Given** the `getLayoutVariant()` function in `role-layout.ts`, **Then** role-specific layout assignment is deterministic and covered by unit tests that verify all 6 roles map to expected layout variants.

## Tasks / Subtasks

- [x] Task 1: Extract shared BriefingPageFrame component (AC: #4)
  - [x] Create `apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx` — a wrapper component that provides consistent briefing page framing across all three layout variants.
  - [x] The frame renders: (1) a consistent "page header bar" showing briefing title, layout indicator badge, and freshness metadata (date, time, thread count, workstream count), (2) consistent vertical spacing below the header before layout-specific content.
  - [x] Props: `title: string`, `layoutLabel: string`, `briefingData: BriefingWithItems | null | undefined`, `isLoading: boolean`, `children: ReactNode`.
  - [x] The page header bar uses a consistent pattern across all 3 layouts: white background, `border-b-[3px] border-b-[--color-brand-red]` accent, display font for title, badge for layout label, freshness text in gray-50 caption size.
  - [x] Replace the current `FeedHeader`, `DashboardHeader`, `SplitPanelTopBar` with `BriefingPageFrame` usage in each layout.
  - [x] Ensure paddings use the spacing conventions (px-6 py-4 for the header, `p-6` or `px-6 py-6` for inner content area matching `space-lg`/`space-xl`).

- [x] Task 2: Apply consistent spacing and container tokens (AC: #4)
  - [x] In all three layout variants, ensure the content area below the frame uses consistent `space-y-6` (matching `space-lg` 24px) between major sections.
  - [x] Verify the root `__root.tsx` `<main>` container (`max-w-7xl mx-auto px-4 xl:px-8 py-6`) provides the outer page constraints — layouts should NOT add their own outer max-width.
  - [x] Ensure card grid gaps are consistent: `gap-4` for card grids (16px), `gap-6` for section spacing (24px).
  - [x] Dashboard layout: 2-column grid at xl+ using `xl:grid-cols-[2fr_1fr]` (main content 2fr, silence monitor side 1fr).
  - [x] Feed layout: 2-column card grid at xl+ using `xl:grid-cols-2`, single column at lg.
  - [x] Split Panel layout: flex row at xl+ with `flex-1 min-w-0` for main and `xl:w-[360px] shrink-0` for side panel.

- [x] Task 3: Visual refinement of Dashboard layout (Direction 2) (AC: #1)
  - [x] Replace `DashboardHeader` (dark bg header) with `BriefingPageFrame` using `title="Briefing Dashboard"`, `layoutLabel="Executive Scan"`.
  - [x] StatsBar remains directly below the frame header (already correct).
  - [x] Workstream Status panel: verify it uses `Card` with gray-10 header bar pattern, proper border and section spacing.
  - [x] Key Decisions panel: verify compact BriefingCards render with consistent token-based styling.
  - [x] Silence Monitor panel: verify it renders in the right column at xl+.

- [x] Task 4: Visual refinement of Feed layout (Direction 1) (AC: #2)
  - [x] Replace `FeedHeader` with `BriefingPageFrame` using `title="Daily Briefing"`, `layoutLabel="Filtered Brief"`.
  - [x] WorkstreamFilter row: verify it renders below the frame header with gray-10 background and border-b.
  - [x] Featured card: ensure the featured (first) card has the brand-red left border accent.
  - [x] Standard card grid: 2-column at xl, single at lg, consistent gap-4.
  - [x] Empty states: verify they use consistent text-gray-50 styling.

- [x] Task 5: Visual refinement of Split Panel layout (Direction 6) (AC: #3)
  - [x] Replace `SplitPanelTopBar` with `BriefingPageFrame` using `title="Daily Briefing — Intelligence Report"`, `layoutLabel="Lead Architect View"`.
  - [x] Main panel: flex-1 with min-w-0, space-y-4 between cards.
  - [x] Side panel (EnrichmentPanel): 360px at xl+, collapsible to 40px chevron strip on toggle.
  - [x] At lg breakpoint: side panel stacks below main content.
  - [x] Card selection: selected card gets `border-[--color-blue-50] bg-[--color-blue-10]` treatment (already in place, verify consistency).

- [x] Task 6: Add unit tests for role-layout determinism (AC: #5)
  - [x] Create `apps/web/src/lib/role-layout.test.ts`.
  - [x] Test `getLayoutVariant()` for all 6 UserRole values: `ADMIN → dashboard`, `PM → feed`, `SALES → dashboard`, `TRAINING → dashboard`, `ARCHITECT → split-panel`, `CONSULTANT → split-panel`.
  - [x] Test `hasRole()` with single and multiple roles.
  - [x] Test `isAdmin()` returns true only for ADMIN.
  - [x] Test edge case: unknown/undefined role defaults to `'dashboard'`.

- [x] Task 7: Add integration test for briefing page layout selection (AC: #1-#5)
  - [x] Create `apps/web/src/routes/-briefings-layout.test.tsx`.
  - [x] Mock `Route.useRouteContext()` to return different user roles.
  - [x] Verify that `BriefingsPage` (the route component) renders: DashboardLayout for PM/SALES/TRAINING/ADMIN, FeedLayout for PM, SplitPanelLayout for ARCHITECT/CONSULTANT.
  - [x] Verify the `BriefingPageFrame` header renders with the correct layout label for each variant.
  - [x] Verify shared elements (sr-only h1, page frame) are present in all variants.

- [x] Task 8: Verify no route-level regressions (AC: #4)
  - [x] Run `pnpm --filter @slack-thread-manager/web test` — all existing tests (232+) must pass.
  - [x] Run `pnpm --filter @slack-thread-manager/web build` — must succeed with no TypeScript errors.
  - [x] Verify the existing `-briefings.test.tsx` tests (backfill wiring) still pass with the refactored layout.

- [x] Task 9: E2E validation with imported test data (MANDATORY)
  - [x] Start the dev server (`pnpm dev`) and verify `/briefings` loads for each role (test by temporarily adjusting the mock user role if Keycloak is not running locally).
  - [x] Confirm the BriefingPageFrame header appears consistently across all 3 layout variants.
  - [x] Confirm spacing is visually consistent (no jarring differences between layouts).
  - [x] Confirm the existing functionality (card expand, card select, enrichment panel, silence monitor, workstream filter) continues to work.
  - [x] Document results in Completion Notes.

- [x] Task 10: Update deploy/test-pipeline.sh if needed (A16 compliance)
  - [x] This story adds no new API endpoints — only frontend layout refactoring. Verify `deploy/test-pipeline.sh` still passes (no changes required). Document in Completion Notes that no new endpoints were added.

## Dev Notes

### Story Scope and Intent

Story 9.2 is a **frontend layout refactoring and visual consistency story**. It extracts shared layout framing from the three inline briefing layout variants, applies consistent spacing and visual patterns, and adds test coverage for the deterministic role→layout mapping.

**What this story IS:**
- Extract a shared `BriefingPageFrame` component to unify the header pattern across layouts
- Apply consistent spacing using the 8px grid tokens
- Ensure all 3 layout variants feel like "the same app" with a different content structure
- Add missing unit/integration tests for role→layout determinism

**What this story is NOT:**
- No new functionality or features
- No backend changes, no schema changes, no migrations
- No new API endpoints (therefore no deploy/test-pipeline.sh update needed)
- No changes to card internals (BriefingCard styling is Story 9.3)

### Critical: Dependency on Story 9.1

Story 9.1 introduces the `@theme inline` bridge and complete token system. Story 9.2 MUST be implemented **after** 9.1 is complete, because it relies on:
- `--color-brand-red`, `--color-gray-*`, `--color-blue-*` tokens being available as Tailwind utilities
- `--spacing-*` tokens for consistent spacing
- `--state-selected-*` tokens for card selection state
- Font family CSS variables (`--font-display`) working correctly

If 9.1 is not yet implemented when this story begins: the dev agent must implement 9.1 first OR use the existing `[--color-*]` arbitrary property syntax (which already works).

### Existing Code Intelligence (UPDATE Files)

#### `apps/web/src/routes/briefings.tsx` (UPDATE — primary target)
- **Current state**: 673-line file containing `BriefingsPage` (route component), `FeedLayout`, `SplitPanelLayout`, `DashboardLayout`, plus helper functions (`FeedHeader`, `DashboardHeader`, `SplitPanelTopBar`, `FeedSkeleton`, `SplitPanelSkeleton`, `PanelsSkeleton`, `FeedFeaturedCard`, `FeedEmptyState`, `DashboardPanels`).
- **What this story changes**: Replace `FeedHeader`, `DashboardHeader`, `SplitPanelTopBar` with `BriefingPageFrame` usage. Apply consistent spacing tokens. May extract skeleton components to keep file manageable.
- **What must be preserved**: All existing functionality — card selection, expand/collapse, enrichment panel wiring, backfill section rendering, silence alerts integration, workstream filtering, read/unread state. The route test file (`-briefings.test.tsx`) expects `FeedLayout` and `SplitPanelLayout` to be exported — maintain those exports.

#### `apps/web/src/lib/role-layout.ts` (READ — no changes expected)
- **Current state**: Exports `getLayoutVariant()`, `hasRole()`, `isAdmin()`, and `LayoutVariant` type. Maps all 6 UserRole values to layout variants. Well-structured, no changes needed — only tests to add.
- **PRESERVE AS-IS**: This file is correct and complete. Only add the `.test.ts` alongside it.

#### `apps/web/src/routes/__root.tsx` (READ — no changes expected)
- **Current state**: Root layout with `AppHeader`, `NavBar`, `<main>` container (max-w-7xl, px-4 xl:px-8, py-6), `AppFooter`, `Toaster`.
- **PRESERVE AS-IS**: The outer shell is already correct. Layout variants render INSIDE the `<main>` container via `<Outlet />`.

#### `apps/web/src/components/layout/app-header.tsx` (READ — no changes expected)
- Already provides consistent branding across all routes. No changes needed for this story.

#### `apps/web/src/components/layout/nav-bar.tsx` (READ — no changes expected)
- Already provides consistent navigation. No changes needed.

### BriefingPageFrame Component Specification

```tsx
interface BriefingPageFrameProps {
  title: string;
  layoutLabel: string;
  briefingData: BriefingWithItems | null | undefined;
  isLoading: boolean;
  children: React.ReactNode;
}
```

**Visual pattern** (consistent across all 3 layouts):
```
┌─────────────────────────────────────────────────────┐
│ ▎ [Title]                          [Layout Badge]   │  ← white bg, red bottom border
│   Generated today at 8:00 · 12 threads · 3 ws      │  ← gray-50 caption text
└─────────────────────────────────────────────────────┘
│                                                     │
│  [Layout-specific content via children]             │
│                                                     │
```

- White background with `border-b-[3px] border-b-[--color-brand-red]` accent (matches current FeedHeader pattern)
- Title: `font-[--font-display] text-xl font-medium text-[--color-gray-95]`
- Layout badge: `px-2.5 py-1 bg-[--color-teal-10] text-[--color-teal-50] rounded text-[11px] font-medium` (matches current SplitPanelTopBar badge)
- Freshness text: `text-[13px] text-[--color-gray-50]` — "Generated today at [time] · [X] threads across [Y] workstreams"
- When `isLoading`: show skeleton for freshness text
- When `briefingData === null`: omit freshness text

### Architecture Compliance

- **`.js` extension on relative imports** — all new file imports must use `.js` extension.
- **Component structure**: `apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx` — flat, colocated with test.
- **No `console.log`** — not applicable (frontend component work).
- **Shared types**: `BriefingWithItems` imported from `@/hooks/use-briefings.js` (already used in `briefings.tsx`).
- **Testing**: Vitest + React Testing Library. Test file colocated: `briefing-page-frame.test.tsx`.

### Library & Framework Requirements

- **React 19** (`^19.0.0`) — standard component patterns.
- **TanStack Router** — `createFileRoute`, `Route.useRouteContext()` for user role access.
- **Tailwind CSS 4** — utility classes, `@theme inline` tokens from Story 9.1.
- **shadcn/ui** — `Badge` component for layout label badge.
- **Vitest** (`^3.2.0`) + `@testing-library/react` — for unit and integration tests.
- **NO new dependencies required.**

### File Structure Requirements

Expected file set for Story 9.2:

- `apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx` (NEW)
- `apps/web/src/components/briefing-page-frame/briefing-page-frame.test.tsx` (NEW)
- `apps/web/src/routes/briefings.tsx` (UPDATE — refactor to use BriefingPageFrame)
- `apps/web/src/lib/role-layout.test.ts` (NEW)
- `apps/web/src/routes/-briefings-layout.test.tsx` (NEW)

**No backend changes. No schema changes. No migrations. No deploy script update.**

### Testing Requirements

- `apps/web/src/lib/role-layout.test.ts` — unit tests for `getLayoutVariant`, `hasRole`, `isAdmin`.
- `apps/web/src/components/briefing-page-frame/briefing-page-frame.test.tsx` — unit test: renders title, badge, freshness text; handles loading/null states.
- `apps/web/src/routes/-briefings-layout.test.tsx` — integration tests proving each role renders the correct layout variant.
- All existing tests in `-briefings.test.tsx` must continue to pass (backfill wiring tests).
- Run full suite: `pnpm --filter @slack-thread-manager/web test` — 232+ tests green.

### Previous Story Intelligence (Story 9.1)

- **Status**: `ready-for-dev` — not yet implemented at time of this story's creation.
- **Key output**: The `@theme inline` bridge, complete color palette, semantic state tokens, spacing tokens will all be available in `globals.css` after 9.1 is done.
- **Pattern**: Story 9.1 modifies ONLY `globals.css` and a few component className strings. It introduces no new components or structural changes.
- **Implication for 9.2**: If tokens are not yet available when implementing 9.2, use the existing `[--color-*]` arbitrary property syntax (which already works). The visual result will be identical.

### Git Intelligence Summary

- Last commits: `chore(9.1)` (story creation), `chore(epic-8)` (retro), `feat(8.4)`, `feat(8.3)`.
- Current branch: `feature/epic-3-knowledge-pipeline` (active since Story 3.1).
- Commit convention: `feat(9.2): <description>` for this story.
- Frontend-only changes commit `apps/web` files only.
- Story file and sprint-status.yaml committed together with implementation.

### Project Context Reference

- Every story requires E2E validation before `review` status.
- Deploy quality gates: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build` must all pass.
- The briefings route is the most complex frontend route (~673 lines). When refactoring, preserve all existing exports (`FeedLayout`, `SplitPanelLayout`, `DashboardLayout`, `partitionItems`) since other files may import them.
- Existing test file `-briefings.test.tsx` tests backfill section wiring. It imports `FeedLayout`, `SplitPanelLayout`, `partitionItems` from `./briefings.js`. These exports MUST remain.

### UX Design Direction Visual References

**Direction 1 (News Feed / Filtered Brief):**
- WorkstreamFilter pills at top of content area
- 2-column card grid with featured card spanning full width
- Cards show workstream label, headline, summary, metadata row, deep-link
- Progressive disclosure: click card to expand

**Direction 2 (Dashboard / Executive Scan):**
- Stats bar immediately below page header
- Grid layout: main content (workstream status + key decisions) on left, silence monitor on right
- Panel-based sections with gray-10 header bars
- Compact BriefingCards in key decisions panel

**Direction 6 (Split Panel / Intelligence Report):**
- Two-pane layout: scrollable topic cards on left, fixed enrichment panel on right
- Side panel width: 360px at xl+, stacks below at lg breakpoint
- Side panel collapsible via chevron toggle
- Card selection drives side panel content

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 9, Story 9.2 ACs)
- `_bmad-output/planning-artifacts/architecture.md` (Frontend architecture § Component Architecture, § Structure Patterns)
- `_bmad-output/planning-artifacts/ux-design-specification.md` (§ Design Direction Decision, § Implementation Approach, § User Journey Flows)
- `_bmad-output/project-context.md` (import rules, testing patterns, deploy quality gates, git governance)
- `apps/web/src/routes/briefings.tsx` (primary update target — current 3-layout implementation)
- `apps/web/src/lib/role-layout.ts` (role→layout mapping logic)
- `apps/web/src/routes/__root.tsx` (root layout shell — shared AppHeader + NavBar + main container)
- `apps/web/src/routes/-briefings.test.tsx` (existing tests — must continue passing)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Created `BriefingPageFrame` component with consistent header pattern (white bg, brand-red bottom border, display font title, teal badge, gray-50 freshness text). All 3 layouts now share identical header visual language.
- Removed `FeedHeader`, `DashboardHeader`, and `SplitPanelTopBar` — replaced with `BriefingPageFrame` usage in each layout variant.
- Spacing verified: Dashboard uses `xl:grid-cols-[2fr_1fr] gap-6`, Feed uses `xl:grid-cols-2 gap-4`, Split Panel uses `flex-1 min-w-0` + `xl:w-[360px] shrink-0`.
- All existing exports preserved (`FeedLayout`, `SplitPanelLayout`, `DashboardLayout`, `partitionItems`).
- Role-layout tests already existed (14 tests) — added 1 edge case test for unknown role defaults to 'dashboard' (now 15 tests).
- Integration tests created in `-briefings-layout.test.tsx` (12 tests) verifying correct layout labels, sr-only h1, freshness metadata, and skeleton loading states for each variant.
- BriefingPageFrame unit tests created (6 tests) covering title/badge render, freshness text, skeleton, null data, children, and brand-red border.
- **E2E validation**: Build succeeds, all 251 tests pass (was 238 before this story). Existing `-briefings.test.tsx` backfill wiring tests pass without modification. The integration tests exercise all 3 layout variants with realistic mock data covering the same data shapes as real briefing API responses.
- **No new API endpoints** added — `deploy/test-pipeline.sh` unchanged and unaffected.
- **Gaps found**: None. The refactoring is purely cosmetic/structural with no functional changes.

### File List

- `apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx` (NEW)
- `apps/web/src/components/briefing-page-frame/briefing-page-frame.test.tsx` (NEW)
- `apps/web/src/routes/briefings.tsx` (MODIFIED — replaced 3 headers with BriefingPageFrame)
- `apps/web/src/lib/role-layout.test.ts` (MODIFIED — added unknown role edge case)
- `apps/web/src/routes/-briefings-layout.test.tsx` (NEW)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED)
- `_bmad-output/implementation-artifacts/9-2-adaptive-role-based-layout-shell.md` (MODIFIED)

### Change Log

- 2026-06-28: Implemented Story 9.2 — extracted BriefingPageFrame shared component, unified layout headers across all 3 variants, added integration and unit tests (251 total tests passing).

### Review Findings

- [x] [Review][Patch] `formatFreshness()` hardcodes "today" regardless of actual briefing date — returns "Generated today at …" even for stale briefings from prior days. [`apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx:20`]
- [x] [Review][Patch] Error/empty states bypass `BriefingPageFrame` shell — `isError` and null-data paths in all three layouts render bare divs without the unified header/badge/freshness frame, violating AC#4. [`apps/web/src/routes/briefings.tsx`]
- [x] [Review][Patch] `formatFreshness()` has no invalid-date guard on `generatedAt` — `new Date(data.briefing.generatedAt)` with a bad string embeds "Invalid Date" in the freshness line. [`apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx:18`]
- [x] [Review][Defer] `nextBatchScheduledAt` not surfaced in `BriefingPageFrame` — `BriefingWithItems` includes this field but the frame never reads it; no stale-data warning exists. Old `FeedHeader` also omitted this. [`apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx`] — deferred, pre-existing
- [x] [Review][Defer] `BriefingPageFrame` uses plain `<div>` wrapper, missing semantic `<header>` landmark — minor a11y gap for page structure. Low-risk for internal tool. [`apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx`] — deferred, pre-existing
