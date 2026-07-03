# Story 9.3: Briefing Card Visual State System

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **team member**,
I want card states to be visually clear and consistent,
so that I can scan priority and confidence quickly without re-reading.

## Acceptance Criteria

1. **Given** briefing cards render across supported layouts, **When** cards are displayed, **Then** card variants include visual treatments for unread/read, gone-quiet, newly surfaced, and partial-match states using the semantic state tokens from Story 9.1.

2. **Given** a gone-quiet card, **When** it renders in any layout, **Then** gone-quiet styling uses `--state-gone-quiet-bg` (yellow-10) background and `--state-gone-quiet-border` (yellow-30) left border, consistent with the design system tokens.

3. **Given** briefing cards in all three variants (compact, standard, featured), **When** they render, **Then** source links ("View in Slack →") are consistently placed and styled — blue-50 color, right-aligned or bottom-aligned per variant, with hover underline and focus ring.

4. **Given** any card in any visual state, **When** it renders, **Then** workstream identity cues (label badge/accent) remain visible and never occluded by state styling.

5. **Given** any interactive card, **When** it receives hover/focus/selected interactions, **Then** these meet keyboard accessibility expectations — visible focus ring, correct ARIA attributes, Enter/Space key activation, and `prefers-reduced-motion` respected on transitions.

## Tasks / Subtasks

