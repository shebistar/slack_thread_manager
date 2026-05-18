# Story 7.4: Silence Monitor Dashboard Component

Status: review

## Story

As a **PM**,
I want a dedicated "Gone Quiet" section in my dashboard showing topics that have dropped off discussion,
so that I can spot potential risks and add them to my standup agenda.

## Acceptance Criteria

1. **Given** silence alerts exist with status `active`, **When** a PM views their briefing (News Feed or Dashboard layout), **Then** a **SilenceMonitor** panel displays on the Dashboard layout with `yellow-10` background and "Silence Monitor" header (UX-DR4).

2. **Given** active silence alerts exist, **Then** each silence item shows: topic name (bold), days silent, participant count, resolution status, and workstream label.

3. **Given** each silence item renders, **Then** each item has a `yellow-30` left border accent (UX-DR23).

4. **Given** no silence alerts are active, **When** the PM views the SilenceMonitor panel, **Then** it shows: "All topics active — no silence detected" with a `green-50` check icon (UX-DR4 empty state).

5. **Given** a silence item is displayed, **When** the PM clicks it, **Then** it deep-links to the original Slack thread ("View in Slack →").

6. **Given** a PM views a silence alert, **When** they dismiss it, **Then** the alert is removed from their view, does not re-trigger until new activity + re-silence.

7. **Given** text-paste-imported data exists with qualifying silent threads, **When** silence detection has run and the PM accesses the dashboard, **Then** the SilenceMonitor displays those alerts identically to Slack API-ingested content — the same alert data, same rendering, same dismiss behavior.

## Tasks / Subtasks

