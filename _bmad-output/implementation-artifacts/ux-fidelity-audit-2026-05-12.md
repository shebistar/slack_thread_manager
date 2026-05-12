# UX Fidelity Audit — Post-Epic 5

> Reference: `_bmad-output/planning-artifacts/ux-design-directions.html`
> Audited: 2026-05-12 | Layouts: Dashboard (D2), News Feed (D1), Split Panel (D6)

---

## Audit Summary

| Layout | Fidelity | Gaps |
|--------|----------|------|
| Dashboard (Executive Scan) | **60%** | Missing dark header, health dots, silence monitor |
| News Feed (Filtered Brief) | **65%** | Missing header bar, featured card treatment, "New" badge |
| Split Panel (Intelligence Report) | **75%** | Missing topbar with accent, side panel section structure |
| Cross-cutting | **70%** | Workstream labels are filled badges (should be text), font weights off |

---

## Dashboard Layout — Direction 2 (Executive Scan)

### Design Reference (`d2-*` classes in HTML)

| Element | Design Spec | Implemented | Gap? |
|---------|-------------|-------------|------|
| **Header** | Dark bg (`gray-95`), white text, 4px red accent bar, "Briefing Dashboard" title, date/time right-aligned | **Missing entirely** — layout starts at StatsBar | **YES** |
| **Stats bar numbers** | `font-weight: 700`, `font-size: 32px`, `Red Hat Display` | `font-medium` (500), 32px, `Red Hat Display` | **YES** — weight too light |
| **Stats bar "Gone Quiet"** | Plain colored number like others (`color: var(--rh-yellow-70)`) | Inline `bg-[--color-yellow-30] rounded px-2` background on the number | **YES** — should not have bg |
| **Workstream rows** | 8px colored dot (green=active, yellow=quiet) + name + "N threads · M messages" | Name + "N threads" only. No dot, no message count | **YES** |
| **Panel headers** | `background: gray-10`, `border-bottom: gray-20`, `font-size: 13px`, flex between title and "Last 24h" | Shadcn CardHeader (no bg, no border-bottom, no timeframe label) | **YES** — missing bg and label |
| **Silence Monitor** | Dedicated right-column panel with `yellow-10` header bg, quiet items with `yellow-30` left border + `yellow-10` bg | **Missing entirely** | **YES** |
| **Key Decisions** | Compact row: decision text + workstream badge on right | Compact BriefingCard — close enough, acceptable | OK |

### Dashboard Remediation Punch List

- [ ] **D-1** Add dark header bar with red accent, title, date/time meta
- [ ] **D-2** Stats bar: change `font-medium` → `font-bold` (700)
- [ ] **D-3** Stats bar: remove background from "Gone Quiet" number, use `text-[--color-yellow-70]` instead (matching design: `color:var(--rh-yellow-70)`)
- [ ] **D-4** Workstream rows: add 8px colored health dot (green for active, yellow for quiet)
- [ ] **D-5** Workstream rows: add message count (requires API data or placeholder)
- [ ] **D-6** Panel headers: add `bg-[--color-gray-10]` background and bottom border
- [ ] **D-7** Add "Silence Monitor" panel for `gone_quiet` items (right column or below)

---

## News Feed Layout — Direction 1 (Filtered Brief)

### Design Reference (`d1-*` classes in HTML)

| Element | Design Spec | Implemented | Gap? |
|---------|-------------|-------------|------|
| **Header** | White bg, `border-bottom: 3px solid red-50`, "Daily Briefing" h3, meta text (date, threads, workstreams) | **Missing** — uses inline FreshnessTimestamp text only | **YES** |
| **Filter bar** | `gray-10` bg, `border-bottom: gray-20`, pill buttons `rounded-full` | WorkstreamFilter pills — correct shape + colors. Missing bg row wrapper | **Partial** |
| **Card grid** | `grid-template-columns: 1fr 1fr`, 16px gap | `grid grid-cols-1 xl:grid-cols-2 gap-4` — correct | OK |
| **Featured card** | `grid-column: 1 / -1` (full width), `border-left: 3px solid red-50`, internal 2-column grid with "Related Decisions" | Same BriefingCard as standard, just in a `w-full` div. No red left border, no 2-column internal layout | **YES** |
| **Workstream label** | Uppercase text, `color: blue-50`, `font-size: 11px`, `letter-spacing: .5px`, no background | Filled `Badge` with `bg-blue-50 text-white` | **YES** |
| **"New" badge** | `bg: green-10`, `color: green-50`, "New" text | **Missing entirely** | **YES** |
| **"Gone Quiet" badge** | `bg: yellow-10`, `color: yellow-70` | Present: `bg-yellow-30 text-gray-95` — close but wrong yellow shade | **Partial** |
| **Card footer** | Flex row: participants · messages · time ago · "View in Slack →" | Present: participants, messages, time, Slack link — correctly structured | OK |