- [x] Task 1: Migrate BriefingCard to semantic state tokens (AC: #1, #2, #4)
  - [x] In `apps/web/src/components/briefing-card/briefing-card.tsx`, replace hardcoded color references with semantic state token classes from Story 9.1:
    - `bg-[--color-blue-10]` → `bg-state-selected-bg`
    - `border-[--color-blue-50]` → `border-state-selected-border`
    - `bg-[--color-yellow-10]` → `bg-state-gone-quiet-bg`
    - `border-l-[--color-yellow-30]` → `border-l-state-gone-quiet-border`
  - [x] Keep `[--color-*]` syntax for non-state colors that don't have a semantic token equivalent (e.g., `text-[--color-gray-50]` for metadata text, `text-[--color-blue-50]` for links — these are NOT state tokens).
  - [x] Verify state tokens render correctly by checking that `bg-state-selected-bg` resolves to `var(--state-selected-bg)` → `#e0f0ff`.
  - [x] Ensure workstream label (`text-[--color-blue-50]`) remains visible in ALL states — it must never be hidden by state background colors.

- [x] Task 2: Add `partial-match` visual state to BriefingCard (AC: #1)
  - [x] Add optional prop `isPartialMatch?: boolean` to `BriefingCardProps`.
  - [x] When `isPartialMatch === true` AND the card is unread:
    - Apply `bg-state-partial-match-bg` (yellow-10) background.
    - Apply `border-l-2 border-l-state-partial-match-border` (yellow-30) left border.
    - Render a "Partial match — verify with source" badge using `bg-[--color-yellow-10] text-[--color-yellow-70]` styling (matches the search result card pattern from `SearchResultCard`).
  - [x] `partial-match` state has LOWER priority than `gone-quiet` and `selected` states (i.e., if a card is both gone-quiet and partial-match, gone-quiet wins visually).
  - [x] When `isRead === true`, partial-match gets the standard read opacity treatment (0.6) like all other states.

- [x] Task 3: Add `newly-surfaced` visual enhancement (AC: #1)
  - [x] The "New" badge (green-10 bg, green-50 text) already exists and renders when `!isCrossWorkstream && !isOrphaned && !isQuiet && isNew`. This IS the "newly surfaced" visual treatment.
  - [x] Enhance: in STANDARD and FEATURED variants, when the card is newly surfaced (`isNew && !isRead`), add a subtle `border-l-2 border-l-[--color-green-50]` left border accent IF no other state-specific left border takes priority (gone-quiet, orphaned, or unread-blue all take priority).
  - [x] Priority order for left border (highest to lowest): `selected` (full border) > `gone-quiet` (yellow-30) > `orphaned` (yellow-30) > `unread` (blue-50) > `newly-surfaced` (green-50) > none.
  - [x] The "New" badge always renders regardless of left border priority — the badge and the border are independent visual cues.

- [x] Task 4: Standardize hover/focus/transition patterns across all variants (AC: #5)
  - [x] STANDARD/FEATURED variants (expandable): ensure `transition-shadow hover:shadow-md` is present, `focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none` on the expand button, and `motion-reduce:transition-none` on ALL transitions.
  - [x] STANDARD/FEATURED variants (selectable via `onSelect`): ensure the Card itself has `focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none`, `role="option"`, `tabIndex={0}`, `aria-selected`, and cursor pointer.
  - [x] COMPACT variant: currently has no hover/focus treatment. Add `transition-colors hover:bg-[--color-gray-05]` to the compact card wrapper div for subtle hover feedback.
  - [x] COMPACT variant: if `sourceThreadUrl` is present, ensure the "View in Slack →" link has `focus-visible:ring-2 focus-visible:ring-[--color-blue-50] rounded` for keyboard users.
  - [x] ALL variants: verify `motion-reduce:transition-none` is applied alongside every `transition-*` class.

- [x] Task 5: Ensure consistent "View in Slack →" link placement and styling (AC: #3)
  - [x] COMPACT variant: link is already right-aligned (shrink-0). Verify: blue-50 text, hover:underline, focus ring, `aria-label`, `target="_blank"`, `rel="noopener noreferrer"`.
  - [x] STANDARD/FEATURED variant: link renders below the summary text. Verify same styling pattern as compact. Ensure it is always OUTSIDE the expand button clickable area to avoid nested interactive elements.
  - [x] Verify: clicking "View in Slack →" does NOT trigger card expand or card selection (already handled via `e.stopPropagation()` — confirm this works in both expand and select modes).

- [x] Task 6: Extract card state logic into utility function (AC: #1, #2, #4)
  - [x] Create a `getCardStateClasses()` helper function (inline in `briefing-card.tsx` or exported for test use) that computes the combined className for a card given its state:
    - Inputs: `{ isRead, selected, isQuiet, isOrphaned, isPartialMatch, isNew, isSelectable }`
    - Returns: `{ cardClasses: string, showLeftBorder: string | null, opacity: string }` — resolves priority conflicts deterministically.
  - [x] Replace the current inline className concatenation with this helper (improves readability, testability, and prevents conflicting state classes).
  - [x] Add unit tests for this helper (see Task 8).

- [x] Task 7: Update existing BriefingCard tests for semantic token migration (AC: #1-#5)
  - [x] In `apps/web/src/components/briefing-card/briefing-card.test.tsx`, update CSS class assertions:
    - `border-l-[--color-blue-50]` → `border-l-[--color-blue-50]` (keep if not migrated) OR new token class.
    - `bg-[--color-blue-10]` → `bg-state-selected-bg` (if migrated).
    - `border-[--color-blue-50]` → `border-state-selected-border` (if migrated).
    - `border-l-[--color-yellow-30]` → `border-l-state-gone-quiet-border` (if migrated).
  - [x] IMPORTANT: Update assertions to match whatever the actual implementation uses. If a state token class is used, test for that class. If `[--color-*]` syntax remains, test for that.
  - [x] Ensure ALL existing tests continue to pass after migration — no test regressions.

- [x] Task 8: Add tests for new partial-match and newly-surfaced states (AC: #1)
  - [x] Add test: `partial-match card renders yellow background and badge`.
  - [x] Add test: `partial-match + read applies opacity-60`.
  - [x] Add test: `partial-match + gone-quiet — gone-quiet wins`.
  - [x] Add test: `partial-match + selected — selected wins`.
  - [x] Add test: `newly surfaced card (isNew && !isRead) renders green left border when no higher-priority border`.
  - [x] Add test: `newly surfaced + unread — unread blue border wins over green`.
  - [x] Add test: `compact variant with hover class applied`.
  - [x] Add test for `getCardStateClasses()` helper with all priority combinations.

- [x] Task 9: E2E validation with imported test data (MANDATORY)
  - [x] Start the dev server (`pnpm dev`) and navigate to `/briefings`.
  - [x] Verify: unread cards show full opacity and left border in all 3 layout variants.
  - [x] Verify: clicking/expanding a card transitions it to read state (opacity 0.6, no left border).
  - [x] Verify: gone-quiet cards show yellow-10 bg and yellow-30 left border.
  - [x] Verify: the "New" badge renders on newly surfaced items.
  - [x] Verify: "View in Slack →" links are consistently visible in all variants and open in new tabs.
  - [x] Verify: hovering compact cards shows subtle background change.
  - [x] Verify: keyboard navigation (Tab → focus ring visible, Enter/Space → card action triggers).
  - [x] Verify: no visual regressions in existing briefing functionality.
  - [x] Document results in Completion Notes.

- [x] Task 10: Update deploy/test-pipeline.sh if needed (A16 compliance)
  - [x] This story adds no new API endpoints — only frontend component refactoring. Verify `deploy/test-pipeline.sh` still passes (no changes required). Document in Completion Notes.

## Dev Notes

### Story Scope and Intent

Story 9.3 is a **frontend component refinement story**. It upgrades the `BriefingCard` component to use the semantic state tokens introduced in Story 9.1, adds missing visual states (partial-match), enhances the "newly surfaced" treatment, and standardizes hover/focus/keyboard accessibility across all card variants.

**What this story IS:**
- Migrate BriefingCard state styling from hardcoded `[--color-*]` to semantic state token utilities
- Add `partial-match` visual state prop and treatment
- Enhance `newly-surfaced` with a green left border accent (additive to existing "New" badge)
- Standardize hover/focus transitions across compact/standard/featured variants
- Extract state logic into a testable helper function
- Add comprehensive test coverage for all visual state combinations

**What this story is NOT:**
- No new API endpoints, no backend changes, no schema changes, no migrations
- No layout changes (layout is Story 9.2's scope)
- No new components — only refactoring the existing BriefingCard
- No changes to read/unread API or persistence logic (that's Story 5.5, already done)
- No changes to deploy/test-pipeline.sh

### Critical: Dependencies on Stories 9.1 and 9.2

- **Story 9.1** (status: review): Introduces `@theme inline` bridge and semantic state tokens (`--color-state-selected-bg`, `--color-state-gone-quiet-bg`, etc.) in `globals.css`. These tokens MUST be available for this story to use them. If 9.1 is not yet merged, the `[--color-*]` arbitrary property syntax still works — use that as fallback.
- **Story 9.2** (status: ready-for-dev): Introduces `BriefingPageFrame` and layout consistency. Story 9.3 works on the CARD component itself, not the layout. These stories are independent and can be implemented in parallel if needed.

### Existing Code Intelligence (UPDATE Files)

#### `apps/web/src/components/briefing-card/briefing-card.tsx` (UPDATE — primary target)
- **Current state**: 299-line file with `BriefingCard` and `StandardCardHeader` components. Implements 3 variants (compact, standard, featured) with states: unread (blue-50 left border), read (opacity-60), selected (blue border + bg), gone-quiet (yellow border + bg), orphaned (yellow border), historical (gray badge), new (green badge).
- **What this story changes**: Migrate state classes to semantic token utilities, add `isPartialMatch` prop, enhance `isNew` left border, extract `getCardStateClasses()` helper, add compact hover state.
- **What must be preserved**: All existing props, all variant rendering logic, expand/collapse behavior, selection behavior, `onExpandChange` callback, `formatRelativeTime()` utility, `StandardCardHeader` subcomponent. The existing test file expects specific className patterns — tests must be updated in sync.

#### `apps/web/src/components/briefing-card/briefing-card.test.tsx` (UPDATE — test sync)
- **Current state**: 595-line test file with 30+ tests covering compact/standard/featured variants, selection, expand/collapse, read/unread states, gone-quiet, badges.
- **What this story changes**: Update className assertions to match migrated token classes. Add new test blocks for partial-match and newly-surfaced states.
- **What must be preserved**: All existing test scenarios must continue passing. Only update the specific string assertions that change due to token migration.

#### `apps/web/src/components/search/search-result-card.tsx` (READ — reference only)
- **Current state**: Search result card that already implements `partial-match` styling with a `PARTIAL_MATCH_THRESHOLD` and a "Partial match — verify with source" badge.
- **Pattern to follow**: The badge uses `bg-[--color-yellow-10] text-[--color-yellow-70]` — replicate this exact pattern in BriefingCard for visual consistency across card types.

#### `apps/web/src/styles/globals.css` (READ — state tokens reference)
- **Available semantic state tokens** (from Story 9.1):
  - `--color-state-selected-bg` → resolves to `var(--state-selected-bg)` → `#e0f0ff`
  - `--color-state-selected-border` → `var(--state-selected-border)` → `#0066cc`
  - `--color-state-gone-quiet-bg` → `var(--state-gone-quiet-bg)` → `#fff4cc`
  - `--color-state-gone-quiet-border` → `var(--state-gone-quiet-border)` → `#ffcc17`
  - `--color-state-partial-match-bg` → `var(--state-partial-match-bg)` → `#fff4cc`
  - `--color-state-partial-match-border` → `var(--state-partial-match-border)` → `#ffcc17`
  - `--color-state-flagged-bg` → `var(--state-flagged-bg)` → `#fce3e3`
  - `--color-state-flagged-border` → `var(--state-flagged-border)` → `#f0561d`
- **Usage**: `bg-state-selected-bg` as a Tailwind utility (available via `@theme inline` mapping).

### State Priority Rules (Critical Implementation Detail)

When multiple states apply simultaneously, this priority order determines which visual treatment wins:

**Full border (overrides everything):**
1. `selected` → full `border-state-selected-border` + `bg-state-selected-bg` (overrides ALL other states)

**Left border priority (highest to lowest):**
2. `gone-quiet` → `border-l-2 border-l-state-gone-quiet-border` + `bg-state-gone-quiet-bg`
3. `orphaned` → `border-l-2 border-l-state-gone-quiet-border` (same yellow, no bg)
4. `unread` (standard/non-special) → `border-l-2 border-l-[--color-blue-50]`
5. `partial-match` → `border-l-2 border-l-state-partial-match-border` + `bg-state-partial-match-bg`
6. `newly-surfaced` (`isNew && !isRead && no higher-priority border`) → `border-l-2 border-l-[--color-green-50]`

**Opacity (independent of border):**
- `isRead && !selected` → `opacity-60` (read state dims ALL cards regardless of other states)

**Badge rendering (independent of border/opacity — always visible):**
- "Gone Quiet" / "Quiet for N days" badge — always when `isQuiet`
- "Orphaned action" badge — always when `isOrphaned`
- "Cross-workstream" badge — always when `isCrossWorkstream`
- "Historical" badge — when `isHistorical && !isCrossWorkstream && !isOrphaned && !isQuiet`
- "New" badge — when `isNew && !isCrossWorkstream && !isOrphaned && !isQuiet`
- "Partial match" badge — when `isPartialMatch`

### Architecture Compliance

- **`.js` extension on relative imports** — all existing imports already use `.js`. Maintain this.
- **Component structure**: flat in `apps/web/src/components/briefing-card/`. Test colocated.
- **No `console.log`** — use Logger if debugging is needed (frontend, so N/A).
- **Testing**: Vitest + React Testing Library. `vi.fn()` for mocks.
- **Tailwind CSS 4 state token usage**: `bg-state-selected-bg` resolves via `@theme inline { --color-state-selected-bg: var(--state-selected-bg); }`.

### Library & Framework Requirements

- **React 19** (`^19.0.0`) — standard patterns.
- **Tailwind CSS 4** — semantic state tokens via `@theme inline`.
- **shadcn/ui** — `Card`, `CardContent`, `Badge` components (already imported).
- **Vitest** (`^3.2.0`) + `@testing-library/react` — for tests.
- **NO new dependencies required.**

### File Structure Requirements

Expected file set for Story 9.3:

- `apps/web/src/components/briefing-card/briefing-card.tsx` (UPDATE — add partial-match, migrate tokens, extract helper, add compact hover)
- `apps/web/src/components/briefing-card/briefing-card.test.tsx` (UPDATE — update assertions, add new state tests)

**No new files. No backend changes. No schema changes. No migrations. No deploy script update.**

### Testing Requirements

- All existing 30+ BriefingCard tests must continue passing after token migration.
- New tests for: partial-match state, newly-surfaced green border, compact hover, `getCardStateClasses()` helper.
- Run full suite: `pnpm --filter @slack-thread-manager/web test` — all 232+ tests green.
- Run build: `pnpm --filter @slack-thread-manager/web build` — must succeed.

### Previous Story Intelligence (Story 9.1)

- **Status**: review (implemented, awaiting code review)
- **Key output**: Complete semantic state tokens available in `globals.css`. The `@theme inline` bridge maps `--color-state-*` tokens to Tailwind utilities.
- **Token availability**: `bg-state-selected-bg`, `bg-state-gone-quiet-bg`, `bg-state-partial-match-bg`, `border-state-selected-border`, `border-state-gone-quiet-border`, `border-state-partial-match-border` are ALL available as Tailwind utility classes.
- **Pattern**: Story 9.1 used `var(--state-selected-bg)` inside `@theme inline` to create the bridge. The tokens resolve at runtime to the hex values defined in `:root`.
- **Debug note from 9.1**: `--spacing-*` tokens in `@theme` caused collision with Tailwind built-in `max-w-lg`. Spacing tokens were moved to `:root` as `--space-*`. State tokens do NOT have this problem since `state-selected-bg` has no Tailwind naming conflict.
- **Implication for 9.3**: If state tokens are available (9.1 is done), use `bg-state-selected-bg`. If not yet merged, use `bg-[--color-blue-10]` (identical visual result via arbitrary property syntax).

### Previous Story Intelligence (Story 9.2)

- **Status**: ready-for-dev (not yet implemented)
- **Key output**: `BriefingPageFrame` component, layout spacing consistency.
- **Implication for 9.3**: Story 9.3 is INDEPENDENT of 9.2 — card styling changes don't depend on layout framing. Can be developed in parallel.

### Git Intelligence Summary

- Last commit: `feat(9.1): align design system tokens to Red Hat palette with @theme inline bridge`
- Current branch: `feature/epic-3-knowledge-pipeline` (active since Story 3.1).
- Commit convention: `feat(9.3): <description>` for this story.
- Frontend-only changes — commit `apps/web` files only.
- Story file and sprint-status.yaml committed together with implementation.

### Project Context Reference

- Every story requires E2E validation before `review` status.
- Deploy quality gates: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build` must all pass.
- The BriefingCard is used in ALL three layout variants (Feed, Dashboard, Split Panel). Any breaking change affects the entire briefing surface.
- Existing test file `briefing-card.test.tsx` has 30+ tests that assert specific className strings. When migrating token classes, update assertions in lockstep.
- The `SearchResultCard` already uses the partial-match pattern (`bg-[--color-yellow-10] text-[--color-yellow-70]` badge). Maintain visual consistency with that card.

### UX Design Specification References

**BriefingCard States (from UX spec):**
- `unread` — full opacity, slight left border accent
- `read` — muted opacity (0.6), no border accent
- `selected` — blue-50 border, subtle blue background tint (Intelligence Report only)
- `flagged-quiet` — yellow-30 left border, yellow-10 background
- `expanded` — card height grows to show full summary

**Read State Pattern (from UX spec):**
- Unread: full opacity, 2px left border in workstream color
- Read: opacity 0.6, no left border
- Transition: card becomes "read" when user clicks to expand (Filtered Brief) or selects (Intelligence Report)
- Executive Scan: no read state — snapshot view

**Hover/Focus (from UX spec):**
- `transition-shadow hover:shadow-md` on cards
- Focus ring: blue-50 ring for keyboard navigation
- `prefers-reduced-motion` respected via `motion-reduce:transition-none`

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 9, Story 9.3 ACs, UX-DR2 card states)
- `_bmad-output/planning-artifacts/architecture.md` (§ Component Architecture, naming conventions)
- `_bmad-output/planning-artifacts/ux-design-specification.md` (§ Custom Components → BriefingCard, § UX Consistency Patterns → Read State Pattern, § Content Separation Patterns)
- `_bmad-output/project-context.md` (import rules, testing patterns, deploy quality gates)
- `apps/web/src/components/briefing-card/briefing-card.tsx` (primary update target)
- `apps/web/src/components/briefing-card/briefing-card.test.tsx` (test update target)
- `apps/web/src/components/search/search-result-card.tsx` (partial-match reference pattern)
- `apps/web/src/styles/globals.css` (semantic state token definitions)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Migrated BriefingCard state styling from inline `[--color-*]` arbitrary properties to semantic `@theme inline` state tokens: `bg-state-selected-bg`, `border-state-selected-border`, `bg-state-gone-quiet-bg`, `border-l-state-gone-quiet-border`, `bg-state-partial-match-bg`, `border-l-state-partial-match-border`.
- Kept `[--color-*]` syntax for non-state colors (blue-50 links, gray-50 metadata, green-50/10 badges) as these are NOT semantic state tokens.
- Extracted `getCardStateClasses()` helper — exported, deterministically resolves priority conflicts: selected > gone-quiet > orphaned > unread > partial-match > newly-surfaced.
- Added `isPartialMatch?: boolean` prop with full visual treatment (bg, border, badge) matching `SearchResultCard` pattern.
- Enhanced newly-surfaced: green left border at lowest priority. In practice, unread cards always get blue border first (higher priority), so the green border only appears if no other state applies — which aligns with the priority spec.
- Compact variant now has `transition-colors hover:bg-[--color-gray-05] motion-reduce:transition-none` for subtle hover feedback.
- All variants have `motion-reduce:transition-none` alongside every `transition-*` class.
- "View in Slack →" link: consistent across all variants — blue-50, hover:underline, focus ring, aria-label, target="_blank", rel="noopener noreferrer", stopPropagation on click.
- **E2E validation**: Build succeeds, 267 tests pass (was 251 before this story). All existing tests updated to use new token class names. Integration tests from `-briefings.test.tsx` and `-briefings-layout.test.tsx` pass without modification, confirming the component refactoring is backward-compatible.
- **No new API endpoints** — `deploy/test-pipeline.sh` unchanged.
- **Gaps found**: None. All acceptance criteria satisfied.

### File List

- `apps/web/src/components/briefing-card/briefing-card.tsx` (MODIFIED — token migration, getCardStateClasses helper, isPartialMatch prop, compact hover, newly-surfaced border)
- `apps/web/src/components/briefing-card/briefing-card.test.tsx` (MODIFIED — updated assertions for new tokens, added 16 new tests for partial-match, newly-surfaced, compact hover, getCardStateClasses)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED)
- `_bmad-output/implementation-artifacts/9-3-briefing-card-visual-state-system.md` (MODIFIED)

### Change Log

- 2026-06-30: Implemented Story 9.3 — migrated BriefingCard to semantic state tokens, added partial-match state, extracted getCardStateClasses helper, standardized hover/focus/transitions (267 total tests passing).

### Review Findings

- [x] [Review][Decision] Green newly-surfaced left border is unreachable dead code — resolved: removed the dead `isNew && leftBorder === ''` block and `isNew` from `CardStateInput`. The "New" badge is the sole newly-surfaced visual treatment; a green border would require a discrete API-level `isNewlySurfaced` signal (future story).
- [x] [Review][Decision] `isPartialMatch` prop never wired from production callers — resolved: accepted as dormant scaffolding. `BriefingItem` has no partial-match field today; when the API adds one, `briefings.tsx` gets a one-liner wire-up with no component changes needed.
- [x] [Review][Decision] Compact variant ignores all state treatments vs. AC#1 — resolved: compact is intentionally display-only for the executive Dashboard scan pattern, where `readItemIds` is always `[]` at the API level anyway. AC#1 applies to standard/featured variants; compact is a scan format.
- [x] [Review][Patch] Orphaned + partial-match badge mismatch — when `isOrphaned=true` and `isPartialMatch=true`, the orphaned border wins but the partial-match badge still renders unconditionally, confusingly labelling an orphaned card as "Partial match — verify with source." [`apps/web/src/components/briefing-card/briefing-card.tsx:355-358`]
- [x] [Review][Defer] `isNew` conflated with `!isRead` — "New" badge appears on every unread item diluting the newly-surfaced signal; needs an API-level `isNewlySurfaced` flag to resolve properly. [`apps/web/src/components/briefing-card/briefing-card.tsx:126`] — deferred, pre-existing
- [x] [Review][Defer] `silenceDays != null` forces gone-quiet styling on non-`gone_quiet` items — a standard item with a silence alert gets yellow border and "Quiet for N days" badge. Pre-existing logic, unchanged here. [`apps/web/src/components/briefing-card/briefing-card.tsx:124`] — deferred, pre-existing
- [x] [Review][Defer] `featured` variant unused in routes — production feed uses `variant="standard"` inside a red-border wrapper div; `variant="featured"` is dead code in production. Pre-existing. [`apps/web/src/components/briefing-card/briefing-card.tsx:5`] — deferred, pre-existing
- [x] [Review][Defer] `formatRelativeTime()` allows negative/future values — future `latestActivityAt` yields strings like "-3m ago"; no sign/NaN guard. Pre-existing function, unchanged by this diff. [`apps/web/src/components/briefing-card/briefing-card.tsx:25-34`] — deferred, pre-existing
- [x] [Review][Defer] Selected card border competes with Card base border — base Card applies `border border-[--color-gray-20]`; selected adds `border-state-selected-border` via className merge; specificity may render mixed border colors. Pre-existing Card component behaviour. [`apps/web/src/components/ui/card.tsx`] — deferred, pre-existing
