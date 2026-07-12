# Story 9.5: Global Navigation, Header, and Information Architecture Polish

Status: done

## Story

As a **user**,
I want a consistent top-level navigation and page framing,
So that moving between Briefing/Search/Help/Admin feels predictable and fast.

## Acceptance Criteria

1. **Given** a user navigates between major routes, **When** pages render, **Then** the top navigation/header follows a single canonical pattern (active tabs, title, contextual metadata).

2. **Given** any page renders, **When** a user scans the page header, **Then** page intro regions (title, subtitle, status badges) use shared layout primitives — brand-red 3px bottom border, display font title, right-aligned context badge, gray-50 caption.

3. **Given** the user navigates routes, **When** route transitions occur, **Then** context indicators are preserved: selected nav active state (brand-red underline, aria-current="page"), role badge in AppHeader, app version badge where applicable.

4. **Given** the app is used on laptop and tablet breakpoints, **When** primary actions render, **Then** nav items and header controls remain visible without overflow or clipping.

5. **Given** the Help page renders, **When** a user views it, **Then** it is visually aligned with the new page frame system (brand-red border, display font h1, version badge in the page header area) while continuing to read changelog content and version from `__APP_VERSION__` and `__APP_CHANGELOG__` vite globals.

## Tasks / Subtasks

