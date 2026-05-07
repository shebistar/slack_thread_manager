# Story 1.5: Dashboard Shell & Navigation

Status: done

## Story

As a **team member**,
I want a web dashboard with persistent navigation and role-appropriate layout routing,
so that I can access briefings, search, and admin features without confusion.

## Acceptance Criteria

1. **Given** an authenticated user with a known role, **When** they access the dashboard, **Then** the app header displays Red Hat branding, the user's role indicator badge, and a placeholder for briefing freshness timestamp.
2. **Given** any authenticated user, **When** they view the navigation bar, **Then** persistent horizontal navigation shows: Briefing (default active), Search, and Admin (visible only to ADMIN role).
3. **Given** an authenticated user, **When** they navigate to the Briefing route, **Then** an empty-state page loads ("Your first briefing hasn't been generated yet").
4. **Given** an authenticated user, **When** they navigate to the Search route, **Then** an empty-state page loads with a search input placeholder.
5. **Given** an ADMIN user, **When** they navigate to the Admin route, **Then** an admin panel loads with tabs (Roster, Channels, System).
6. **Given** any viewport between 1024px and 1536px+, **When** the layout renders, **Then** it is responsive at the three breakpoints (lg: 1024px, xl: 1280px, 2xl: 1536px).
7. **Given** any page, **When** the layout renders, **Then** all pages use semantic HTML (`<main>`, `<nav>`, `<header>`) with visible focus rings and skip-to-content link.
8. **Given** navigation between routes, **When** the user navigates, **Then** page titles update (e.g., "Daily Briefing — Slack Thread Manager").

## Tasks / Subtasks

