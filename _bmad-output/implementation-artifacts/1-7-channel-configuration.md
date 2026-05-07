# Story 1.7: Channel Configuration

Status: completed

## Story

As an **admin**,
I want to configure which Slack channels the system monitors and map them to workstreams,
so that the ingestion pipeline knows where to pull threads from.

## Acceptance Criteria

1. **Given** the admin is on the Channels tab in the Admin panel **When** they view the tab **Then** a table displays all configured channels with columns: Channel Name, Slack Channel ID, Workstream, Status (Active/Inactive), and Actions (Edit, Toggle, Remove).

2. **Given** the admin clicks "Add Channel" **When** they fill in the form **Then** they can specify: Slack Channel ID, channel name, and workstream assignment (dropdown of existing workstreams) **And** the channel is created via REST API and appears in the table.

3. **Given** a channel exists **When** the admin clicks the toggle **Then** the channel's `isActive` status flips (active↔inactive) via `PATCH` **And** the table reflects the updated status immediately **And** inactive channels pause ingestion.

4. **Given** a channel exists **When** the admin clicks "Remove" **Then** a confirmation dialog appears **And** on confirm the channel is deleted via `DELETE` **And** the table updates.

5. **Given** the admin submits a channel **When** the Slack Channel ID format is invalid **Then** the API returns 400 with field-level error details **And** the form shows inline validation error.

6. **Given** a non-admin user **When** they attempt to access any `/admin/channels` endpoint **Then** they receive 403 Forbidden.

7. **Given** the admin submits a duplicate Slack Channel ID **When** the unique constraint is violated **Then** the API returns 409 Conflict with a clear message **And** the form shows the error.

8. **Given** the admin edits a channel **When** they change the name or workstream **Then** the channel is updated via `PATCH` **And** the table reflects changes. The Slack Channel ID is not editable after creation.

## Tasks / Subtasks