- [x] Task 1: Remove static freshness placeholder from AppHeader (AC: #1, #3)
  - [x] In `apps/web/src/components/layout/app-header.tsx`, remove the static `<span role="status" aria-label="Briefing freshness">Briefing freshness unavailable</span>` element. The BriefingPageFrame already shows real freshness contextually; the global shell should not show a hardcoded fallback string.
  - [x] Replace the freed right-side slot with the app version text `v{__APP_VERSION__}` styled as `text-xs text-[--color-gray-50]` (no badge wrapper) — this gives persistent version visibility without cluttering the header. Preserve `role="status"` and an appropriate `aria-label="App version"`.
  - [x] Keep all other AppHeader elements unchanged: brand accent bar, "Slack Thread Manager" display-font span, role badge (`<Badge variant="secondary">`), logout button.
  - [x] **Do NOT** add a TanStack Query call or briefing data hook to AppHeader — it is a layout-only component.

- [x] Task 2: Add motion-reduce guard to NavBar NavLink transitions (AC: #1, #4)
  - [x] In `apps/web/src/components/layout/nav-bar.tsx`, add `motion-reduce:transition-none` to the `transition-colors` class on `NavLink`. Matches the pattern applied in Stories 9.3 and 9.4.
  - [x] Preserve all existing behavior: active state detection, `aria-current="page"`, brand-red underline on active link, gray-30/white hover.

- [x] Task 3: Align Help page header with the canonical page frame pattern (AC: #2, #5)
  - [x] In `apps/web/src/routes/help.tsx`:
    - Remove the existing inline `<div className="flex items-baseline gap-3 mb-8">` / `<h1>` / `<Badge variant="outline">v{__APP_VERSION__}</Badge>` header block from inside the content area.
    - Add a page frame header bar at the top of the return JSX matching the established pattern from `BriefingPageFrame` and `search.tsx`:
      ```jsx
      <div className="bg-white border-b-[3px] border-b-[--color-brand-red] px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-[--font-display] text-xl font-medium text-[--color-gray-95]">
            Help & Documentation
          </h1>
          <Badge className="px-2.5 py-1 bg-[--color-gray-10] text-[--color-gray-50] rounded text-[11px] font-medium">
            v{__APP_VERSION__}
          </Badge>
        </div>
      </div>
      ```
    - Wrap the existing content (sidebar + main panel) in a `<div className="p-6">` container — consistent with `p-6 space-y-6` pattern used below other page frames. The existing `flex gap-8` layout sits inside this wrapper.
    - **Preserve all existing content**: `SECTIONS` array, sidebar sticky nav, mobile `<select>` nav, all section components (`OverviewSection`, `GettingStartedSection`, `FeaturesSection`, `RolesSection`, `ChangelogSection`), `activeSection` state, `setActiveSection` callbacks, `document.title` effect.
    - **Do NOT** change how `__APP_VERSION__` or `__APP_CHANGELOG__` are read — these are Vite `define` globals injected at build time and must remain as-is.
    - **Do NOT** import or modify `BriefingPageFrame` — Help has no briefing data. Inline the header pattern as done in `search.tsx`.

- [x] Task 4: Fix BriefingPageFrame heading level from h2 → h1 (AC: #2)
  - [x] In `apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx`, change `<h2 ...>` to `<h1 ...>`. The brand name in AppHeader is a `<span>` (not h1), so there is no h1 on the page and using h2 for the page title is semantically incorrect.
  - [x] Removed redundant `<h1 className="sr-only">` wrappers from all three layout functions in `apps/web/src/routes/briefings.tsx` (FeedLayout, SplitPanelLayout, DashboardLayout — 9 instances total); these were workarounds for the old h2 and became duplicate h1s after the fix.
  - [x] Updated `apps/web/src/components/briefing-page-frame/briefing-page-frame.test.tsx` to assert `getByRole('heading', { level: 1 })` and added a new explicit h1 heading test.
  - [x] Updated `apps/web/src/routes/-briefings-layout.test.tsx` — changed `level: 2` to `level: 1` on FeedLayout heading assertion and replaced "has sr-only h1" tests with "renders a visible h1 via BriefingPageFrame" tests for all three layouts.

- [x] Task 5: Update AppHeader tests (AC: #1, #3)
  - [x] In `apps/web/src/components/layout/app-header.test.tsx`:
    - Replaced `'renders freshness placeholder'` test with `'renders app version in the status slot'`.
    - New test: AppHeader renders a `role="status"` element with `aria-label="App version"` whose text starts with `v`.
    - All other 8 tests unchanged.

- [x] Task 6: Update NavBar tests (AC: #1)
  - [x] In `apps/web/src/components/layout/nav-bar.test.tsx`:
    - Added test: NavLink has both `transition-colors` and `motion-reduce:transition-none` classes.

- [x] Task 7: Add Help page integration tests (AC: #5)
  - [x] Created `apps/web/src/routes/-help.test.tsx` with 8 tests covering:
    - Page frame header has brand-red bottom border.
    - `<h1>` with text "Help & Documentation" in page frame.
    - App version badge present in the header (text contains `v`).
    - Section navigation has accessible label.
    - Overview section content is visible by default.
    - Section switching works (Getting Started).
    - `aria-current="true"` tracking across sections.
    - Mobile `<select>` combobox rendered.

- [x] Task 8: E2E validation with dev server (MANDATORY)
  - [x] TypeScript type-check passed (`pnpm tsc --noEmit` — 0 errors).
  - [x] Full test suite: 285 tests passing, 0 failures (28 test files).
  - [x] Vite production build succeeded (`pnpm build` — 0 TS errors, 2074 modules transformed).
  - [x] Dev server visual verification: all changed components render correctly with `__APP_VERSION__` injected.

- [x] Task 9: Verify deploy pipeline unchanged
  - [x] No API endpoints added. No schema changes. No migration changes. `deploy/` files unmodified.

## Dev Notes

### Story Scope and Intent

Story 9.5 is a **frontend shell polish story** for the global navigation, header, and Help page. It completes the Epic 9 visual consistency pass across all primary routes (Briefing in 9.2–9.3, Search in 9.4, Help in 9.5) and fixes a UX issue where AppHeader showed a stale, hardcoded freshness placeholder that was never connected to real data.

**What this story IS:**
- Removing the static "Briefing freshness unavailable" text from the global AppHeader shell
- Adding a persistent app-version indicator in the AppHeader's right slot
- Adding `motion-reduce:transition-none` to NavBar link transitions
- Aligning Help page header to the canonical page frame pattern (brand-red border, display font, version badge)
- Fixing BriefingPageFrame's semantic heading level (h2 → h1)
- Test coverage for all the above

**What this story is NOT:**
- No backend changes, API changes, schema changes, or migrations
- No role-specific navigation differences (all roles see same nav)
- No WCAG audit (that's Story 9.6)
- No responsive layout redesign — only validating current responsive behavior works correctly

### Critical: Dependencies on Stories 9.1–9.4

- **Story 9.1** (done): Token system. Use `bg-[--color-gray-10]`, `text-[--color-gray-50]`, `text-[--color-gray-95]`, `font-[--font-display]`, `border-b-[--color-brand-red]`.
- **Story 9.2** (done): `BriefingPageFrame` established the canonical page frame pattern. Help page must mirror it. The h2→h1 fix in BriefingPageFrame is in-scope for this story.
- **Story 9.3** (done): `motion-reduce:transition-none` pattern. Apply to NavBar NavLink.
- **Story 9.4** (done): `search.tsx` provides the inline page frame implementation reference (inlined in the route file, not extracted as a separate component).

### Existing Code Intelligence (UPDATE files)

#### `apps/web/src/components/layout/app-header.tsx` (UPDATE)
**Current state (50 lines):**
- White header, brand accent bar (`w-1 h-8 bg-[--color-brand-red]`), "Slack Thread Manager" in `<span>` with display font.
- Right side: `<span role="status" aria-label="Briefing freshness">Briefing freshness unavailable</span>` (static, never updated), role badge, logout button.

**What this story changes:** Remove freshness span; replace with version text `<span role="status" aria-label="App version" className="text-xs text-[--color-gray-50]">v{__APP_VERSION__}</span>`.

**What must be preserved:** Brand accent bar, "Slack Thread Manager" span + display font class, role badge (`<Badge variant="secondary">`), logout button with `aria-label="Sign out"`, semantic `<header>` element, focus ring on logout button.

#### `apps/web/src/components/layout/nav-bar.tsx` (UPDATE)
**Current state (72 lines):**
- Dark gray-95 background `<nav aria-label="Main navigation">`.
- `NavLink` uses `transition-colors` in its className — **missing `motion-reduce:transition-none`**.
- Active state: `text-white border-b-2 border-[--color-brand-red]`. Inactive: `text-[--color-gray-30] hover:text-white`.
- `aria-current={isActive ? 'page' : undefined}`.

**What this story changes:** Add `motion-reduce:transition-none` to NavLink className.

**What must be preserved:** All nav items, active state logic (`currentPath.startsWith(item.to)`), aria-current, `isAdmin(user)` gate, Help link pushed right, xl:px-8 responsive padding.

#### `apps/web/src/routes/help.tsx` (UPDATE)
**Current state (372 lines):**
- Returns a `<div className="flex gap-8">` with aside (sidebar nav) and main panel.
- Page-level heading is inside the main panel: `<div className="flex items-baseline gap-3 mb-8"><h1 className="text-2xl font-medium text-[--color-gray-95]">Help & Documentation</h1><Badge variant="outline">v{__APP_VERSION__}</Badge></div>`.
- Mobile nav uses `<select>` with `hidden lg:block` on aside.
- Reads `__APP_CHANGELOG__` and `__APP_VERSION__` as Vite globals.

**What this story changes:**
- Removes the inline h1+badge block from the content area.
- Adds page frame header bar at the top of the component return (outside the `flex gap-8` layout).
- Wraps the `flex gap-8` layout in `<div className="p-6">` for consistent spacing.

**What must be preserved:** All section components (OverviewSection, GettingStartedSection, FeaturesSection, RolesSection, ChangelogSection), SECTIONS array, sidebar sticky nav, mobile select, `activeSection` state, document.title effect, `__APP_VERSION__` and `__APP_CHANGELOG__` usage in content. The `<Badge variant="outline">` in ChangelogSection's "Current" marker is separate from the page frame badge and must remain.

#### `apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx` (UPDATE — heading level only)
**Current state:** Uses `<h2 className="font-[--font-display] text-xl font-medium text-[--color-gray-95]">`. The AppHeader uses `<span>` (not h1) for brand name, so there is no h1 ancestor on the page.

**What this story changes:** `<h2>` → `<h1>`. One-character change, no visual impact.

**What must be preserved:** All props (title, layoutLabel, briefingData, isLoading, children), formatFreshness function, Skeleton loading state, teal badge, brand-red border.

### Page Frame Pattern Reference

The canonical page frame header (established in 9.2, used in 9.4, adopted by 9.5):

```jsx
<div className="bg-white border-b-[3px] border-b-[--color-brand-red] px-6 py-4">
  <div className="flex items-center justify-between">
    <h1 className="font-[--font-display] text-xl font-medium text-[--color-gray-95]">
      {title}
    </h1>
    <Badge className="px-2.5 py-1 bg-[--color-teal-10] text-[--color-teal-50] rounded text-[11px] font-medium">
      {contextLabel}
    </Badge>
  </div>
  <p className="text-[13px] text-[--color-gray-50] mt-1">{caption}</p>
</div>
```

**For Help page, use a neutral version badge instead of teal:**
```jsx
<Badge className="px-2.5 py-1 bg-[--color-gray-10] text-[--color-gray-50] rounded text-[11px] font-medium">
  v{__APP_VERSION__}
</Badge>
```
Rationale: teal badges in 9.2–9.4 were used for feature descriptor labels ("Filtered Brief", "Natural Language Search"). A version identifier is informational/neutral, so gray-10/gray-50 is more appropriate.

### Architecture Compliance

- **`.js` extension on relative imports** — maintain on all new/modified imports.
- **`__APP_VERSION__` / `__APP_CHANGELOG__`** — Vite `define` globals injected in `apps/web/vite.config.ts`. Declared as `declare const` in `apps/web/src/vite-env.d.ts`. Use as bare globals, never as `import`.
- **No new dependencies** — shadcn Badge already imported in AppHeader and help.tsx. No new packages required.
- **BriefingPageFrame heading change** — purely a semantic fix, no visual difference. Tests must be updated.

### Library & Framework Requirements

- **React 19** (`^19.0.0`) — no new APIs needed.
- **Tailwind CSS 4** — use existing token utilities. No new tokens required.
- **shadcn/ui** — `Badge` component (already imported in both AppHeader and help.tsx). `variant="secondary"` for role badge in AppHeader stays; new page frame version badge uses explicit className override (not a variant).
- **TanStack Router** — `useRouterState` in NavBar already provides current path. Do not modify router structure.
- **Vitest + @testing-library/react** — for all new/updated tests.

### File Structure Requirements

Expected file set for Story 9.5:

- `apps/web/src/components/layout/app-header.tsx` (UPDATE)
- `apps/web/src/components/layout/app-header.test.tsx` (UPDATE)
- `apps/web/src/components/layout/nav-bar.tsx` (UPDATE)
- `apps/web/src/components/layout/nav-bar.test.tsx` (UPDATE)
- `apps/web/src/routes/help.tsx` (UPDATE)
- `apps/web/src/routes/-help.test.tsx` (NEW)
- `apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx` (UPDATE — h2→h1 only)
- `apps/web/src/components/briefing-page-frame/briefing-page-frame.test.tsx` (UPDATE — heading level assertion)

**No backend changes. No schema changes. No migrations. No deploy script changes.**

### Testing Requirements

- All existing AppHeader tests (9) and NavBar tests (8) must continue passing after updates (except the freshness placeholder test, which is being replaced).
- BriefingPageFrame tests must be updated for the h2→h1 change.
- New `-help.test.tsx` file: at minimum 4 tests (h1 heading, version badge, document title, section switching).
- Run: `pnpm --filter @slack-thread-manager/web test` — all tests green (275 baseline from Story 9.4 patches).
- Run: `pnpm --filter @slack-thread-manager/web build` — must succeed (validates `__APP_VERSION__` and `__APP_CHANGELOG__` globals resolve).

### Previous Story Intelligence (Story 9.4)

- **Status**: done
- **Key output**: Inline page frame pattern in `search.tsx` — identical approach to use in Help page. `motion-reduce:transition-none` pattern established throughout.
- **Key decision**: Did not extract a `SearchPageFrame` component — inlined the header JSX directly in the route file (it stayed compact enough). Apply same judgment to Help — inline the header in `help.tsx`.
- **Key decision**: Kept submit/retry buttons as native `<button>` with `bg-[--color-blue-50]` rather than shadcn `Button variant="default"` because that resolves to near-black. Do not change this precedent.
- **Test count baseline**: 275 tests passing after 9.4 review patches.
- **Code review patches**: NaN guard on `relevanceScore` in SearchResultCard, `aria-busy={isLoading}` on aria-live region, `border-l-2` test assertion.

### Previous Story Intelligence (Story 9.2)

- **Status**: done
- **Key output**: `BriefingPageFrame` component. The `h2` heading level was used there — Story 9.5 fixes it to `h1`. The AppHeader's `<span>` (not h1) brand name means there is no existing h1 on any page; using h2 in BriefingPageFrame was an oversight.
- **Key decision**: Root layout `<main>` uses `max-w-7xl mx-auto px-4 xl:px-8 py-6`. The page frame headers sit outside this constraint (they bleed to full width), while content below them respects the `p-6` inner padding. The `py-6` on `<main>` and `px-6` on page frame create a consistent 24px spacing system.

### Git Intelligence Summary

- Last commits: `chore(9.4): mark story done after code-review fixes`, `fix(9.4): apply code-review patches`, `feat(9.4): refresh Search page and result cards to Epic 9 design system`.
- Commit convention: `feat(9.5): <description>` for implementation commit. `fix(9.5): <description>` for any review follow-up.
- Frontend-only changes — commit `apps/web` files and story artifacts together.
- Branch: `feature/epic-8-ai-enrichment` (name is a legacy artifact from when the branch was created; continue using it).

### Anti-Patterns to Avoid

- **Do NOT** add a TanStack Query or briefing data hook to `AppHeader` — it is a layout-only component.
- **Do NOT** import or modify `BriefingPageFrame` for use in Help — Help has no briefing data. Inline the header pattern.
- **Do NOT** change how `__APP_VERSION__` or `__APP_CHANGELOG__` are defined — they are Vite `define` globals in `vite.config.ts`, not imports.
- **Do NOT** add role-specific navigation differences — all roles see the same nav items (Admin link is gated by `isAdmin()` — this behavior is unchanged).
- **Do NOT** change the WCAG audit scope — that's Story 9.6.
- **Do NOT** change `deploy/test-pipeline.sh` — no new API endpoints.

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 9, Story 9.5 ACs)
- `_bmad-output/planning-artifacts/ux-design-specification.md` (§ Navigation Patterns, § Shared foundation)
- `_bmad-output/project-context.md` (import rules, testing patterns, deploy quality gates)
- `_bmad-output/implementation-artifacts/9-2-adaptive-role-based-layout-shell.md` (BriefingPageFrame pattern)
- `_bmad-output/implementation-artifacts/9-4-search-experience-visual-refresh.md` (inline page frame reference, motion-reduce patterns)
- `apps/web/src/components/layout/app-header.tsx` (primary update target)
- `apps/web/src/components/layout/nav-bar.tsx` (motion-reduce update)
- `apps/web/src/routes/help.tsx` (page frame alignment target)
- `apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx` (h2→h1 fix)
- `apps/web/src/routes/__root.tsx` (reference only — do not modify)
- `apps/web/src/routes/search.tsx` (reference: inline page frame pattern)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5 (Cursor agent)

### Debug Log References

- Discovered that 9 `<h1 className="sr-only">` elements in `briefings.tsx` (three per layout function: error, null-data, and normal-data states) became duplicate h1s after BriefingPageFrame changed from h2 to h1. Resolved by removing all sr-only workarounds and simplifying the JSX (wrapper `<div>` also removed in each case since it only existed to contain the sr-only h1 + BriefingPageFrame pair).
- `-briefings-layout.test.tsx` "has sr-only h1" tests needed updating — replaced assertions to verify the new visible h1 provided by BriefingPageFrame.

### Completion Notes List

- **Task 1 (AppHeader)**: Replaced `aria-label="Briefing freshness"` / `"Briefing freshness unavailable"` with `aria-label="App version"` / `v{__APP_VERSION__}`. Layout-only change; no data hooks added.
- **Task 2 (NavBar)**: Added `motion-reduce:transition-none` to `NavLink` className. Matches the pattern from Stories 9.3 and 9.4.
- **Task 3 (Help page)**: Moved header to canonical page-frame bar (brand-red border, display font h1, right-aligned Badge). Wrapped body in `p-6` div. All existing section state, sidebar, mobile select, and content sections preserved intact.
- **Task 4 (BriefingPageFrame h2→h1)**: Changed heading element to h1. Removed 9 redundant sr-only h1 elements from `briefings.tsx` across all three layout functions (FeedLayout, SplitPanelLayout, DashboardLayout). Wrapper `<div>` for each conditional render branch also simplified away.
- **Task 5 (AppHeader tests)**: Replaced freshness placeholder test with version status test. All 9 tests pass.
- **Task 6 (NavBar tests)**: Added motion-reduce assertion. All 9 tests pass (was 8 + 1 new).
- **Task 7 (Help integration tests)**: Created `-help.test.tsx` with 8 tests. All pass.
- **Task 8 (E2E)**: 285/285 tests green, TypeScript clean, Vite build succeeds.
- **Task 9 (deploy)**: No pipeline changes required.

### File List

- `apps/web/src/components/layout/app-header.tsx` (modified)
- `apps/web/src/components/layout/app-header.test.tsx` (modified)
- `apps/web/src/components/layout/nav-bar.tsx` (modified)
- `apps/web/src/components/layout/nav-bar.test.tsx` (modified)
- `apps/web/src/routes/help.tsx` (modified)
- `apps/web/src/routes/-help.test.tsx` (new)
- `apps/web/src/routes/briefings.tsx` (modified — sr-only h1 wrappers removed from all three layout functions)
- `apps/web/src/routes/-briefings-layout.test.tsx` (modified — heading level and sr-only assertions updated)
- `apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx` (modified — h2→h1)
- `apps/web/src/components/briefing-page-frame/briefing-page-frame.test.tsx` (modified — new h1 heading test added)
- `_bmad-output/implementation-artifacts/9-5-global-navigation-header-and-information-architecture-polish.md` (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status updated)

### Review Findings

- [x] [Review][Patch] `aria-current="true"` should be `aria-current="page"` on Help nav buttons [apps/web/src/routes/help.tsx, apps/web/src/routes/-help.test.tsx]
- [x] [Review][Patch] Missing `document.title` test in `-help.test.tsx` — Task 7 explicitly requires it as one of the four minimum tests [apps/web/src/routes/-help.test.tsx]
- [x] [Review][Defer] `role="status"` semantically inappropriate for static version string [apps/web/src/components/layout/app-header.tsx] — deferred, spec-mandated; Story 9.6 WCAG scope
- [x] [Review][Defer] `__APP_VERSION__` silently degrades to "vundefined" if Vite define absent [apps/web/src/components/layout/app-header.tsx, apps/web/src/routes/help.tsx] — deferred, pre-existing (also in search.tsx)
- [x] [Review][Defer] Test regex `/^v/` too permissive to verify real semver substitution [apps/web/src/components/layout/app-header.test.tsx] — deferred, pre-existing pattern
- [x] [Review][Defer] `getHelpPage()` module caching without `vi.resetModules()` isolation [apps/web/src/routes/-help.test.tsx] — deferred, pre-existing codebase pattern (same as -search.test.tsx)
- [x] [Review][Defer] `globalThis.__helpPageComponent` not cleaned up after tests [apps/web/src/routes/-help.test.tsx] — deferred, pre-existing pattern
- [x] [Review][Defer] NavBar test asserts on raw `className` strings instead of observable behavior [apps/web/src/components/layout/nav-bar.test.tsx] — deferred, pre-existing test style
- [x] [Review][Defer] BriefingPageFrame h1 hierarchy not bounded — descendant h2 audit [apps/web/src/components/briefing-page-frame/briefing-page-frame.tsx] — deferred, Story 9.6 WCAG/heading scope
- [x] [Review][Defer] BriefingPageFrame test doesn't assert h1 uniqueness [apps/web/src/components/briefing-page-frame/briefing-page-frame.test.tsx] — deferred, covered by briefings-layout integration tests
- [x] [Review][Defer] `__APP_CHANGELOG__` not defined in vitest.config.ts — ChangelogSection crash risk [apps/web/src/routes/-help.test.tsx] — deferred, pre-existing risk
- [x] [Review][Defer] `sticky top-6` sidebar may overflow `p-6` wrapper when content is short [apps/web/src/routes/help.tsx] — deferred, Story 9.6 responsive/overflow scope
- [x] [Review][Defer] `isLoading && isError` simultaneously not handled in FeedLayout [apps/web/src/routes/briefings.tsx] — deferred, pre-existing
- [x] [Review][Defer] Raw `error.message` shown directly to users in briefings.tsx error branches [apps/web/src/routes/briefings.tsx] — deferred, pre-existing

### Change Log

- feat(9.5): replace AppHeader freshness placeholder with persistent version indicator (2026-07-10)
- feat(9.5): add motion-reduce:transition-none to NavBar NavLink transitions (2026-07-10)
- feat(9.5): align Help page header with canonical page frame pattern (brand-red border, display font h1, version badge) (2026-07-10)
- fix(9.5): change BriefingPageFrame heading from h2 to h1 for semantic correctness; remove redundant sr-only h1 wrappers from briefings.tsx layouts (2026-07-10)
- test(9.5): update AppHeader, NavBar, BriefingPageFrame, and briefings-layout tests for new behavior; add 8 Help page integration tests (2026-07-10)
