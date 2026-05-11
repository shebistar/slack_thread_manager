# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.1] - 2026-05-11

### Changed

- **Self-Contained OpenShift E2E Test:** `deploy/test-pipeline.sh` no longer requires manual `TOKEN`, `BASE_URL`, or `WEB_URL` environment variables. The script now handles `oc login` to the OpenShift cluster and obtains a JWT from Keycloak automatically. Run with a single command: `./deploy/test-pipeline.sh`.
- **Keycloak Realm Restoration:** Rebuilt Keycloak realm (`slack-thread-manager`), client (`slack-thread-manager-web` with PKCE + role mapper), user profile (custom `role` attribute), and test user (`shebi` / ADMIN) after tables were dropped by the previous `drizzle-kit push` incident.

## [0.8.0] - 2026-05-11

### Added

- **On-Demand Briefing Generation Endpoint:** `POST /api/admin/briefings/generate` — allows admins to trigger briefing generation without waiting for the daily cron schedule; enables E2E testing workflows and manual briefing refreshes.
- **E2E Smoke Test — Full Briefing Chain:** Extended `deploy/test-pipeline.sh` from a 6-step pipeline smoke test to a comprehensive 10-step E2E test covering: health checks → channel listing → test data import → full pipeline run → roster verification → staging approval (bulk + individual flagged items) → briefing generation → briefing API verification → web UI reachability check with manual verification checklist.
- **Richer Test Data:** Smoke test now imports 8 realistic messages across 3 threads (authentication refactoring, sprint planning, customer demo feedback) instead of 3 minimal messages, producing meaningful briefing content for visual verification.
- **Web UI Verification Step:** New `WEB_URL` environment variable for the smoke test; when set, checks web UI reachability and prints a manual verification checklist for browser-based briefing display validation.
- **Staging Approval Automation in E2E:** Smoke test auto-approves clean staging items via `approve-all-clean`, then individually approves any remaining flagged items to ensure the full pipeline chain completes.

### Changed

- **Smoke Test Title:** Renamed from "Pipeline Smoke Test" to "E2E Pipeline Smoke Test" to reflect the expanded scope.
- **Pipeline Step Output:** Step 5 now reports staging results (`threadsStaged`, `batchId`) in addition to classification, summarization, embedding, and correlation metrics.

## [0.7.0] - 2026-05-11

### Added

- **Daily Briefings — Epic 5:** Briefing generation service with scheduled cron job (`BRIEFING_CRON_SCHEDULE`, default 4:00 AM UTC); role-to-shape mapping (PM → `filtered_brief`, Architect/Consultant → `intelligence_report`, Sales/Training/Admin → `executive_scan`); idempotent generation with duplicate prevention; `approved` → `delivered` state transitions.
- **Executive Scan Dashboard Layout (Story 5.2):** Stats bar with thread/workstream/action counts; workstream status table with latest activity timestamps; key decisions panel with compact briefing cards; loading skeletons.
- **Filtered Brief Feed Layout (Story 5.3):** Workstream filter pills; featured card for highest-priority item; responsive grid; items scoped to user's assigned workstreams only.
- **Intelligence Report Split Panel (Story 5.4):** Selectable topic list with side panel; collapsible panel with AI enrichment placeholder (Epic 8); priority-sorted by item type.
- **Briefing Cards:** Compact/standard/featured variants with headline, summary text, workstream badge, item type indicator (`cross_workstream`, `orphaned_action`, `standard`, `gone_quiet`), Slack deep links, message count, participant count, and latest activity timestamp.
- **Freshness Indicators:** Generation timestamp with relative time, stale-data warning banner (>24h), next-batch countdown derived from cron schedule.
- **Briefing API:** `GET /api/briefings/today` returns today's briefing for the authenticated user with all items, metadata, and `nextBatchScheduledAt`.

## [0.6.0] - 2026-05-10

### Added

- **Anonymization & Content Governance — Epic 4:** Blocklist-based PII scanning, LLM entity detection, staging queue gate, admin review interface, and blocklist management.
- **Anonymization Blocklist (Story 4.1):** Admin-managed term blocklist; exact-match scanning of thread content against blocklist terms.
- **LLM Entity Detection (Story 4.2):** AI-powered sensitive entity detection augmenting the static blocklist; Zod-validated LLM output parsing.
- **Staging Queue & Pipeline Gate (Story 4.3):** Threads pass through staging review before becoming visible; `staged` → `approved` pipeline state transition on approval; batch tracking with UUIDs.
- **Admin Staging Review Interface (Story 4.4):** Pending/flagged item listing with counts; individual approve/reject; bulk approve-all-clean; batch progress tracking; workstream filtering.
- **Blocklist Management (Story 4.5):** Full CRUD for blocklist terms; quick-add from staging review; edit dialog with no-op detection; cache invalidation across staging and blocklist queries.

## [0.5.0] - 2026-05-08

### Added