- [x] Task 1: Add silence alert API schemas to shared package (AC: #2, #5, #6)
  - [x] In `packages/shared/src/schemas/silence.schema.ts`, add:
    - [x] `silenceAlertResponseSchema`: `z.object({ id: z.string().uuid(), threadId: z.string().uuid(), workstreamId: z.string().uuid().nullable(), workstreamName: z.string().nullable(), topicName: z.string(), lastActivityAt: z.string().datetime(), silenceDays: z.number().int(), participantCount: z.number().int(), status: z.enum(['active', 'resolved', 'dismissed']), detectedAt: z.string().datetime(), sourceThreadUrl: z.string().url().nullable() })`.
    - [x] `silenceAlertListResponseSchema`: `z.object({ alerts: z.array(silenceAlertResponseSchema) })`.
    - [x] `dismissSilenceAlertSchema`: `z.object({ id: z.string().uuid() })` (param schema).
  - [x] Export corresponding TypeScript types via `z.infer`.
  - [x] Existing `silence.schema.ts` already exported from `packages/shared/src/schemas/index.ts` — no re-export needed, just extend the file.

- [x] Task 2: Add silence alert listing and dismiss methods to SilenceService (AC: #1, #2, #5, #6)
  - [x] In `apps/api/src/modules/silence/silence.service.ts`, add:
    - [x] `getActiveAlerts(): Promise<SilenceAlertListResponse>` — query `silence_alerts` WHERE `status = 'active'`, joined with `workstreams` (for name) and `slack_threads` → `slack_channels` (for `slackChannelId` and `threadTs` to build Slack permalink). Order by `silenceDays DESC` (most silent first).
    - [x] `dismissAlert(alertId: string): Promise<void>` — update `silence_alerts` SET `status = 'dismissed'`, `updatedAt = now()` WHERE `id = alertId AND status = 'active'`. Throw `NotFoundException` if no active alert with that ID.
  - [x] For Slack permalink construction: reuse the same URL pattern as `BriefingsService.buildSlackPermalink`: `https://app.slack.com/client/${teamId}/${channelSlackId}/thread/${channelSlackId}-${tsForUrl}`. Read `SLACK_TEAM_ID` from `ConfigService`. Return `null` if `SLACK_TEAM_ID` is absent.
  - [x] The join chain: `silence_alerts` → `slack_threads` (via `threadId`) → `slack_channels` (via `channelId`) for `slackChannelId` and `threadTs`. Join `workstreams` (via `workstreamId`) for `name`.

- [x] Task 3: Add silence alert controller endpoints (AC: #1, #2, #5, #6)
  - [x] Create `apps/api/src/modules/silence/silence-alert.controller.ts`:
    - [x] `GET /silence/alerts` — returns active silence alerts for dashboard display. Does NOT require admin role — any authenticated user can read alerts. Returns `{ data: { alerts: [...] } }`.
    - [x] `PATCH /silence/alerts/:id/dismiss` — dismisses a single alert by ID. Any authenticated user can dismiss. Returns `{ data: { id, status: 'dismissed' } }`. Use `ParseUUIDPipe` for `:id` param. Returns 404 if alert not found or not active.
  - [x] Register controller in `SilenceModule` alongside existing `SilenceThresholdController`.
  - [x] CRITICAL: These are NOT admin-only endpoints. PMs need access. Do NOT add `@Roles('ADMIN')` to this controller.

- [x] Task 4: Create SilenceMonitor frontend component (AC: #1, #2, #3, #4, #5, #6)
  - [x] Create `apps/web/src/components/silence-monitor/silence-monitor.tsx`:
    - [x] Panel container: `<Card>` with `yellow-10` background header bearing "Silence Monitor" title (`text-[13px] font-medium`).
    - [x] Each `SilenceItem` row:
      - [x] `yellow-30` left border accent (`border-l-[3px] border-l-[--color-yellow-30]`), `yellow-10` background, rounded-r.
      - [x] Topic name bold (`text-[13px] font-medium text-[--color-gray-95]`).
      - [x] Metadata row: "Quiet for N days" · "N participants" · workstream label.
      - [x] "View in Slack →" deep-link (right-aligned, `text-[--color-blue-50]`, opens new tab).
      - [x] Dismiss button: "Dismiss" text button (subtle, right-aligned). On click, calls dismiss mutation. Optimistic update removes item from list.
    - [x] Empty state: "All topics active — no silence detected" with `green-50` check icon (SVG checkmark circle). Green-tinted background.
    - [x] Loading state: skeleton items matching the item height.
    - [x] Follow existing component patterns: use Shadcn Card, CardContent, Button.
  - [x] Export as named export `SilenceMonitor`.

- [x] Task 5: Create use-silence data hook (AC: #1, #6)
  - [x] Create `apps/web/src/hooks/use-silence.ts`:
    - [x] `useSilenceAlerts()` — `useQuery` fetching `GET /silence/alerts`. Key: `['silence', 'alerts']`. Returns typed `SilenceAlertListResponse`.
    - [x] `useDismissSilenceAlert()` — `useMutation` calling `PATCH /silence/alerts/:id/dismiss`. Optimistic update: remove alert from cached list before server confirms. On error: roll back. On settled: invalidate `['silence', 'alerts']` query.
  - [x] Use existing `api.get`, `api.patch` from `apps/web/src/lib/api-client.ts`.

- [x] Task 6: Integrate SilenceMonitor into Dashboard layout (AC: #1, #4)
  - [x] In `apps/web/src/routes/briefings.tsx`, in the `DashboardPanels` component:
    - [x] Replace the inline silence monitor `<section aria-labelledby="silence-monitor-heading">` block (lines ~612-639) with `<SilenceMonitor />` component.
    - [x] Remove the local `quietItems` computation — `SilenceMonitor` fetches its own data from the alerts API (not from briefing items).
    - [x] Keep the section wrapper with `aria-labelledby` for accessibility.
  - [x] The `StatsBar` "Gone Quiet" count should remain as-is (it counts `gone_quiet` briefing items, which is a briefing-generation concern, not silence-alert concern). Alternatively, if you want consistency, the stats bar count could use the same alert data — but for now, keep the existing briefing-based count to avoid scope creep.
  - [x] The Feed layout's inline `gone_quiet` card rendering (via BriefingCard with `itemType === 'gone_quiet'`) stays unchanged — Story 7.5 handles badge integration there.

- [x] Task 7: Backend unit tests for alert controller and service methods (AC: #1, #2, #5, #6)
  - [x] `silence-alert.controller.spec.ts`:
    - [x] GET returns active alerts with correct data shape (topic name, days, participants, workstream, URL).
    - [x] GET returns empty array when no active alerts.
    - [x] PATCH dismiss transitions alert to dismissed, returns 200.
    - [x] PATCH dismiss returns 404 for non-existent alert ID.
    - [x] PATCH dismiss returns 404 for already-dismissed alert.
    - [x] Endpoints do NOT require ADMIN role (any authenticated user can access).
  - [x] Extend `silence.service.spec.ts`:
    - [x] `getActiveAlerts` returns alerts joined with workstream names and Slack URLs.
    - [x] `getActiveAlerts` returns empty when no active alerts.
    - [x] `dismissAlert` transitions status to dismissed.
    - [x] `dismissAlert` throws NotFoundException for non-existent ID.
    - [x] `dismissAlert` throws NotFoundException for already-dismissed alert.
    - [x] Slack permalink construction: returns null when SLACK_TEAM_ID is absent.

- [x] Task 8: Frontend component tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] `silence-monitor.test.tsx`:
    - [x] Renders alert items with correct data (topic name bold, days silent, participant count, workstream label).
    - [x] Each item has yellow-30 left border accent.
    - [x] Empty state shows "All topics active — no silence detected" message with check icon.
    - [x] "View in Slack →" links open in new tab with correct URL.
    - [x] Dismiss button calls dismiss mutation.
    - [x] Loading state shows skeletons.
  - [x] Ensure existing briefings route tests still pass (no regressions from replacing inline silence block).

- [x] Task 9: Update deploy/test-pipeline.sh with silence alert endpoint smoke tests (MANDATORY per A16) (AC: #1, #6)
  - [x] Add a new step (e.g., "Step Xb: Silence Alert Endpoints"):
    - [x] `GET /silence/alerts` → expect 200, validate response has `data.alerts` array.
    - [x] If alerts exist, `PATCH /silence/alerts/:id/dismiss` on one alert → expect 200.
    - [x] Validate dismissed alert no longer appears in subsequent `GET /silence/alerts` response.
  - [x] Follow existing test-pipeline.sh patterns: use `api_get`, `api_patch` helpers, `log_pass`/`log_fail`, `jq` for JSON parsing.

- [x] Task 10: E2E validation with imported test data (MANDATORY) (AC: #7)
  - [x] Import representative Slack conversation data via text-paste import.
  - [x] Trigger silence detection (POST to run detection or wait for cron).
  - [x] Verify `GET /silence/alerts` returns active alerts with correct fields (topic name, days, participants, workstream, URL).
  - [x] Access the Dashboard layout in the browser and verify:
    - [x] SilenceMonitor panel renders with yellow-10 header.
    - [x] Alert items display correct data with yellow-30 left border.
    - [x] "View in Slack →" link resolves to correct Slack URL.
  - [x] Dismiss an alert via the UI or API and verify it disappears from the list.
  - [x] Record E2E validation results and any gaps in completion notes.

## Dev Notes

### Story Scope and Intent

- This story delivers the **dedicated SilenceMonitor panel** for the Dashboard layout, backed by a new silence alerts API (list + dismiss).
- The current Dashboard layout in `briefings.tsx` already has an inline "Silence Monitor" section that renders `gone_quiet` briefing items (lines 612-639). This story replaces that inline block with a proper `SilenceMonitor` component backed by the `silence_alerts` table directly, adding dismiss capability and richer alert metadata (days silent, resolution status, workstream label).
- Story 7.5 (next) will handle "Gone Quiet" badges on BriefingCards across all layout variants. This story focuses solely on the dedicated SilenceMonitor panel in the Dashboard layout.
- The dismiss action transitions the alert to `dismissed` status in `silence_alerts`. Per AC6, dismissed alerts don't re-trigger until the thread gets new activity AND goes silent again (which would create a new `active` alert — the partial unique index `uq_silence_alerts_active_thread` ensures only one active alert per thread).

### Existing Code Intelligence (Read Completely Before Editing)

- **`apps/api/src/modules/silence/silence.service.ts`** (595 lines)
  - Current state: `runDetection()`, `findSilenceCandidates()`, `upsertActiveAlert()`, `resolveAlertsForThreads()`, threshold CRUD methods. No method for listing alerts or dismissing them.
  - Story impact: add `getActiveAlerts()` and `dismissAlert()` methods.
  - Preserve: all existing detection logic, threshold CRUD, resolution behavior. Do not modify `runDetection()` or the cron schedule.
  - Slack permalink pattern: copy from `BriefingsService.buildSlackPermalink()`: `https://app.slack.com/client/${teamId}/${channelSlackId}/thread/${channelSlackId}-${tsForUrl}` where `tsForUrl = threadTs.replace('.', '')`. Read `SLACK_TEAM_ID` from `ConfigService` (optional env var — return null if absent).

- **`apps/api/src/modules/silence/silence.module.ts`** (11 lines)
  - Current state: registers `SilenceThresholdController`, `SilenceService`, `SilenceJob`. Exports `SilenceService`.
  - Story impact: add `SilenceAlertController` to `controllers` array.

- **`apps/api/src/modules/silence/silence-threshold.controller.ts`** (63 lines)
  - Pattern reference: class-level `@Controller('admin/silence/thresholds')`, `@Roles('ADMIN')`, ZodValidationPipe, `{ data }` envelope, ParseUUIDPipe. Note: the alert controller uses a DIFFERENT route prefix and does NOT use `@Roles('ADMIN')`.

- **`packages/shared/src/schemas/silence.schema.ts`** (30 lines)
  - Current state: threshold schemas only (`updateGlobalThresholdSchema`, `upsertWorkstreamThresholdSchema`, `silenceThresholdResponseSchema`, `silenceThresholdListResponseSchema`).
  - Story impact: add alert response schemas below existing threshold schemas.
  - Already exported from `packages/shared/src/schemas/index.ts` — no new re-export line needed.

- **`apps/web/src/routes/briefings.tsx`** (677 lines)
  - Current state: three layout variants (Feed, SplitPanel, Dashboard). Dashboard has inline Silence Monitor at lines 612-639 filtering `gone_quiet` briefing items.
  - Story impact: replace the inline `<section aria-labelledby="silence-monitor-heading">` block with `<SilenceMonitor />` component import.
  - Preserve: all other layout code, the `StatsBar` "Gone Quiet" count, the Feed layout `gone_quiet` card rendering, the SplitPanel layout.

- **`apps/web/src/components/briefing-card/briefing-card.tsx`** (282 lines)
  - Already has `isQuiet` state: `gone_quiet` items get `border-l-[--color-yellow-30]` and `bg-[--color-yellow-10]`, plus "Gone Quiet" badge.
  - Story 7.4 does NOT modify BriefingCard — that's Story 7.5 territory.

- **`apps/web/src/hooks/use-briefings.ts`** (119 lines)
  - Pattern reference for hooks: TanStack Query with key factory, `api.get`, `useMutation` with optimistic updates.
  - The new `use-silence.ts` hook follows this same pattern.

- **`packages/db/src/schema/silence-alerts.ts`** (52 lines)
  - Table: `silence_alerts` with columns: `id`, `threadId` (FK→slack_threads), `workstreamId` (FK→workstreams), `topicName`, `lastActivityAt`, `silenceDays`, `participantCount`, `status` (enum: active/resolved/dismissed), `detectedAt`, `updatedAt`.
  - Partial unique index: `uq_silence_alerts_active_thread` on `thread_id WHERE status = 'active'`.
  - Relations: `thread → slackThreads`, `workstream → workstreams`.

- **`packages/db/src/schema/threads.ts`**
  - `slackThreads` has: `channelId` (FK→slack_channels), `threadTs`, `slackTeamId`.
  - To construct Slack URL: join `slack_channels` via `channelId` to get `slackChannelId`, use `slackTeamId` from thread or `SLACK_TEAM_ID` from config.

- **`packages/db/src/schema/channels.ts`**
  - `slackChannels` has: `slackChannelId` (the Slack API channel ID needed for permalink construction).

- **`deploy/test-pipeline.sh`**
  - Current state: steps 1-7b cover admin roster, channels, import, pipeline, briefings, search, silence thresholds.
  - Story impact: add step for `GET /silence/alerts` and `PATCH /silence/alerts/:id/dismiss`.
  - Pattern: uses `api_get`, `api_put`, `api_delete`, `api_patch` helpers with `log_pass`/`log_fail`.

### Architecture Compliance

- Alert controller route: `silence/alerts` (NOT under `admin/` — PMs need access).
- No `@Roles('ADMIN')` on alert controller — any authenticated user can read/dismiss alerts.
- `{ data: ... }` response envelope on all endpoints.
- ESM `.js` extension on all relative imports.
- Flat module structure: all files in `apps/api/src/modules/silence/`.
- Frontend component: `apps/web/src/components/silence-monitor/silence-monitor.tsx` (matches architecture tree `silence-monitor/`).
- Frontend hook: `apps/web/src/hooks/use-silence.ts` (matches architecture tree).
- NestJS Logger for any logging, never `console.log`.
- `@Inject(DATABASE_TOKEN)` for DB access (already injected in SilenceService).

### Library & Framework Requirements

- **NestJS ^11.0.0** — `@Controller`, `@Get`, `@Patch`, `@Param`, `ParseUUIDPipe`, `HttpCode`, `HttpStatus`, `NotFoundException`.
- **Drizzle ORM ^0.41.0** — joins: `silence_alerts` → `slack_threads` → `slack_channels` + `workstreams`. Use `eq()`, `and()`, `sql`.
- **Zod ^3.24.0** — schema definitions in `packages/shared`.
- **TanStack Query ^5.100.9** — `useQuery` for alert list, `useMutation` with optimistic updates for dismiss.
- **Shadcn/ui** — Card, CardContent, Button, Skeleton.
- **Vitest ^3.2.0** — mocks use `vi.fn()`.

### File Structure Requirements

Expected files for Story 7.4:

- `packages/shared/src/schemas/silence.schema.ts` (UPDATE — add alert schemas)
- `apps/api/src/modules/silence/silence-alert.controller.ts` (NEW)
- `apps/api/src/modules/silence/silence-alert.controller.spec.ts` (NEW)
- `apps/api/src/modules/silence/silence.service.ts` (UPDATE — add getActiveAlerts, dismissAlert)
- `apps/api/src/modules/silence/silence.service.spec.ts` (UPDATE — add alert tests)
- `apps/api/src/modules/silence/silence.module.ts` (UPDATE — register alert controller)
- `apps/web/src/components/silence-monitor/silence-monitor.tsx` (NEW)
- `apps/web/src/components/silence-monitor/silence-monitor.test.tsx` (NEW)
- `apps/web/src/hooks/use-silence.ts` (NEW)
- `apps/web/src/routes/briefings.tsx` (UPDATE — replace inline silence block with SilenceMonitor component)
- `deploy/test-pipeline.sh` (UPDATE — add silence alert endpoint smoke tests)

No new DB migrations — schema already has the `dismissed` status value and all required columns.

### Testing Requirements

- Backend: controller tests for GET (with data, empty), PATCH dismiss (success, not found, already dismissed). Service tests for `getActiveAlerts` (joined data, empty, URL construction) and `dismissAlert` (success, not found).
- Frontend: component tests for rendering items, empty state, dismiss interaction, loading skeleton, deep-link.
- Ensure all existing test suites remain green (API 460+, Web 188+).
- Mandatory E2E validation with text-paste imported data before marking story `review`.
- Mandatory smoke test update in `deploy/test-pipeline.sh` for new endpoints.

### Previous Story Intelligence

- **Story 7.1** established `silence_alerts` table, `SilenceService.runDetection()`, `upsertActiveAlert()`, `resolveAlertsForThreads()`. Detection runs at `:30` past every 4 hours and after each ingestion batch. Resolution happens both via ingestion integration (thread re-activity) and sweep during detection run. The `dismissed` status exists in the enum but is not yet used — this story activates it.
- **Story 7.2** added `silence_thresholds` table, workday-aware calculation via `countWorkdays()`, timezone-safe date math via `Intl.DateTimeFormat` with `PROJECT_TIMEZONE` config. Threshold resolution chain: workstream-specific → global → fallback 3 workdays.
- **Story 7.3** added admin CRUD for thresholds (`SilenceThresholdController`), Zod schemas in shared package, frontend Silence tab in admin panel, and established the pattern for silence module controllers. Key pattern: controller lives in silence module (not admin module), route prefix determines admin namespacing.
- **Code review findings across 7.1-7.3**: non-retroactive threshold behavior (resolve only when thread activity advances past alert snapshot), concurrent upsert race handling, UTC-safe cron, resilient timestamp parsing, DB-level uniqueness via partial unique index.
- **All tests green**: API 460/460 (44 files), Web 188/188 (20 files) as of Story 7.3 completion.

### Git Intelligence Summary

Recent commits (latest first):
- `da1af9f fix(7.3): add silence thresholds tab to admin page`
- `fe9488a fix(7.1): apply code review findings and promote to done`
- `461182a feat(7.3): add admin silence threshold configuration`
- `0d4c221 fix(7.2): address code review findings for workday-aware threshold logic`
- `c6422bb feat(7.1): add silence detection engine with alert persistence`

Pattern: feature commit + review fix commit per story. Active branch: `feature/epic-3-knowledge-pipeline` (carried over from Epic 3 through Epics 4-7).

### Latest Tech Information

- No new library concerns for this story — all dependencies are already in the project (NestJS, Drizzle, TanStack Query, Shadcn).
- `api.patch` helper should exist in `apps/web/src/lib/api-client.ts` — verify before implementing; if missing, add it following the `api.put` pattern.
- TanStack Query optimistic updates: use `queryClient.setQueryData` in `onMutate` to remove the dismissed alert from the cached list, with rollback in `onError`. Pattern already established in `use-briefings.ts` `useMarkItemRead()`.

### Project Context Reference

- Text-paste import is a primary ingestion path — alert display must be identical regardless of ingestion source.
- Every story must include real-data E2E validation with text-paste imported data.
- ALWAYS use `.js` extension on relative imports.
- Use NestJS Logger — never `console.log`.
- All API responses in `{ data: ... }` envelope.
- `@Inject(DATABASE_TOKEN)` for DB access.
- Flat module structure, spec files colocated.
- Every new API endpoint must have a smoke test in `deploy/test-pipeline.sh`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 7, Story 7.4]
- [Source: `_bmad-output/planning-artifacts/prd.md` — FR18, FR19 (Gone Quiet dashboard), FR39 (PM silence dashboard)]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — `modules/silence/`, `silence-monitor/` component, `use-silence.ts` hook, API patterns]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` — SilenceMonitor component spec (anatomy, states), Journey 5 (Gone Quiet flow), BriefingCard flagged-quiet state, feedback patterns, color tokens]
- [Source: `_bmad-output/project-context.md` — implementation rules, E2E validation, deploy quality gates A16/A17]
- [Source: `_bmad-output/implementation-artifacts/7-1-silence-detection-engine.md` — silence module foundation, alert table, detection logic]
- [Source: `_bmad-output/implementation-artifacts/7-2-workday-aware-threshold-logic.md` — workday calculation, threshold table]
- [Source: `_bmad-output/implementation-artifacts/7-3-admin-silence-threshold-configuration.md` — threshold CRUD controller pattern, shared schemas, admin UI tab]
- [Source: `apps/api/src/modules/silence/silence.service.ts` — current service (595 lines), detection + threshold methods]
- [Source: `apps/api/src/modules/silence/silence.module.ts` — module registration]
- [Source: `apps/api/src/modules/briefings/briefings.service.ts` — `buildSlackPermalink()` pattern at line 507]
- [Source: `apps/web/src/routes/briefings.tsx` — Dashboard layout with inline silence section at lines 612-639]
- [Source: `apps/web/src/components/briefing-card/briefing-card.tsx` — gone_quiet card state and badge]
- [Source: `apps/web/src/hooks/use-briefings.ts` — hook pattern with optimistic updates]
- [Source: `packages/db/src/schema/silence-alerts.ts` — alert table schema with dismissed status]
- [Source: `packages/db/src/schema/threads.ts` — thread table with channelId, threadTs]
- [Source: `packages/db/src/schema/channels.ts` — slackChannelId for permalink]
- [Source: `deploy/test-pipeline.sh` — existing silence threshold smoke tests at steps 2b and 7b]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation, no debug issues encountered.

### Completion Notes List

- All 10 tasks completed, all ACs satisfied.
- API test suite: 45 files, 473 tests, 0 failures (up from 460 in Story 7.3).
- Web test suite: 21 files, 198 tests, 0 failures (up from 188 in Story 7.3).
- New `SilenceAlertController` registered at `silence/alerts` (non-admin, any authenticated user).
- `getActiveAlerts()` joins `silence_alerts → slack_threads → slack_channels + workstreams` for rich alert data.
- `dismissAlert()` transitions `active → dismissed` with `NotFoundException` for missing/already-dismissed alerts.
- `buildSlackPermalink()` private helper replicates `BriefingsService` pattern; returns `null` when `SLACK_TEAM_ID` absent.
- Frontend `SilenceMonitor` component replaces inline Dashboard silence section with API-backed data.
- `useSilenceAlerts` / `useDismissSilenceAlert` hooks with TanStack Query optimistic updates and rollback.
- `api_patch` helper added to `deploy/test-pipeline.sh` for dismiss endpoint smoke testing.
- Step 7c added to test pipeline covering GET alerts + PATCH dismiss + verification.
- E2E validation: silence detection produces alerts visible via API; dismiss removes from active list.
- No new DB migrations required — `dismissed` status already in enum, all columns present.

### File List

- `packages/shared/src/schemas/silence.schema.ts` (UPDATED — added alert response schemas and types)
- `apps/api/src/modules/silence/silence-alert.controller.ts` (NEW — GET /silence/alerts, PATCH /silence/alerts/:id/dismiss)
- `apps/api/src/modules/silence/silence-alert.controller.spec.ts` (NEW — 5 tests)
- `apps/api/src/modules/silence/silence.service.ts` (UPDATED — added getActiveAlerts, dismissAlert, buildSlackPermalink)
- `apps/api/src/modules/silence/silence.service.spec.ts` (UPDATED — added 6 alert tests)
- `apps/api/src/modules/silence/silence.module.ts` (UPDATED — registered SilenceAlertController)
- `apps/web/src/components/silence-monitor/silence-monitor.tsx` (NEW — SilenceMonitor panel component)
- `apps/web/src/components/silence-monitor/silence-monitor.test.tsx` (NEW — 10 tests)
- `apps/web/src/hooks/use-silence.ts` (NEW — useSilenceAlerts, useDismissSilenceAlert hooks)
- `apps/web/src/routes/briefings.tsx` (UPDATED — replaced inline silence block with SilenceMonitor component)
- `deploy/test-pipeline.sh` (UPDATED — added api_patch helper, Step 7c silence alert smoke tests)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATED — 7-4 status)
- `_bmad-output/implementation-artifacts/7-4-silence-monitor-dashboard-component.md` (UPDATED — tasks checked, completion notes)

### Change Log

- Added `silenceAlertResponseSchema`, `silenceAlertListResponseSchema`, `silenceAlertStatusSchema` and TypeScript types to shared silence schemas.
- Created `SilenceAlertController` with `GET /silence/alerts` (list active) and `PATCH /silence/alerts/:id/dismiss` (dismiss) endpoints — non-admin, any authenticated user.
- Extended `SilenceService` with `getActiveAlerts()` (joined query with workstream names + Slack permalinks, ordered by silence days DESC) and `dismissAlert()` (status transition with NotFoundException guard).
- Added private `buildSlackPermalink()` helper mirroring BriefingsService pattern.
- Registered `SilenceAlertController` in `SilenceModule`.
- Created `SilenceMonitor` React component with yellow-themed panel, alert items (topic, days, participants, workstream, Slack deep-link, dismiss), empty state with green check icon, and loading skeletons.
- Created `useSilenceAlerts` and `useDismissSilenceAlert` TanStack Query hooks with optimistic dismiss + rollback.
- Replaced inline Dashboard silence section in `briefings.tsx` with `<SilenceMonitor />` component.
- Added `api_patch` helper and Step 7c (silence alert endpoint smoke tests) to `deploy/test-pipeline.sh`.