- [ ] Task 1: Create `ChannelsService` with CRUD operations (AC: #1, #2, #3, #4, #5, #7, #8)
  - [ ] 1.1 Create `apps/api/src/modules/admin/channels/channels.service.ts` with `findAll()`, `create()`, `update()`, `remove()`, `toggleActive()`
  - [ ] 1.2 `findAll()` returns channels with joined workstream name, ordered by name
  - [ ] 1.3 `create()` validates workstream ID exists (400 if not), wraps insert in try/catch for unique constraint → `ConflictException`
  - [ ] 1.4 `update()` accepts partial update (name, workstreamId, isActive) but NOT slackChannelId; throws `NotFoundException` if id invalid
  - [ ] 1.5 `remove()` deletes by id, throws `NotFoundException` if not found
  - [ ] 1.6 Write `channels.service.spec.ts` with mocked DB: findAll shape, create with valid/duplicate/invalid-workstream, update, remove, toggle, not-found cases
- [ ] Task 2: Create `ChannelsController` with REST endpoints (AC: #1, #2, #3, #4, #5, #6, #7, #8)
  - [ ] 2.1 Create `apps/api/src/modules/admin/channels/channels.controller.ts` at route `admin/channels` with `@Roles('ADMIN')`
  - [ ] 2.2 `GET /` → `findAll()` → `{ data: channels[] }`
  - [ ] 2.3 `POST /` → `create()` with `ZodValidationPipe(createChannelSchema)` → `{ data: channel }` with `201`
  - [ ] 2.4 `PATCH /:id` → `update()` with `ParseUUIDPipe` + `ZodValidationPipe(updateChannelSchema)` → `{ data: channel }`
  - [ ] 2.5 `PATCH /:id/toggle` → `toggleActive()` → `{ data: channel }`
  - [ ] 2.6 `DELETE /:id` → `remove()` with `ParseUUIDPipe` → `204 No Content`
  - [ ] 2.7 Write `channels.controller.spec.ts`: ROLES_KEY metadata, service delegation, status codes, pipe validation
- [ ] Task 3: Register channels feature in AdminModule (AC: #6)
  - [ ] 3.1 Import `ChannelsController` and `ChannelsService` into `apps/api/src/modules/admin/admin.module.ts`
- [ ] Task 4: Enhance Slack Channel ID validation in shared schema (AC: #5)
  - [ ] 4.1 Update `packages/shared/src/schemas/channel.schema.ts` — add regex validation `.regex(/^[CGD][A-Z0-9]{8,}$/)` to `slackChannelId` field with descriptive error message
  - [ ] 4.2 Update `packages/shared/src/schemas/channel.schema.spec.ts` — add tests for valid IDs (`C01ABC123`, `G01ABC123`, `D01ABC123`), invalid (lowercase, wrong prefix, too short, special chars)
- [ ] Task 5: Create `use-channels` TanStack Query hooks (AC: #1, #2, #3, #4, #8)
  - [ ] 5.1 Create `apps/web/src/hooks/use-channels.ts` with `useChannels()`, `useCreateChannel()`, `useUpdateChannel()`, `useToggleChannel()`, `useDeleteChannel()`
  - [ ] 5.2 Query key: `['admin', 'channels']`; reuse `['admin', 'workstreams']` from `use-roster.ts` for workstream dropdown
  - [ ] 5.3 All mutations invalidate `['admin', 'channels']` on success; success/error toasts matching roster pattern
- [ ] Task 6: Create `ChannelsTable` component (AC: #1, #3, #4)
  - [ ] 6.1 Create `apps/web/src/components/channels/channels-table.tsx` — Shadcn `Table` with columns: Name, Slack Channel ID, Workstream, Status badge (Active green / Inactive gray), Actions
  - [ ] 6.2 Actions column: Edit (outline button), Toggle active/inactive (switch or button), Remove (destructive + `AlertDialog` confirmation)
  - [ ] 6.3 All columns sortable (client-side sort with chevron indicators) — learn from 1.6 review: ALL columns must be sortable per AC
  - [ ] 6.4 Loading state with `Skeleton` rows; error state with `Alert`; empty state message
  - [ ] 6.5 Write `channels-table.test.tsx`: renders rows, sort toggle, remove dialog confirmation, delete on confirm, toggle active/inactive
- [ ] Task 7: Create `ChannelFormDialog` component (AC: #2, #5, #7, #8)
  - [ ] 7.1 Create `apps/web/src/components/channels/channel-form-dialog.tsx` — Shadcn `Dialog` with fields: Slack Channel ID (`Input`, disabled in edit mode), Channel Name (`Input`), Workstream (`Select` dropdown from workstreams query), Active (`Checkbox`, default true)
  - [ ] 7.2 Client-side validation with `safeParse(createChannelSchema)` on submit; inline field errors (`text-sm text-red-500`)
  - [ ] 7.3 Map server 400 `details[]` to inline field errors (lesson from 1.6 review)
  - [ ] 7.4 Handle 409 Conflict — show "A channel with this Slack ID already exists" error
  - [ ] 7.5 Submit disabled during async save; form reset on dialog close; `onInteractOutside` prevented during submission
  - [ ] 7.6 Error catch handles both `Error` instances and non-Error rejects (lesson from 1.6 review)
  - [ ] 7.7 Write `channel-form-dialog.test.tsx`: fields render, Slack ID disabled in edit, create/update payloads validated, validation errors shown, conflict error displayed, submit disabled during save
- [ ] Task 8: Wire Channels tab in Admin route (AC: #1)
  - [ ] 8.1 Update `apps/web/src/routes/admin.tsx` — replace placeholder text in Channels tab with `ChannelsTabContent` component (follow `RosterTabContent` pattern)
  - [ ] 8.2 `ChannelsTabContent` uses `useChannels()`, `useWorkstreams()`, `useCreateChannel()`, `useUpdateChannel()`, `useToggleChannel()`, `useDeleteChannel()`
  - [ ] 8.3 "Add Channel" button (secondary/outline style per UX spec), Edit triggers dialog in edit mode
- [ ] Task 9: Full test suite validation and build (AC: all)
  - [ ] 9.1 Run `pnpm test` at root — all existing + new tests pass (no regressions)
  - [ ] 9.2 Run `pnpm build` — clean build with no errors
  - [ ] 9.3 Verify Slack Channel ID regex validation works end-to-end (shared schema → API pipe → frontend form)

## Dev Notes

### Architecture Requirements

- **Backend:** NestJS module at `apps/api/src/modules/admin/channels/` — `channels.controller.ts`, `channels.service.ts`, colocated `*.spec.ts`
- **Frontend:** Components at `apps/web/src/components/channels/` — `channels-table.tsx`, `channel-form-dialog.tsx`, colocated `*.test.tsx`
- **Hooks:** `apps/web/src/hooks/use-channels.ts`
- **Route:** Update existing `apps/web/src/routes/admin.tsx` (replace Channels tab placeholder)
- **Shared schemas:** `packages/shared/src/schemas/channel.schema.ts` already exists with `createChannelSchema`, `updateChannelSchema`, `channelSchema` — enhance with regex
- **DB schema:** `packages/db/src/schema/channels.ts` already exists with `slackChannels` table, relations, and types — no migrations needed
- **No new migrations needed** — `slack_channels` table created in story 1.2

### Existing Code to Reuse (DO NOT REINVENT)

- **`ZodValidationPipe`** at `apps/api/src/common/pipes/zod-validation.pipe.ts` — use for POST/PATCH body validation
- **`DATABASE_TOKEN`** from `apps/api/src/database/database.module.ts` — inject `Database` via `@Inject(DATABASE_TOKEN)`
- **`@Roles('ADMIN')`** decorator at `apps/api/src/modules/auth/decorators/roles.decorator.js` — apply at controller level
- **`ParseUUIDPipe`** from `@nestjs/common` — apply on all `:id` params (lesson from 1.6 review)
- **`api` client** at `apps/web/src/lib/api-client.ts` — handles auth, 204 empty body, error normalization
- **Sonner toasts** — already configured with `<Toaster />` in `__root.tsx`
- **Shadcn components** already installed: `Dialog`, `Input`, `Label`, `Select`, `Table`, `AlertDialog`, `Button`, `Tabs`
- **`useWorkstreams()`** from `apps/web/src/hooks/use-roster.ts` — reuse for workstream dropdown (query key `['admin', 'workstreams']`)
- **TanStack Query** — `QueryClientProvider` already in `main.tsx`

### DB Schema (already exists in `packages/db/src/schema/channels.ts`)

```
slack_channels:
  id          uuid PK (defaultRandom)
  slack_channel_id  text NOT NULL (unique index)
  name        text NOT NULL
  workstream_id     uuid NOT NULL FK → workstreams.id (indexed)
  is_active   boolean NOT NULL default true (indexed)
  created_at  timestamp with tz NOT NULL defaultNow
```

Relations: `slackChannels.workstreamId` → `workstreams.id` (many-to-one)

### Shared Zod Schemas (already exist in `packages/shared/src/schemas/channel.schema.ts`)

- `createChannelSchema`: `{ slackChannelId, name, workstreamId (uuid), isActive (default true) }`
- `updateChannelSchema`: partial of create, omits `slackChannelId`
- `channelSchema`: full entity with `id` and `createdAt`
- Types already exported from `packages/shared/src/types/index.ts`: `CreateChannel`, `UpdateChannel`, `Channel`

**Enhancement needed:** Add Slack channel ID format regex `/^[CGD][A-Z0-9]{8,}$/` to `slackChannelId` field in `createChannelSchema`. Slack IDs start with `C` (public), `G` (private/group), or `D` (DM) followed by 8+ uppercase alphanumeric chars (e.g., `C01ABC123`).

### API Response Contract (mandatory)

- Success list: `{ data: Channel[] }`
- Success single: `{ data: Channel }`
- Error: `{ statusCode, error, message, details?: [{ field, message }] }`
- Delete: `204 No Content` (empty body)
- The frontend `api-client.ts` already handles 204 empty body and wraps `{ data }` — hooks must unwrap `.then(r => r.data)`

### Naming Conventions

- Files: **kebab-case** — `channels.service.ts`, `channels-table.tsx`, `use-channels.ts`
- Classes: **PascalCase** — `ChannelsService`, `ChannelsController`
- Routes: **kebab-case**, plural — `/admin/channels`, `/admin/channels/:id`
- DB: **snake_case** — `slack_channels`, `slack_channel_id`
- API JSON: **camelCase** — Drizzle auto-maps
- ESM imports: use `.js` extension on local imports in API (`import { Foo } from './bar.js'`)

### Testing Requirements

- **API:** Vitest, colocated `*.spec.ts`. Mock DB with injected `DATABASE_TOKEN`. Test: findAll shape, create (valid, duplicate → 409, invalid workstream → 400), update (valid, not found → 404), remove (valid, not found → 404), toggle. Verify `@Roles('ADMIN')` metadata on controller.
- **Frontend:** Vitest + `@testing-library/react`, colocated `*.test.tsx`. Each test gets fresh `QueryClient` (lesson from 1.6). Mock `api` from `@/lib/api-client`. Test-setup shims for `window.matchMedia` and `scrollIntoView` already in `apps/web/src/test-setup.ts`.
- **Shared:** Tests already exist in `channel.schema.spec.ts` — extend with regex validation cases.
- **Mock UUIDs must be valid UUIDs** (not short strings like `'w1'`) — Zod rejects them (lesson from 1.6).

### Lessons from Story 1.6 (Roster) — APPLY THESE

1. **`ParseUUIDPipe`** on all `:id` params — prevents 500 on malformed UUIDs
2. **`ConflictException`** for unique constraint violations — catch DB error code `23505` → 409
3. **Validate FK references** (workstream IDs) before insert/update — 400 not 500
4. **Map server `details[]`** to inline field errors in form
5. **Handle non-Error rejects** in catch blocks — `catch (err: unknown)`
6. **Submit disabled during async** — prevent double-submit
7. **`onInteractOutside` handling** during submission
8. **Form reset on dialog close**
9. **All table columns sortable** when AC says so
10. **204 response handling** — `api-client.ts` already fixed to return `undefined` for 204

### Roster Pattern to Follow (Reference Implementation)

The channels feature mirrors roster almost exactly. Key files to reference:
- Controller: `apps/api/src/modules/admin/roster/roster.controller.ts`
- Service: `apps/api/src/modules/admin/roster/roster.service.ts`
- Hooks: `apps/web/src/hooks/use-roster.ts`
- Table: `apps/web/src/components/roster/roster-table.tsx`
- Form: `apps/web/src/components/roster/member-form-dialog.tsx`
- Route: `apps/web/src/routes/admin.tsx` → `RosterTabContent` pattern

### Project Structure Notes

- All paths align with architecture directory tree
- No new Shadcn components needed — all already installed from story 1.6
- `packages/db` schema already exports `slackChannels` and relations — no schema changes needed
- `packages/shared` already exports `Channel` types — only need regex enhancement

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.7 Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — Admin modules, API patterns, DB schema]
- [Source: _bmad-output/planning-artifacts/prd.md — FR30, FR40, NFR13 admin restrictions]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Journey 4, Admin tabs, Table/Button patterns]
- [Source: _bmad-output/implementation-artifacts/1-6-team-roster-management.md — Code patterns, review learnings]
- [Source: Slack API docs — Channel ID format: ^[CGD][A-Z0-9]{8,}$]

## Dev Agent Record

### Agent Model Used

Opus 4.6

### Debug Log References

- channel-form-dialog.test.tsx conflict test moved to edit mode due to Radix Select limitations in jsdom
- validChannel test data updated from `C0ABC123` (7 chars after prefix) to `C01ABC123` (8 chars) to match new regex

### Completion Notes List

- All 9 tasks completed: full backend CRUD, shared schema regex, frontend hooks/components/tests
- Build clean (0 errors), 76 tests pass (50 API + 47 shared, 76 web — some cached)
- Slack Channel ID regex `/^[CGD][A-Z0-9]{8,}$/` enforced at schema, API, and frontend levels
- Channels feature mirrors Roster pattern exactly per architecture spec

### File List

**New files:**
- `apps/api/src/modules/admin/channels/channels.service.ts`
- `apps/api/src/modules/admin/channels/channels.service.spec.ts`
- `apps/api/src/modules/admin/channels/channels.controller.ts`
- `apps/api/src/modules/admin/channels/channels.controller.spec.ts`
- `apps/web/src/hooks/use-channels.ts`
- `apps/web/src/components/channels/channels-table.tsx`
- `apps/web/src/components/channels/channels-table.test.tsx`
- `apps/web/src/components/channels/channel-form-dialog.tsx`
- `apps/web/src/components/channels/channel-form-dialog.test.tsx`

**Modified files:**
- `apps/api/src/modules/admin/admin.module.ts` — added ChannelsController + ChannelsService
- `apps/web/src/routes/admin.tsx` — replaced Channels tab placeholder with ChannelsTabContent
- `packages/shared/src/schemas/channel.schema.ts` — added regex to slackChannelId
- `packages/shared/src/schemas/channel.schema.spec.ts` — updated tests for regex, fixed test data

### Change Log

- 2026-05-07: Story 1.7 implemented — full channel configuration CRUD with admin UI
