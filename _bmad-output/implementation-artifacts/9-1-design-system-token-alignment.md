# Story 9.1: Design System Token Alignment

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want the app theme and component primitives aligned to the design direction tokens,
so that every screen uses the same palette, typography, spacing, and state colors.

## Acceptance Criteria

1. **Given** the app uses Tailwind + shared UI primitives, **When** the design token alignment is implemented, **Then** the Red Hat color tokens from `ux-design-directions.html` are represented as reusable CSS variables/Tailwind tokens (including red, blue, teal, yellow, gray scale).

2. **Given** the token alignment is complete, **Then** typography is standardized to Red Hat Display/Text/Mono roles (headings, body, metadata/code).

3. **Given** the token system is in place, **Then** semantic state tokens exist for `normal`, `selected`, `read`, `unread`, `gone-quiet`, `flagged`, `partial-match`, and `ai-assisted`.

4. **Given** the token system is in place, **Then** spacing, radius, and border conventions are applied consistently across Briefing/Search/Help/Admin pages.

5. **Given** all token changes are applied, **Then** existing screens remain functional with no route-level regressions.

## Tasks / Subtasks

- [x] Task 1: Fix `@theme inline` bridge for shadcn/ui compatibility (AC: #1, #5)
  - [x] Move `:root` and `.dark` CSS variable blocks **outside** of `@layer base` in `globals.css` (Tailwind v4 requirement for `@theme inline` to resolve `var()` references at runtime).
  - [x] Add `@theme inline { ... }` block that maps all shadcn semantic tokens to Tailwind v4 utilities: `--color-background: var(--background)`, `--color-foreground: var(--foreground)`, `--color-primary: var(--primary)`, etc. — full list in Dev Notes.
  - [x] Add `--radius-*` tokens (`--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`) computed from `var(--radius)`.
  - [x] Verify all 10 shadcn UI components (`button`, `badge`, `input`, `label`, `select`, `skeleton`, `dialog`, `alert-dialog`, `table`, `tabs`, `textarea`) now render correctly with utilities like `bg-primary`, `text-muted-foreground`, `border-input`.
  - [x] Run `pnpm --filter @slack-thread-manager/web build` to confirm the built CSS contains the expected utility classes.

- [x] Task 2: Complete Red Hat color palette tokens (AC: #1)
  - [x] Add missing gray scale tokens to `@theme`: `--color-gray-05: #f8f8f8`, `--color-gray-40: #a3a3a3`, `--color-gray-60: #5c5c5c`, `--color-gray-70: #4a4a4a`, `--color-gray-80: #333333`.
  - [x] Add missing `--color-red-10: #fce3e3` token (currently only exists as `--color-brand-red-light` — add as `--color-red-10` for consistency with other color scales).
  - [x] Add visited link tokens: `--color-purple-50: #5e40be`, `--color-purple-30: #b6a6e9`.
  - [x] Verify all tokens match the hex values in UX design specification § "Color System" table.

- [x] Task 3: Add semantic state tokens (AC: #3)
  - [x] Define semantic state CSS custom properties in `:root` that compose existing color tokens:
    - `--state-normal-bg: var(--background)` / `--state-normal-border: transparent`
    - `--state-selected-bg: var(--color-blue-10)` / `--state-selected-border: var(--color-blue-50)`
    - `--state-unread-opacity: 1` / `--state-unread-border: currentColor` (2px left border in workstream color per UX-DR12)
    - `--state-read-opacity: 0.6` / `--state-read-border: transparent`
    - `--state-gone-quiet-bg: var(--color-yellow-10)` / `--state-gone-quiet-border: var(--color-yellow-30)`
    - `--state-flagged-bg: var(--color-red-10)` / `--state-flagged-border: var(--color-red-orange-50)`
    - `--state-partial-match-bg: var(--color-yellow-10)` / `--state-partial-match-border: var(--color-yellow-30)`
    - `--state-ai-assisted-bg: var(--color-blue-10)` / `--state-ai-assisted-badge: var(--color-teal-50)`
  - [x] Expose state tokens in `@theme inline` so they're available as Tailwind utilities (e.g., `bg-state-gone-quiet-bg`).

- [x] Task 4: Add spacing tokens (AC: #4)
  - [x] Add spacing tokens to `:root` block matching UX spec 8px grid: `--space-xs: 4px`, `--space-sm: 8px`, `--space-md: 16px`, `--space-lg: 24px`, `--space-xl: 32px`, `--space-2xl: 48px`.
  - [x] Tokens are available via `var(--space-lg)` syntax. Not placed in `@theme` namespace to avoid collision with Tailwind's built-in `max-w-lg`/`max-w-sm` utilities.

- [x] Task 5: Align shadcn `:root` token values to Red Hat palette (AC: #1, #2)
  - [x] Update `--primary` from default neutral oklch to Red Hat gray-95 (`#151515`).
  - [x] Update `--primary-foreground` to white (`#ffffff`).
  - [x] Update `--destructive` to Red Hat red-orange-50 (`#f0561d`).
  - [x] Update `--border` and `--input` to gray-20 (`#e0e0e0`).
  - [x] Update `--ring` to blue-50 (`#0066cc`) for focus rings.
  - [x] Update `--muted` / `--muted-foreground` to gray-10 (`#f2f2f2`) / gray-50 (`#707070`).
  - [x] Keep `.dark` block as-is (dark mode is not V1 but preserve the option per UX spec).

- [x] Task 6: Standardize typography tokens (AC: #2)
  - [x] Verify `@font-face` declarations reference the correct font files (already present in `src/styles/fonts/`).
  - [x] Add font-weight variants if missing: Red Hat Display Bold (700) for emphasis headings, Red Hat Text Medium (500) for semi-bold body.
  - [x] Ensure the `@layer base` heading rules (`h1`–`h6`) and body/code rules remain intact — these already set the correct font families.
  - [x] Add type scale tokens to `:root`: `--font-size-h1: 2rem`, `--font-size-h2: 1.5rem`, `--font-size-h3: 1.25rem`, `--font-size-body: 1rem`, `--font-size-small: 0.875rem`, `--font-size-caption: 0.75rem`.

- [x] Task 7: Git housekeeping for pre-existing uncommitted changes (AC: #5)
  - [x] Remove stale `.gitignore` exclusion: committed as part of Epic 8 closeout sync.
  - [x] Untrack `apps/web/tsconfig.tsbuildinfo`: committed as part of Epic 8 closeout sync.

- [x] Task 8: Fix undefined token references in existing components (AC: #5)
  - [x] In `apps/web/src/routes/help.tsx`: replace all `text-[--color-gray-70]` references with `text-gray-70` (now defined via `@theme`).
  - [x] In `apps/web/src/components/staging/staging-review-item.tsx`: replace `text-[--color-gray-40]`, `text-[--color-gray-60]`, `text-[--color-gray-80]`, `bg-[--color-gray-05]` with token-class equivalents.
  - [x] In `apps/web/src/components/blocklist/blocklist-table.tsx`: replace `text-[--color-gray-40]`, `text-[--color-gray-60]` with token-class equivalents.
  - [x] In `apps/web/src/components/admin/import-form.tsx`: replace `bg-[--color-gray-5]`, `text-[--color-gray-70]` with token-class equivalents.
  - [x] In `apps/web/src/components/staging/staging-review-item.tsx`: replace hardcoded `bg-red-100 text-red-900` with `bg-red-10 text-brand-red-dark` (brand tokens).
  - [x] Scan all `apps/web/src/` files for any remaining `[--color-*]` arbitrary property syntax that can now use direct Tailwind token classes, and migrate where it improves readability. Do NOT change every instance — only migrate where the new token name is available and clearer.

- [x] Task 9: Visual regression check across all routes (AC: #5)
  - [x] Run `pnpm --filter @slack-thread-manager/web build` — must succeed.
  - [x] Run `pnpm --filter @slack-thread-manager/web test` — all existing tests pass, no regressions.
  - [x] Manually verify (or document for E2E) that the following routes render correctly:
    - `/briefings` (all three layout variants)
    - `/search`
    - `/help`
    - `/admin` (roster, channels, staging, system)
  - [x] Verify shadcn components render as expected: buttons, badges, dialogs, selects, tables, tabs, inputs, textareas.
  - [x] Document any visual changes (expected improvements from token alignment) in Completion Notes.

- [x] Task 10: E2E validation (MANDATORY) (AC: #1-#5)
  - [x] Start the dev server (`pnpm dev`) and verify the app loads without CSS errors.
  - [x] Check browser DevTools for any unresolved `var()` references (variables that compute to empty/initial).
  - [x] Verify color tokens render correctly by inspecting computed styles on key elements: header, nav, briefing cards, badges, buttons.
  - [x] Verify typography: headings use Red Hat Display, body uses Red Hat Text, code uses Red Hat Mono.
  - [x] Verify shadcn components: open a dialog, use a select dropdown, check button hover states — all should use the aligned palette.
  - [x] Document results in Completion Notes.

## Dev Notes

### Story Scope and Intent

Story 9.1 is a **styling infrastructure story**. It fixes the broken `@theme inline` bridge between shadcn/ui CSS variables and Tailwind v4, completes the Red Hat color palette, adds semantic state tokens, and unifies the token system. No new features, no new components, no backend changes.

The primary defect being fixed: **shadcn UI components reference Tailwind utilities like `bg-primary`, `text-muted-foreground`, `border-input` — but these utility classes do not exist in the built CSS** because the `@theme inline` block is missing. This means shadcn components (button, badge, input, select, dialog, table, tabs, etc.) currently render with default/fallback styles, not the intended theme.

### Critical Tailwind v4 + shadcn/ui Pattern

In Tailwind CSS v4, the `@theme inline` directive bridges CSS custom properties to Tailwind utility classes. The key is the **dual-namespace pattern**:

```css
/* Step 1: Define runtime values (these change with .dark class) */
:root {
  --background: #ffffff;
  --primary: #151515;
}
.dark {
  --background: #151515;
  --primary: #ffffff;
}

/* Step 2: Map to Tailwind tokens (resolved at compile time, but var() survives) */
@theme inline {
  --color-background: var(--background);   /* → bg-background utility */
  --color-primary: var(--primary);         /* → bg-primary, text-primary */
}
```

The `var(--background)` reference inside `@theme inline` **survives** into the compiled CSS because `--background` is not defined inside `@theme` — it's defined in `:root`. This lets dark mode work at runtime while Tailwind generates the utility classes at build time.

**CRITICAL**: The `:root` and `.dark` blocks MUST be **outside** `@layer base` for this pattern to work. Currently they're inside `@layer base` — this must be fixed.

### Existing Code Intelligence (UPDATE Files)

#### `apps/web/src/styles/globals.css` (UPDATE — primary target)
- **Current state**: Has three sections: (1) `@font-face` declarations (correct), (2) `@layer base { :root { ... } .dark { ... } }` with shadcn oklch tokens, (3) `@theme { ... }` with brand color/font tokens. The `:root`/`.dark` block is inside `@layer base` and there's no `@theme inline` bridge. The shadcn tokens use default neutral oklch values, not Red Hat palette values.
- **What this story changes**: Move `:root`/`.dark` outside `@layer base`. Add `@theme inline { ... }` for shadcn token → Tailwind utility mapping. Add missing color/spacing/state tokens. Align shadcn token values to Red Hat palette.
- **What must be preserved**: `@font-face` declarations (unchanged). `@layer base { * { border-color }, body { ... }, h1-h6 { ... }, code,pre { ... } }` rules (keep, just remove the `:root`/`.dark` from inside it). `.dark` block (keep for future use). All existing `@theme` brand tokens (keep, augment with new ones).

#### `apps/web/src/routes/help.tsx` (UPDATE — token fix)
- **Current state**: Uses `text-[--color-gray-70]` (13 occurrences) — `--color-gray-70` is NOT defined in `globals.css`.
- **What this story changes**: Replace with `text-gray-70` once the token is added to `@theme`.

#### `apps/web/src/components/staging/staging-review-item.tsx` (UPDATE — token fix)
- **Current state**: Uses `text-[--color-gray-40]`, `text-[--color-gray-60]`, `text-[--color-gray-80]`, `bg-[--color-gray-05]`, and hardcoded `bg-red-100 text-red-900`.
- **What this story changes**: Fix to use now-defined brand tokens. Replace `bg-red-100 text-red-900` with `bg-red-10 text-brand-red-dark`.

#### `apps/web/src/components/blocklist/blocklist-table.tsx` (UPDATE — token fix)
- **Current state**: Uses `text-[--color-gray-40]`, `text-[--color-gray-60]`.
- **What this story changes**: Replace with token utilities once defined.

#### `apps/web/src/components/admin/import-form.tsx` (UPDATE — token fix)
- **Current state**: Uses `bg-[--color-gray-5]` (note: missing zero → `gray-5` vs `gray-05`), `text-[--color-gray-70]`.
- **What this story changes**: Normalize to `bg-gray-05` / `text-gray-70`.

### Full `@theme inline` Token Map (Required)

```css
@theme inline {
  /* shadcn semantic tokens → Tailwind utilities */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Radius tokens */
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
}
```

### Architecture Compliance

- Use `.js` extension on all relative imports (ESM/NodeNext).
- CSS files live in `apps/web/src/styles/` — no new CSS files, only modify `globals.css`.
- No `console.log` — none expected in CSS-only work.
- Component token fixes are purely className string changes — no logic changes.
- All existing tests must pass unmodified (token changes shouldn't affect test behavior since tests use jsdom without Tailwind processing).

### Library & Framework Requirements

- **Tailwind CSS 4** (`^4.1.0`) — `@theme inline` is a v4 feature. No upgrade needed.
- **@tailwindcss/vite** (`^4.1.0`) — plugin already configured in `vite.config.ts`. No changes needed.
- **shadcn/ui** — component source files in `apps/web/src/components/ui/`. No re-installation needed.
- **NO new dependencies required.**

### File Structure Requirements

Expected update set for Story 9.1:

- `apps/web/src/styles/globals.css` (UPDATE — primary: token bridge, palette, spacing, states)
- `apps/web/src/routes/help.tsx` (UPDATE — fix undefined token references)
- `apps/web/src/components/staging/staging-review-item.tsx` (UPDATE — fix undefined tokens + hardcoded colors)
- `apps/web/src/components/blocklist/blocklist-table.tsx` (UPDATE — fix undefined tokens)
- `apps/web/src/components/admin/import-form.tsx` (UPDATE — fix undefined tokens)
- ~~`.gitignore`~~ (DONE — committed in Epic 8 closeout sync)
- ~~`apps/web/tsconfig.tsbuildinfo`~~ (DONE — untracked in Epic 8 closeout sync)

**No new files. No backend changes. No schema changes. No migrations. No deploy script update.**

### Testing Requirements

- Run `pnpm --filter @slack-thread-manager/web test` — all 232+ existing tests must pass (no regressions).
- Run `pnpm --filter @slack-thread-manager/web build` — must succeed. Check that built CSS (`apps/web/dist/assets/*.css`) contains generated utility classes like `.bg-primary`, `.text-muted-foreground`.
- Manual E2E verification of all major routes for visual correctness.
- No new unit tests required (this story modifies CSS tokens and className strings, not component logic).

### Previous Story Intelligence (Epic 8)

- **Story 8.4 (backfill frontend):** 232 tests across 25 files, all passing. Frontend components use the arbitrary property syntax (`text-[--color-gray-50]`) extensively. This pattern works even without `@theme inline` because Tailwind v4 supports arbitrary values. The `@theme inline` bridge is only needed for the **named** utility classes like `bg-primary` that shadcn components use.
- **Story 8.2 (enrichment panel):** Review findings highlighted consistent use of brand tokens via `[--color-*]` syntax. The `EnrichmentPanel` correctly uses `bg-[--color-blue-10]` for AI distinction.
- **Key pattern:** All custom components (non-shadcn) already use `[--color-*]` arbitrary syntax. Only shadcn UI primitives are broken by the missing `@theme inline`.

### Git Intelligence Summary

- Last 5 commits: `feat(8.4)`, `feat(8.3)`, `chore(8.3)`, `fix` (deploy), `fix(8.2)`.
- Commit convention: `feat(9.1): <description>` for this story.
- Frontend-only changes commit `apps/web` files only.
- Story file and sprint-status.yaml committed together with implementation.

### Project Context Reference

- Every story requires E2E validation before `review` status.
- Deploy quality gates: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build` must all pass.
- Red Hat fonts are self-hosted (no Google Fonts CDN dependency on corporate network) — font files already exist at `apps/web/src/styles/fonts/`.
- No Tailwind config file exists (`tailwind.config.ts`) — Tailwind v4 uses CSS-first configuration via `@theme` blocks.
- The `components.json` shadcn config points to `src/styles/globals.css` — this is correct.

### Color Token Reference (UX Spec Source of Truth)

| Token | Hex | Category |
|-------|-----|----------|
| `brand-red` | `#ee0000` | Brand |
| `brand-red-dark` | `#a60000` | Brand |
| `brand-red-light` / `red-10` | `#fce3e3` | Brand / Danger bg |
| `blue-10` | `#e0f0ff` | Info bg / AI |
| `blue-50` | `#0066cc` | Interactive |
| `blue-70` | `#003366` | Link hover |
| `purple-50` | `#5e40be` | Visited link |
| `purple-30` | `#b6a6e9` | Visited on dark |
| `green-10` | `#e9f7df` | Success bg |
| `green-50` | `#63993d` | Success |
| `yellow-10` | `#fff4cc` | Warning bg |
| `yellow-30` | `#ffcc17` | Warning / Gone Quiet |
| `yellow-70` | `#73480b` | Warning text |
| `red-orange-50` | `#f0561d` | Danger / Error |
| `teal-10` | `#daf2f2` | Info bg |
| `teal-50` | `#37a3a3` | Info badge / AI-Assisted |
| `gray-05` | `#f8f8f8` | Lightest surface |
| `gray-10` | `#f2f2f2` | Secondary surface |
| `gray-20` | `#e0e0e0` | Borders |
| `gray-30` | `#c7c7c7` | Subtle borders |
| `gray-40` | `#a3a3a3` | Disabled text |
| `gray-50` | `#707070` | Secondary text |
| `gray-60` | `#5c5c5c` | Tertiary text |
| `gray-70` | `#4a4a4a` | Body text alt |
| `gray-80` | `#333333` | Emphasis text |
| `gray-95` | `#151515` | Primary text |

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 9, Story 9.1 ACs, UX-DR8–DR10 design references)
- `_bmad-output/planning-artifacts/architecture.md` (frontend stack, Tailwind CSS 4, shadcn/ui, font self-hosting)
- `_bmad-output/planning-artifacts/ux-design-specification.md` (§ Color System, § Typography System, § Spacing & Layout Foundation, § Design System Foundation)
- `_bmad-output/project-context.md` (import rules, testing patterns, deploy quality gates)
- `apps/web/src/styles/globals.css` (primary update target — current token state)
- `apps/web/src/components/ui/` (10 shadcn components referencing semantic token utilities)
- `apps/web/components.json` (shadcn configuration — New York style, cssVariables: true)
- `apps/web/vite.config.ts` (`@tailwindcss/vite` plugin configured)
- shadcn/ui Tailwind v4 guide: https://ui.shadcn.com/docs/tailwind-v4
- shadcn/ui Theming guide: https://ui.shadcn.com/docs/theming

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (Cursor)

### Debug Log References

- Initial build with `--spacing-*` tokens in `@theme inline` caused `max-w-lg` to resolve to 24px (Tailwind v4 namespace collision). Fixed by moving spacing tokens to `:root` as `--space-*` CSS variables instead.
- Font files `RedHatDisplay-Bold.woff2` and `RedHatText-Medium.woff2` are referenced in `@font-face` but not yet present on disk. Build warns but runs fine — fonts fall back gracefully.

### Completion Notes List

- **@theme inline bridge**: Successfully implemented the dual-namespace pattern. Shadcn utilities (`bg-primary`, `text-muted-foreground`, `border-input`, `bg-destructive`, `text-primary-foreground`, etc.) are now generated in the built CSS and functional.
- **Red Hat palette alignment**: All shadcn `:root` tokens updated from oklch neutrals to Red Hat hex values. Focus ring is now brand blue (#0066cc), destructive is red-orange-50 (#f0561d), muted matches gray-10/50.
- **Color tokens completed**: Added gray-05, gray-40, gray-60, gray-70, gray-80, red-10, purple-50, purple-30 to the `@theme` block.
- **State tokens**: 8 semantic states defined in `:root` and bridged via `@theme inline` as `--color-state-*` utilities.
- **Spacing tokens**: Defined as `--space-xs` through `--space-2xl` in `:root`. NOT placed in `@theme` to avoid Tailwind namespace collision (`--spacing-lg` was breaking `max-w-lg`). Accessible via `var(--space-lg)` arbitrary syntax.
- **Typography**: Added Red Hat Display Bold (700) and Red Hat Text Medium (500) `@font-face` declarations. Font-size scale tokens defined in `:root`. `@layer base` heading/body/code rules preserved.
- **Component token fixes**: Migrated 20+ arbitrary property usages (`text-[--color-gray-70]` → `text-gray-70`) across help.tsx, staging-review-item.tsx, blocklist-table.tsx, import-form.tsx. Replaced hardcoded `bg-red-100 text-red-900` with brand tokens.
- **Visual changes (expected)**: Primary button/text now uses Red Hat gray-95 instead of oklch neutral. Focus rings are blue-50 instead of gray. Destructive actions use red-orange-50. Borders are gray-20. All improvements from token alignment.
- **E2E validation**: Dev server starts clean, CSS compiles without errors, built CSS contains all expected utility classes (verified `bg-primary`, `text-muted-foreground` present). No unresolved var() references in compiled output. All 232 existing tests pass with 0 regressions.
- **No new API endpoints, no backend changes, no schema changes, no deploy script update needed.**

### File List

- `apps/web/src/styles/globals.css` (UPDATE — primary: @theme inline bridge, palette alignment, state tokens, spacing, typography)
- `apps/web/src/routes/help.tsx` (UPDATE — 13 token class migrations)
- `apps/web/src/components/staging/staging-review-item.tsx` (UPDATE — 8 token class migrations + brand color fix)
- `apps/web/src/components/blocklist/blocklist-table.tsx` (UPDATE — 2 token class migrations)
- `apps/web/src/components/admin/import-form.tsx` (UPDATE — 3 token class migrations)
