# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-05-07

### Added

- **Thread Ingestion & Storage (Story 2.2):** `IngestionService` that polls active Slack channels, identifies thread-starting messages, fetches all replies, and stores threads + individual messages in the database. Idempotent upsert via `ON CONFLICT DO UPDATE` on composite unique `(slack_team_id, channel_id, thread_ts)`. Per-thread transaction isolation — one thread failure does not block others. Participant ID extraction from thread messages. Drizzle schema for `slack_threads` (10 columns, 3 indexes) and `thread_messages` (6 columns, cascade delete FK). Zod schemas for thread/message DTOs and ingestion summary.
- **Slack History Upload (Workaround):** Manual import path for populating thread data from Slack workspace exports, bypassing the need for a live Slack API connection. `ImportService` groups exported messages into threads by `thread_ts`, transforms to internal format, and reuses the same transactional upsert pattern. `ImportController` at `POST /admin/channels/:id/import` with Zod validation. Frontend "Import History" tab in Admin page with channel selector, Slack Team ID input, multi-file JSON picker, result summary display, and step-by-step Slack export instructions. Idempotent — re-uploading the same files updates existing threads without duplicates.

### Infrastructure

- Database migration `0002_gorgeous_starjammers` adds `slack_threads` and `thread_messages` tables with foreign keys, composite unique index, and supporting indexes.
- `IngestionModule` registered in `AppModule` providing both `IngestionService` and `ImportService`.

## [0.2.0] - 2026-05-07

### Added

- **Slack API Client (Story 2.1):** `SlackClientService` with `@slack/web-api` SDK integration; Bot Token authentication (`xoxb-*`); graceful degradation when `SLACK_BOT_TOKEN` not configured; connection testing via `auth.test()`; channel history retrieval (`conversations.history`); thread reply fetching (`conversations.replies`); channel info lookup (`conversations.info`); robust retry logic with exponential backoff and jitter; Slack rate-limit handling with `Retry-After` header support; error sanitization to prevent token exposure in logs; `SlackModule` registered as shared provider.
- **Epic 1 Retrospective:** Completed post-epic review documenting successes, challenges, and preparation plan for Epic 2.

### Infrastructure

- `SLACK_BOT_TOKEN` and `SLACK_TEAM_ID` added to environment config validation (optional).
- Slack SDK built-in retries disabled in favor of custom retry logic with better rate-limit awareness.

## [0.1.0] - 2026-05-07

### Added

- **Role-Based Access Control (Story 1.4):** Backend RBAC with `@Roles()` decorator and `RolesGuard` for endpoint protection; TanStack Router file-based routing with role-gated admin routes; `/access-denied` page for unauthorized users; role utility helpers (`isAdmin`, `getRoleBadge`).
- **Dashboard Shell & Navigation (Story 1.5):** Application header with branding, role badge, and logout button; responsive navigation bar with role-gated Admin link; Red Hat font family integration; Shadcn/ui component foundation (Badge, Button, Tabs, Skeleton); skip-to-content accessibility link; dynamic page titles.
- **Team Roster Management (Story 1.6):** Full admin CRUD for team members — `RosterService` and `RosterController` with `ZodValidationPipe`, `ParseUUIDPipe`, `ConflictException` for duplicates, workstream FK validation; `RosterTable` component with sortable columns and remove confirmation dialog; `MemberFormDialog` with client-side Zod validation, inline field errors, server error mapping, and double-submit protection; TanStack Query hooks with cache invalidation and toast notifications; `DatabaseModule` for Drizzle ORM injection; Sonner toast integration.
- **Channel Configuration (Story 1.7):** Full admin CRUD for Slack channel configuration — `ChannelsService` and `ChannelsController` with active/inactive toggle, duplicate Slack ID detection (409 Conflict), workstream FK validation; `ChannelsTable` component with sortable columns, status badges, and toggle/remove actions; `ChannelFormDialog` with Slack ID disabled in edit mode, conflict error handling; Slack Channel ID regex validation (`/^[CGD][A-Z0-9]{8,}$/`) enforced at schema, API, and frontend levels; TanStack Query hooks with cache invalidation and toast notifications.
- **Help & Documentation Page:** In-app help page (`/help`) with sections for Overview, Getting Started, Features, Roles & Permissions, and Changelog; responsive sidebar navigation with mobile dropdown; Help link in global navigation bar.
- **Application Footer:** Global footer displaying application name, Help link, and version number (`v0.1.0`); version injected at build time via Vite `define`.

### Infrastructure

- Keycloak OIDC authentication (Story 1.3, previously committed).
- Database schema with Drizzle ORM (Story 1.2, previously committed).
- Monorepo scaffold with Turborepo + pnpm workspaces (Story 1.1, previously committed).