- **LLM Abstraction Layer (Story 3.1):** Provider-agnostic `LlmService` behind `LlmProviderInterface`; `CpuModelProvider` for local OpenAI-compatible inference (Ollama / phi3:mini); `GeminiProvider` for Google Gemini 2.5 Flash fallback via `@google/generative-ai` SDK; 2 + 2 retry-then-fallback strategy before throwing `LlmPendingRetryError`; `LlmModule` + `PipelineModule` registered in the NestJS module hierarchy; batch-level fallback rate tracking with configurable `LLM_FALLBACK_RATE_THRESHOLD` warning.
- **Separate Embedding Model Config:** `CPU_EMBED_MODEL_NAME` env var (default: `nomic-embed-text`) decoupled from the completion model (`CPU_MODEL_NAME`), allowing different Ollama models for completion vs. embedding workloads.
- **LLM Health Endpoint:** `GET /api/admin/llm/health` — returns per-provider `healthy` status and an aggregated `ok | degraded` state; requires `ADMIN` role.

### Changed

- **Model Defaults Updated to Deployment Targets:** CPU completion default `mistral` → `phi3:mini`; Gemini default `gemini-pro` → `gemini-2.5-flash`; LLM timeout default `30 s` → `60 s` to accommodate phi3:mini cold-start latency.
- **Architecture — Dual Ingestion Parity:** Text-paste import is now the primary ingestion mode; all downstream pipeline features must work identically regardless of ingestion source. E2E validation with real data is mandatory per story.

### Infrastructure

- `@google/generative-ai` SDK added as `apps/api` dependency.
- `LlmModule` exports `CpuModelProvider` and `GeminiProvider` directly for injection in `AdminModule`.
- E2E validation requirement and text-paste-as-primary-mode policy encoded in `project-context.md`, `epics.md`, and BMAD `bmad-dev-story.toml` / `bmad-create-story.toml` customizations.

## [0.4.0] - 2026-05-08

### Added

- **Batch Polling Job (Story 2.3):** `PollingJob` with `@Cron` decorator and per-channel `last_polled_ts` watermark; `ingestChannel()` / `ingestThread()` on `IngestionService` with idempotent upserts; `@nestjs/schedule` registered in `AppModule`; `INGESTION_CRON_SCHEDULE` env var (default: every 4 hours).
- **Thread Update Detection (Story 2.4):** Two-phase polling that detects and re-ingests modified threads; `SlackMessage.latestReply` mapped from Slack raw payload; `IngestionService.detectUpdatedThreads()` fetches `latest_reply` via `conversations.replies(limit:1)` and re-ingests if the stored `latestReplyTs` changed; `ingestThread()` returns `'ingested' | 'skipped'` with a skip-if-unchanged guard; Phase 2 errors isolated so they cannot block watermark advancement.
- **Historical Backfill API (Story 2.5):** Admin-triggered one-time historical ingestion; `POST /api/admin/ingestion/backfill` (HTTP 202, returns `jobId`); `GET /api/admin/ingestion/backfill/:jobId` for async status polling (`pending` / `running` / `complete` / `failed`); `BackfillService` with in-memory job registry; `BackfillController` with `@Roles('ADMIN')` and `ZodValidationPipe`; `backfillRequestSchema` in `packages/shared` for validated `channelId` + optional `oldestTs`.
- **Text-Paste Import CLI:** Rewrote Slack text parser to handle the real UI copy-paste format (display name on its own line, indented timestamp on the next); `packages/db/src/import-text.ts` script + `scripts/import-text.sh` wrapper for bulk CLI imports via OpenShift `oc port-forward`; text-paste elevated to the primary ingestion path going forward.

### Infrastructure

- Database migration `0004` adds `last_polled_ts` column to `slack_channels`.
- Database migration `0005` adds `pipeline_state` text column to `slack_threads` (placeholder for the pgEnum introduced in Story 3.2).
- `@nestjs/schedule` added as dependency; cron job registered in `IngestionModule`.

## [0.3.0] - 2026-05-07

### Added

- **Thread Ingestion & Storage (Story 2.2):** `IngestionService` that polls active Slack channels, identifies thread-starting messages, fetches all replies, and stores threads + individual messages in the database. Idempotent upsert via `ON CONFLICT DO UPDATE` on composite unique `(slack_team_id, channel_id, thread_ts)`. Per-thread transaction isolation — one thread failure does not block others. Participant ID extraction from thread messages. Drizzle schema for `slack_threads` (10 columns, 3 indexes) and `thread_messages` (6 columns, cascade delete FK). Zod schemas for thread/message DTOs and ingestion summary.
- **Slack History Upload (Workaround):** Manual import path for populating thread data from Slack workspace exports, bypassing the need for a live Slack API connection. `ImportService` groups exported messages into threads by `thread_ts`, transforms to internal format, and reuses the same transactional upsert pattern. `ImportController` at `POST /admin/channels/:id/import` with Zod validation. Frontend "Import History" tab in Admin page with channel selector, Slack Team ID input, **Paste Text mode** for copy-pasting messages directly from Slack's UI (auto-parsed), JSON file upload mode, result summary display, and step-by-step instructions. Idempotent — re-importing the same data updates existing threads without duplicates.

### Changed

- **Channel-Workstream Mapping:** Workstream assignment on channels is now optional — channels can be general-purpose (not tied to a specific workstream). The "Add Channel" form defaults to "None (general purpose)" and the Channels table shows "General" for unassigned channels.

### Infrastructure

- Database migration `0002_gorgeous_starjammers` adds `slack_threads` and `thread_messages` tables with foreign keys, composite unique index, and supporting indexes.
- Database migration `0003_busy_dracula` makes `workstream_id` nullable on `slack_channels`.
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