- [x] Task 1: Install Shadcn/ui foundation (AC: #1, #7)
  - [x] 1.1: Initialize Shadcn/ui — run `npx shadcn@latest init` in `apps/web` (configure: New York style, CSS variables, `src/components/ui`)
  - [x] 1.2: Add required Shadcn components: `badge`, `button`, `tabs`, `skeleton`
  - [x] 1.3: Verify `components.json` created and Shadcn components render

- [x] Task 2: Self-host Red Hat fonts (AC: #1)
  - [x] 2.1: Download Red Hat Display (Medium 500), Red Hat Text (Regular 400), Red Hat Mono (Regular 400) as `.woff2` files
  - [x] 2.2: Place fonts in `apps/web/src/styles/fonts/`
  - [x] 2.3: Add `@font-face` declarations in `globals.css` and set body font to Red Hat Text, headings to Red Hat Display
  - [x] 2.4: Configure Tailwind font-family theme tokens: `font-display`, `font-text`, `font-mono`

- [x] Task 3: Create AppHeader component (AC: #1)
  - [x] 3.1: Create `apps/web/src/components/layout/app-header.tsx`
  - [x] 3.2: Implement: Red Hat branding (brand-red accent bar or logo area), user's role indicator badge (using Shadcn Badge), placeholder text for briefing freshness timestamp
  - [x] 3.3: Use semantic `<header>` element
  - [x] 3.4: Create `apps/web/src/components/layout/app-header.test.tsx` — test: renders role badge, renders freshness placeholder

- [x] Task 4: Create NavBar component (AC: #2)
  - [x] 4.1: Create `apps/web/src/components/layout/nav-bar.tsx`
  - [x] 4.2: Implement persistent horizontal navigation with three items: Briefing, Search, Admin
  - [x] 4.3: Active state: white text with red-50 underline; inactive: gray-30 text
  - [x] 4.4: Admin nav item conditionally rendered: visible only when `isAdmin(user)` returns true (from `role-layout.ts`)
  - [x] 4.5: Use TanStack Router `<Link>` for navigation, `useRouterState()` for active detection
  - [x] 4.6: Use semantic `<nav>` element with `aria-label="Main navigation"`
  - [x] 4.7: Create `apps/web/src/components/layout/nav-bar.test.tsx` — test: renders 3 items for admin, 2 items for non-admin, active state applied correctly

- [x] Task 5: Create skip-to-content link (AC: #7)
  - [x] 5.1: Add visually hidden skip link as first focusable element in root layout: `<a href="#main-content" class="sr-only focus:not-sr-only ...">Skip to content</a>`
  - [x] 5.2: Add `id="main-content"` to the `<main>` element wrapping page content

- [x] Task 6: Update `__root.tsx` with layout shell (AC: #1, #2, #7)
  - [x] 6.1: Update `apps/web/src/routes/__root.tsx` — wrap `<Outlet>` with layout structure: skip-to-content → AppHeader → NavBar → `<main id="main-content">` → Outlet
  - [x] 6.2: Apply responsive max-width container: `max-w-7xl mx-auto` for content area
  - [x] 6.3: Apply `min-h-screen flex flex-col` to root layout container
  - [x] 6.4: Pass `user` from route context to AppHeader and NavBar

- [x] Task 7: Update route page content (AC: #3, #4, #5)
  - [x] 7.1: Update `apps/web/src/routes/briefings.tsx` — replace full-page centered layout with content that fits inside the shell (remove `min-h-screen`, keep empty-state message)
  - [x] 7.2: Update `apps/web/src/routes/search.tsx` — replace with search input placeholder inside the shell layout
  - [x] 7.3: Update `apps/web/src/routes/admin.tsx` — replace placeholder with Shadcn Tabs component (Roster, Channels, System tabs with placeholder content in each)
  - [x] 7.4: Update `apps/web/src/routes/access-denied.tsx` — remove `min-h-screen` to fit within shell

- [x] Task 8: Implement page title updates (AC: #8)
  - [x] 8.1: Add `useEffect` in each route component to update `document.title`:
    - `/briefings` → "Daily Briefing — Slack Thread Manager"
    - `/search` → "Search — Slack Thread Manager"
    - `/admin` → "Admin — Slack Thread Manager"
    - `/access-denied` → "Access Denied — Slack Thread Manager"

- [x] Task 9: Add logout button to header (AC: #1)
  - [x] 9.1: Add a sign-out button/icon in AppHeader (deferred from story 1.4 review findings)
  - [x] 9.2: Wire to `logout()` from `useAuth()` hook

- [x] Task 10: Write integration tests (AC: all)
  - [x] 10.1: Update `apps/web/src/app.test.tsx` — test: root layout renders header + nav + content, page title updates on route change, admin nav hidden for non-admin
  - [x] 10.2: Verify all existing tests still pass (`pnpm test`)

- [x] Task 11: Responsive validation (AC: #6)
  - [x] 11.1: Ensure layout content uses responsive Tailwind classes: `lg:` for single column, `xl:` for default, `2xl:` for max-width
  - [x] 11.2: AppHeader and NavBar are full-width; content area respects `max-w-7xl`

### Review Findings

- [x] [Review][Patch] `<h1>` used for persistent brand name breaks heading hierarchy [apps/web/src/components/layout/app-header.tsx:16] — fixed: changed to `<span>`; page-level headings promoted to `<h1>`; added visually hidden `<h1>` to briefings.tsx
- [x] [Review][Patch] `admin.tsx` beforeLoad guard uses raw string `role !== 'ADMIN'` instead of `isAdmin()` utility [apps/web/src/routes/admin.tsx:7] — fixed: now uses `isAdmin(context.user)`
- [x] [Review][Patch] `briefings.tsx` has no page heading — empty-state is a bare `<p>` [apps/web/src/routes/briefings.tsx] — fixed: added `<h1 className="sr-only">Daily Briefing</h1>`
- [x] [Review][Defer] `startsWith` active matching in NavBar could false-positive on future routes sharing a prefix [apps/web/src/components/layout/nav-bar.tsx:29] — deferred, pre-existing pattern; no current routes affected
- [x] [Review][Defer] `useAuth()` called in `RootLayout` creates implicit `AuthProvider` dependency; fragile for future isolated tests [apps/web/src/routes/__root.tsx:18] — deferred, pre-existing; by design per spec requirement

## Dev Notes

### Critical Architecture Constraints

**Source:** [architecture.md — Frontend Architecture; Implementation Patterns]

- **File naming:** kebab-case for all files: `app-header.tsx`, `nav-bar.tsx`
- **Component location:** `apps/web/src/components/layout/` — layout components live here per architecture spec
- **No `console.log`** — use proper error handling if needed
- **Tests colocated** — `*.test.tsx` next to source files in same directory
- **Imports from shared:** Use `@slack-thread-manager/shared` for `AuthenticatedUser`, `UserRole` types
- **No separate `types.ts`** — types exist in `packages/shared`; import from there
- **ESM imports:** Use `.js` extension on local imports (e.g., `import { isAdmin } from '../../lib/role-layout.js'`)

---

### UX Design Compliance

**Source:** [ux-design-specification.md — Navigation Patterns; Responsive Design; Accessibility]

**App Header (UX-DR14):**
- Red Hat branding with brand-red accent
- Role indicator badge showing current user's role
- Briefing freshness timestamp placeholder (actual data comes in Epic 5)

**Navigation Bar (UX-DR15):**
- Persistent horizontal bar below the app header
- Three items: Briefing (default active), Search, Admin (ADMIN only)
- Active state: white text on dark background with red-50 underline
- Inactive state: gray-30 text
- Navigation background: gray-95 (`#151515`) for contrast

**Responsive Breakpoints (UX-DR18):**
- `lg` (1024px): single column, panels stack vertically
- `xl` (1280px): default optimal layout
- `2xl` (1536px): max-width `max-w-7xl` with generous side margins

**Accessibility (UX-DR19):**
- Semantic HTML: `<header>`, `<nav>`, `<main>`
- Skip-to-content link (hidden until Tab-focused)
- Visible focus rings: blue-50, 2px offset (`ring-2 ring-offset-2 ring-[--color-blue-50]`)
- Page title updates on every navigation

---

### Red Hat Design System Tokens

**Source:** [ux-design-specification.md — Visual Foundation; globals.css]

Colors already defined in `apps/web/src/styles/globals.css` under `@theme`:
- `--color-brand-red: #ee0000` — header accent
- `--color-blue-50: #0066cc` — focus rings, active links
- `--color-gray-95: #151515` — navigation background, primary text
- `--color-gray-50: #707070` — secondary text, inactive nav items
- `--color-gray-30: #c7c7c7` — inactive nav text
- `--color-gray-10: #f2f2f2` — surface backgrounds

Typography (self-hosted .woff2):
- **Red Hat Display** (headings, Medium 500) — H1: 32px, H2: 24px, H3: 20px
- **Red Hat Text** (body, Regular 400) — 14px base, 16px for content
- **Red Hat Mono** (code/technical, Regular 400) — 13px

Spacing system (8px grid):
- `space-xs: 4px`, `space-sm: 8px`, `space-md: 16px`, `space-lg: 24px`, `space-xl: 32px`, `space-2xl: 48px`

---

### Shadcn/ui Setup Requirements

**No Shadcn components are installed yet.** This story initializes the foundation:

```bash
cd apps/web
npx shadcn@latest init
npx shadcn@latest add badge button tabs skeleton
```

**Config expectations:** `components.json` will be created at `apps/web/components.json`. Components install into `apps/web/src/components/ui/`. Shadcn uses the existing Tailwind CSS configuration and CSS variables already set up in `globals.css`.

**Important:** Shadcn/ui in 2026 uses Tailwind CSS v4 with `@import` syntax. The project already uses Tailwind v4 (`@import 'tailwindcss'` in `globals.css`). Ensure Shadcn init is configured for Tailwind v4.

---

### TanStack Router Layout Pattern

**Source:** [Story 1.4 — Frontend: Root Route with Auth Context]

The root layout in `__root.tsx` is the place to add the persistent shell. The existing root route:

```tsx
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return <Outlet />;
}
```

Story 1.5 updates `RootLayout` to wrap `<Outlet>` with the shell:

```tsx
function RootLayout() {
  const { user } = Route.useRouteContext();
  return (
    <div className="min-h-screen flex flex-col bg-[--color-gray-10]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white focus:text-[--color-blue-50]">
        Skip to content
      </a>
      <AppHeader user={user} />
      <NavBar user={user} />
      <main id="main-content" className="flex-1 w-full max-w-7xl mx-auto px-4 xl:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
```

**Route context access:** Use `Route.useRouteContext()` to get `user` from the router context that was injected in `app.tsx`.

---

### Files Being Created (NEW)

```
apps/web/src/components/layout/app-header.tsx
apps/web/src/components/layout/app-header.test.tsx
apps/web/src/components/layout/nav-bar.tsx
apps/web/src/components/layout/nav-bar.test.tsx
apps/web/src/components/ui/badge.tsx          (via Shadcn CLI)
apps/web/src/components/ui/button.tsx         (via Shadcn CLI)
apps/web/src/components/ui/tabs.tsx           (via Shadcn CLI)
apps/web/src/components/ui/skeleton.tsx       (via Shadcn CLI)
apps/web/src/styles/fonts/RedHatDisplay-Medium.woff2
apps/web/src/styles/fonts/RedHatText-Regular.woff2
apps/web/src/styles/fonts/RedHatMono-Regular.woff2
apps/web/components.json                      (via Shadcn init)
```

### Files Being Updated (EXISTING)

```
apps/web/src/routes/__root.tsx       — add layout shell (AppHeader, NavBar, main, skip-link)
apps/web/src/routes/briefings.tsx    — remove min-h-screen, fit inside shell
apps/web/src/routes/search.tsx       — add search input placeholder, fit inside shell
apps/web/src/routes/admin.tsx        — add Tabs component (Roster, Channels, System)
apps/web/src/routes/access-denied.tsx — remove min-h-screen, fit inside shell
apps/web/src/styles/globals.css      — add @font-face declarations, font theme tokens
apps/web/src/app.test.tsx            — update tests for shell rendering
apps/web/package.json                — new Shadcn deps added by CLI (class-variance-authority, etc.)
```

### Files NOT Modified (Preserve As-Is)

```
apps/web/src/app.tsx                 — no changes, RouterProvider already correct
apps/web/src/router.ts               — no changes needed
apps/web/src/auth/                   — auth system untouched
apps/web/src/lib/role-layout.ts      — reused as-is for isAdmin(), hasRole()
apps/web/src/routes/index.tsx        — redirect logic unchanged
apps/web/src/main.tsx                — entry point unchanged
```

---

### Previous Story Learnings (Story 1.4)

**Source:** [1-4-role-based-access-control-and-route-guards.md — Dev Notes]

- **TanStack Router v1.169.2** — installed and working. File-based routing with auto-generated `routeTree.gen.ts`.
- **`TanStackRouterVite()` MUST come BEFORE `react()`** in Vite plugins array.
- **Router context** — `{ user, isAuthenticated }` passed to `RouterProvider` in `app.tsx`. Access in routes via `Route.useRouteContext()` or in `beforeLoad` via `context` parameter.
- **Route guard pattern** — `beforeLoad` with `throw redirect()` for access control. Used by admin route.
- **Role utilities work** — `isAdmin(user)`, `hasRole(user, ...roles)`, `getLayoutVariant(role)` tested and passing.
- **Test framework** — vitest + `@testing-library/react`. Tests use `vi.mock()`.
- **`routeTree.gen.ts` committed** — kept in git, auto-regenerated by Vite plugin.
- **TanStackRouterVite in vitest.config.ts** — ensures route tree stays in sync during test runs.
- **Auth context** — `useAuth()` from `apps/web/src/auth/index.ts` provides `{ isLoading, isAuthenticated, user, token, login, logout }`.
- **Deferred from 1.4:** Admin navigation item (conditional rendering), logout button, navigation bar itself — all are THIS story's responsibility.
- **`role` defaults to `'CONSULTANT'`** if missing from JWT (pre-existing behavior in `auth-context.tsx`).

---

### Anti-Patterns to Avoid

- **DO NOT** create a separate `LayoutProvider` or context for the shell — pass `user` directly from route context to components.
- **DO NOT** use `localStorage` for navigation state — use TanStack Router's URL as source of truth for active route.
- **DO NOT** hardcode color values — use CSS variables from `globals.css` (e.g., `text-[--color-gray-95]`).
- **DO NOT** use `<div onClick>` for navigation — use `<Link>` from TanStack Router and `<button>` for actions.
- **DO NOT** create `apps/web/src/layouts/` directory — layout components go in `apps/web/src/components/layout/`.
- **DO NOT** add `@tanstack/react-query` or Zustand yet — those are for later stories. This story uses only static rendering.
- **DO NOT** create index barrel files in `components/layout/` — import directly from file paths.
- **DO NOT** install `@redhat/fonts` package — self-host the .woff2 files directly.

---

### Font Download Instructions

Red Hat fonts are open-source and available from Google Fonts or the Red Hat Brand GitHub:
- Download from: https://github.com/RedHatOfficial/RedHatFont/releases
- Required files: `RedHatDisplay-Medium.woff2`, `RedHatText-Regular.woff2`, `RedHatMono-Regular.woff2`
- If .woff2 not directly available, use a conversion tool or download from Google Fonts API with `&subset=latin`

---

### Scope Boundaries

**In scope for story 1.5:**
- Shadcn/ui initialization and base components
- Red Hat font self-hosting
- AppHeader component (branding, role badge, freshness placeholder, logout button)
- NavBar component (Briefing, Search, Admin — with active states and role gating)
- Root layout shell in `__root.tsx`
- Skip-to-content accessibility link
- Page title updates on navigation
- Responsive max-width container
- Updated route pages to fit within shell
- Admin page with Tabs placeholder (Roster, Channels, System)

**Out of scope (future stories):**
- BriefingCard, StatsBar, WorkstreamFilter components (Epic 5)
- Actual briefing data or API integration
- Search functionality (Epic 6)
- Roster/Channel CRUD forms (Stories 1.6, 1.7)
- TanStack Query data fetching
- Zustand state management
- Layout variant switching (dashboard/feed/split-panel) — Epic 5

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture — Routing: TanStack Router]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns — Structure Patterns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Navigation Patterns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Responsive Design & Accessibility]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR14, UX-DR15, UX-DR18, UX-DR19]
- [Source: _bmad-output/implementation-artifacts/1-4-role-based-access-control-and-route-guards.md#Dev Notes]
- [Source: TanStack Router v1 docs — File-Based Routing, createRootRouteWithContext]
- [Source: Shadcn/ui docs — Installation with Tailwind v4]

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (Cursor Agent)

### Debug Log References

- Shadcn CLI initially failed due to sandbox permissions — resolved by running with full permissions.
- `class-variance-authority` and `radix-ui` not auto-installed by Shadcn CLI — manually added via `pnpm add`.
- Initial Google Fonts .woff2 download returned tiny files (redirect pages) — fixed by extracting proper URLs from the CSS API response with correct User-Agent header.

### Completion Notes List

- Shadcn/ui initialized with `components.json` (New York style, CSS variables). Installed badge, button, tabs, skeleton components. Added `class-variance-authority` and `radix-ui` dependencies.
- Red Hat fonts self-hosted: Red Hat Display Medium (14.8KB), Red Hat Text Regular (6.6KB), Red Hat Mono Regular (9.7KB) in `.woff2` format. Added `@font-face` declarations and `@theme` font tokens in `globals.css`.
- AppHeader component: brand-red accent bar, app title, role indicator badge (Shadcn Badge), briefing freshness placeholder with `role="status"`, logout button (lucide-react LogOut icon) wired to `onLogout` prop. Semantic `<header>` element.
- NavBar component: persistent horizontal nav on gray-95 background. 3 items for ADMIN, 2 for others. Active state: white text + brand-red bottom border. Inactive: gray-30 text. Uses TanStack Router `<Link>` + `useRouterState()` for active detection. `aria-current="page"` on active item. Semantic `<nav aria-label="Main navigation">`.
- Root layout (`__root.tsx`): skip-to-content link → AppHeader → NavBar → `<main id="main-content">` with responsive max-width container (`max-w-7xl mx-auto px-4 xl:px-8 py-6`). Background gray-10. `min-h-screen flex flex-col`.
- Route pages updated: briefings (empty state message), search (input placeholder + description), admin (Shadcn Tabs with Roster/Channels/System), access-denied (clean message + return link). All pages have `useEffect` for `document.title` updates.
- Logout button in header wired to `logout()` from `useAuth()` hook via `__root.tsx`.
- 46 frontend tests passing (9 app-header, 8 nav-bar, 11 app integration, 14 role-layout, 4 auth-context). Full monorepo: 99 tests passing. Zero regressions.

### Change Log

- 2026-05-07: Implemented Story 1.5 — Dashboard shell with AppHeader (branding, role badge, freshness placeholder, logout), NavBar (3 items, role-gated Admin, active states), root layout shell with skip-to-content, responsive container, page title updates, Shadcn/ui foundation, Red Hat fonts. 99 tests passing across monorepo.

### File List

**New Files:**
- `apps/web/components.json`
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/tabs.tsx`
- `apps/web/src/components/ui/skeleton.tsx`
- `apps/web/src/components/layout/app-header.tsx`
- `apps/web/src/components/layout/app-header.test.tsx`
- `apps/web/src/components/layout/nav-bar.tsx`
- `apps/web/src/components/layout/nav-bar.test.tsx`
- `apps/web/src/styles/fonts/RedHatDisplay-Medium.woff2`
- `apps/web/src/styles/fonts/RedHatText-Regular.woff2`
- `apps/web/src/styles/fonts/RedHatMono-Regular.woff2`

**Modified Files:**
- `apps/web/src/routes/__root.tsx` — added layout shell (AppHeader, NavBar, main, skip-link)
- `apps/web/src/routes/briefings.tsx` — updated to fit inside shell with page title
- `apps/web/src/routes/search.tsx` — added search input placeholder with page title
- `apps/web/src/routes/admin.tsx` — added Shadcn Tabs (Roster, Channels, System) with page title
- `apps/web/src/routes/access-denied.tsx` — updated to fit inside shell with page title
- `apps/web/src/styles/globals.css` — added @font-face declarations, font theme tokens, body/heading font-family
- `apps/web/src/app.test.tsx` — added 6 integration tests for shell rendering
- `apps/web/package.json` — added class-variance-authority, radix-ui dependencies
- `pnpm-lock.yaml` — updated lockfile