### News Feed Remediation Punch List

- [ ] **NF-1** Add header bar: white bg, 3px red bottom border, "Daily Briefing" title, meta line
- [ ] **NF-2** Wrap WorkstreamFilter in gray-10 bg row with bottom border
- [ ] **NF-3** Featured card: full-width span, 3px red left border, optionally 2-column internal layout
- [ ] **NF-4** Workstream labels: change from filled badge to uppercase text (`text-[--color-blue-50] uppercase text-[11px] tracking-wide font-medium`)
- [ ] **NF-5** Add "New" badge for unread items: `bg-[--color-green-10] text-[--color-green-50]`
- [ ] **NF-6** "Gone Quiet" badge: change to `bg-[--color-yellow-10] text-[--color-yellow-70]` (matching design)

---

## Split Panel Layout — Direction 6 (Intelligence Report)

### Design Reference (`d6-*` classes in HTML)

| Element | Design Spec | Implemented | Gap? |
|---------|-------------|-------------|------|
| **Top bar** | White bg, 2px red accent bar (absolute top), "Daily Briefing — Intelligence Report" title, role badge (teal-10/teal-50) on right | **Missing** — uses inline FreshnessTimestamp | **YES** |
| **Split layout** | `grid-template-columns: 1fr 360px` | `flex-col xl:flex-row` with `xl:w-[360px]` — functionally equivalent | OK |
| **Main cards** | Border, rounded, selected = `border-color: blue-50` + `bg: rgba(0,102,204,.03)` | Selected = `border-[--color-blue-50] bg-[--color-blue-10]` — close match | OK |
| **Workstream label on cards** | Uppercase text, `color: blue-50`, `font-size: 11px`, `letter-spacing: .5px` | Filled `Badge` with `bg-blue-50 text-white` | **YES** |
| **"Gone Quiet" card** | `border-left: 3px solid yellow-30` + workstream text `color: yellow-70` | `border-l-2 border-l-yellow-30 bg-yellow-10` — correct pattern | OK |
| **Card meta row** | `font-size: 12px`, `color: gray-30`, flex with Slack link auto-margin-left | `text-xs text-gray-50` — slightly different gray shade | **Minor** |
| **Side panel background** | `bg: blue-10` | `bg-[--color-blue-10]` — correct | OK |
| **Side panel header** | "AI-Assisted" badge (`bg: teal-50`, `color: white`, `font-size: 10px`) + "Related Context" h4 | Missing — just placeholder text | **YES** |
| **Side panel sections** | h5 headers (uppercase, letter-spacing, gray-50), white link cards with hover shadow | Missing — just "coming soon" text | **Partial** (expected — Epic 8 content, but frame should exist) |

### Split Panel Remediation Punch List

- [ ] **SP-1** Add top bar: white bg, 2px red accent at top, "Intelligence Report" title, role badge
- [ ] **SP-2** Workstream labels: change from filled badge to uppercase text (same as NF-4)
- [ ] **SP-3** Side panel header: add "AI-Assisted" badge (teal-50 bg, white text) + "Related Context" h4
- [ ] **SP-4** Side panel: add placeholder section structure with h5 headers (even if content is "coming soon")

---

## Cross-Cutting Gaps

| ID | Gap | Scope | Fix |
|----|-----|-------|-----|
| **X-1** | Workstream labels everywhere use filled blue badges instead of uppercase text | All 3 layouts | Change `StandardCardHeader` and compact card to use text-only label |
| **X-2** | Stats bar font-weight 500 instead of 700 | Dashboard | Fix in StatsBar component |
| **X-3** | Missing per-layout header bars (each design direction has a distinct styled header) | All 3 layouts | Add layout-specific header components |
| **X-4** | FreshnessTimestamp is unstyled inline text, not integrated into a header | All 3 layouts | Integrate into layout headers |

---

## Priority Order for Remediation

1. **X-1 + NF-4 + SP-2**: Workstream labels → uppercase text (affects all cards)
2. **X-3 + D-1 + NF-1 + SP-1**: Add per-layout header bars
3. **D-2 + D-3 + X-2**: Stats bar fixes (font weight, Gone Quiet color)
4. **D-4 + D-5**: Workstream health dots + message count
5. **NF-3**: Featured card treatment
6. **NF-5 + NF-6**: Badge fixes (New, Gone Quiet colors)
7. **D-7**: Silence Monitor panel
8. **SP-3 + SP-4**: Side panel structure
9. **NF-2**: Filter bar wrapper styling
