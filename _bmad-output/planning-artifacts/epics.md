---
stepsCompleted:
  - "step-01-validate-prerequisites"
  - "step-02-design-epics"
  - "step-03-create-stories"
  - "step-04-final-validation"
status: 'complete'
completedAt: '2026-05-06'
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
---

# slack_thread_manager - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for slack_thread_manager, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: System can ingest Slack threads from configured project channels using batch polling
FR2: System can detect and ingest new replies or activity on previously ingested threads
FR3: System can backfill Slack message history from before the system was deployed
FR4: System can operate in read-only mode, never posting to or modifying Slack channels
FR5: System can classify ingested threads by topic and workstream
FR6: System can identify participant roles within threads based on the team roster
FR7: System can generate plain-language summaries of technical discussions for non-technical personas
FR8: System can detect cross-workstream connections where the same topic appears across multiple channels
FR9: System can identify orphaned actions — commitments or questions with no follow-up or resolution
FR10: System can generate personalized daily briefings filtered by the recipient's role
FR11: Architects can receive briefings highlighting cross-workstream technical patterns and source-linked thread summaries
FR12: PMs can receive briefings with plain-language summaries, orphaned actions, and "Gone Quiet" flags
FR13: Each briefing item can link directly to the original Slack thread as the source of truth
FR14: New team members can receive a backfill briefing covering activity from before they joined, scoped to their role and workstream
FR15: Team members can search across the entire thread corpus using natural language queries
FR16: Search results can include sourced answers with direct links to the original Slack threads
FR17: Search results can be returned regardless of which channel the original discussion occurred in
FR18: System can detect topics that were actively discussed and then went quiet beyond a configurable threshold
FR19: PMs can view a "Gone Quiet" dashboard showing topics that have dropped off discussion
FR20: System can apply workday-aware thresholds that exclude weekends and non-working days from silence calculations
FR21: Admin can configure silence detection thresholds per workstream
FR22: System can automatically scan briefing content against a maintained blocklist of known customer identifiers
FR23: System can use LLM-assisted entity detection to identify customer references the blocklist might miss
FR24: Admin can review flagged briefings in a staging interface before they are delivered to team members
FR25: Admin can approve or reject briefings in the staging pipeline
FR26: Admin can add new terms to the anonymization blocklist
FR27: System can replace customer company names, personnel names, private URLs, account identifiers, and infrastructure IPs with anonymized equivalents
FR28: No briefing or search result can be delivered to team members without passing through the anonymization staging pipeline
FR29: Admin can create and manage a team roster mapping names, Slack handles, and common nicknames to roles
FR30: Admin can configure which Slack channels the system monitors for ingestion
FR31: Admin can add new team members to the roster and assign them roles
FR32: Admin can modify silence detection thresholds
FR33: Admin can manage the anonymization blocklist
FR34: Team members can access the system through a web-based dashboard
FR35: Team members must authenticate before accessing any system content
FR36: The dashboard can display different views based on the authenticated user's role
FR37: Team members can view their daily briefings through the dashboard
FR38: Team members can perform natural language searches through the dashboard
FR39: PMs can view the "Gone Quiet" silence detection dashboard
FR40: Admin can access roster management, channel configuration, anonymization staging, silence threshold tuning, and blocklist management through the dashboard

### NonFunctional Requirements

NFR1: Batch ingestion pipeline must process a full day's thread volume (~10 threads across ~4 channels) within a single batch cycle window
NFR2: Natural language search queries must return sourced results in under 5 seconds
NFR3: Daily briefing generation for all active roles must complete before the start of the earliest team member's workday (accounting for India timezone — earliest start)
NFR4: SPA initial page load must complete in under 3 seconds
NFR5: Client-side navigation between dashboard views must complete in under 500ms
NFR6: Anonymization staging pipeline (blocklist scan + LLM entity detection) must complete per briefing within the batch cycle window
NFR7: All dashboard routes must require authentication — no anonymous access to any system content
NFR8: All data in transit between the SPA and backend API must be encrypted via HTTPS/TLS
NFR9: Encryption at rest is not required for V1 — the OpenShift cluster's existing security posture is sufficient
NFR10: Slack bot token must be stored securely and never exposed in client-side code or logs
NFR11: The anonymization staging pipeline must gate all output — no briefing or search result reaches users without passing through the pipeline
NFR12: System must never write to Slack channels or modify any Slack data (Silent Observer enforcement)
NFR13: Admin operations (roster, channel config, anonymization review, blocklist) must be restricted to the admin role
NFR14: System must integrate with Slack API using a read-only bot token for thread ingestion
NFR15: System must handle Slack API rate limits gracefully — retry with backoff, no data loss on throttling
NFR16: System must support automatic fallback to Gemini Pro when the primary CPU-only LLM produces output below the quality threshold for classification or summarization
NFR17: LLM integration must be abstracted so the underlying model can be swapped without changing the processing pipeline
NFR18: Slack API version changes must not silently break ingestion — the system should detect and surface API compatibility issues
NFR19: A system outage of up to one day or a weekend is acceptable — no high-availability requirement for V1
NFR20: If the system is down during a scheduled briefing cycle, briefings should be generated on the next successful run covering the missed period
NFR21: Ingested thread data must not be lost due to application crashes — data persistence must survive process restarts
NFR22: The batch ingestion pipeline must be idempotent — re-running a batch must not create duplicate threads or corrupt existing data

### Additional Requirements

- Starter template: Custom Turborepo Monorepo with NestJS — project initialization using `pnpm dlx create-turbo@latest` is the first implementation story
- Monorepo structure: apps/api (NestJS), apps/web (React 19 + Vite), packages/db (Drizzle), packages/shared (Zod schemas + types), packages/config (shared tooling)
- Red Hat SSO / Keycloak (OIDC) authentication — requires Keycloak deployment on OpenShift before API auth works
- PostgreSQL 17 with pgvector extension for semantic search embeddings and built-in full-text search (tsvector + GIN indexes)
- LLM abstraction layer: provider-agnostic interface with CPU model primary + Gemini Pro fallback, model version pinning, prompt versioning
- Worker identity: Keycloak client credentials grant for service-to-service auth (dedicated `slack-thread-manager-worker` client)
- Pipeline state machine: thread states (ingested → classified → summarized → embedded → staged → approved → delivered) with atomic transitions
- Idempotent ingestion: natural dedup key (slack_team_id + channel_id + thread_ts) with upsert strategy and per-channel watermark cursor
- Transactional boundaries defined per operation type (single thread ingestion, classification+summarization, embedding, staging, approval, briefing generation)
- Docker Compose for local development (PostgreSQL + pgvector + app)
- Multi-stage Dockerfile for OpenShift production deployment (Node.js 22 build → Node.js 22 slim runtime)
- CI/CD pipeline: turbo build → turbo test → container image push to OpenShift registry
- Health check endpoint (`/api/health`) for OpenShift readiness/liveness probes
- Structured JSON logging via NestJS Logger for OpenShift log aggregation
- Zod-validated environment configuration via @nestjs/config
- Drizzle ORM code-first migrations committed to repo for reproducible deployments
- NestJS events for internal module communication (dot-notation, past tense naming)
- TanStack Query for server state + Zustand for minimal client state
- TanStack Router with file-based type-safe routes
- Prompt management directory with golden fixtures for CI regression testing
- Confidence-based quality safeguards: below-threshold classifications flagged for manual review
- Pipeline failure tracking (pipeline_failures table) with error context for debugging
- Pipeline reprocessing admin endpoint (POST /api/admin/pipeline/reprocess)
- Fallback rate monitoring: warn if >50% of batch uses Gemini Pro fallback

### UX Design Requirements

UX-DR1: Three adaptive layout variants — Dashboard (Executive Scan for PM/Engagement Lead/Sales), News Feed (Filtered Brief for Project Managers), Split Panel (Intelligence Report for Lead Architect/Consultants) — role determines variant at login
UX-DR2: BriefingCard component with five states (unread, read, selected, flagged-quiet, expanded) and three variants (featured, compact, standard)
UX-DR3: StatsBar component with 4 stat cells showing semantic color-coded metrics (threads processed, active workstreams, gone quiet count, flags raised) for Executive Scan layout
UX-DR4: SilenceMonitor component — yellow-10 background panel showing "Gone Quiet" topics with days-silent count, participant count, and resolution status; empty state with green confirmation
UX-DR5: EnrichmentPanel component on blue-10 background with "AI-Assisted" teal badge; collapsible sections for OpenShift Documentation, Knowledge Base (NotebookLM), and Similar Past Discussions; activates on topic card selection in Intelligence Report layout
UX-DR6: StagingReviewItem component — flagged content preview with highlighted terms on red-10 background, flag source label (Blocklist match / LLM entity detection), original vs. anonymized comparison, approve/dismiss/add-to-blocklist actions with state transitions
UX-DR7: WorkstreamFilter component — horizontal pill-based filter row for workstream selection in Filtered Brief layout; "All Workstreams" default pill; active state blue-50 filled, inactive outlined
UX-DR8: Red Hat Design System color palette — brand red (ee0000), blue interactive (0066cc), semantic status colors (green-50/yellow-30/red-orange-50/teal-50), gray surface system (f2f2f2 → 151515), blue-10 AI distinction background
UX-DR9: Red Hat typography — Red Hat Display (headings, Medium 500), Red Hat Text (body, Regular 400), Red Hat Mono (code/technical, Regular 400); self-hosted .woff2 fonts; type scale from 32px H1 to 12px caption
UX-DR10: 8px spacing grid with tokens: space-xs (4px), space-sm (8px), space-md (16px), space-lg (24px), space-xl (32px), space-2xl (48px)
UX-DR11: Content separation pattern — Slack-sourced content on white (#ffffff), AI-generated content on blue-10 (#e0f0ff) with "AI-Assisted" teal badge, anonymized content flagged with red-10 inline highlights
UX-DR12: Read/unread state tracking — unread items at full opacity with 2px left border in workstream color; read items at opacity 0.6 with no border; state persists until next batch generates new briefing
UX-DR13: Deep-link pattern — every thread reference includes "View in Slack →" link in blue-50, opens in new tab (target="_blank"), placed consistently in card footer or meta row
UX-DR14: App header — Red Hat branding with brand red accent, role indicator badge showing current user's role, briefing freshness timestamp
UX-DR15: Persistent horizontal navigation bar (Briefing | Search | Admin) — active state: white text with red-50 underline; inactive: gray-30 text; Admin visible only to admin role
UX-DR16: Loading states using Shadcn Skeleton components matching expected content shapes (BriefingCard skeleton, StatsBar skeleton, EnrichmentPanel skeleton)
UX-DR17: Empty states with contextual messages and suggested actions for each context (no batch yet, no threads, no search results, no silence detected, no staging items, no card selected)
UX-DR18: Desktop-first responsive layout at three Tailwind breakpoints — lg (1024px): single column with stacked panel; xl (1280px): default optimal layout; 2xl (1536px): max-width with generous margins
UX-DR19: Baseline WCAG AA accessibility — semantic HTML elements, visible focus rings (blue-50, 2px offset), skip-to-content link, page title updates on navigation, aria-label on icon-only buttons
UX-DR20: Button hierarchy — Primary (red-50 bg, max one per screen), Secondary (blue-50 outline), Ghost (gray-50 text), Destructive (red-orange-50 outline + confirmation dialog), Link (blue-50 text)
UX-DR21: Feedback system — Shadcn Alert with semantic colors (Success green-10, Warning yellow-10, Error red-10, Info teal-10) plus transient toasts (bottom-right, auto-dismiss 5s for success, persist for errors)
UX-DR22: Freshness feedback — "Generated today at [time] from [X] threads across [Y] workstreams" on every briefing page; warning alert if >24h old; info alert if no batch has run
UX-DR23: "Gone Quiet" visual treatment — yellow-30 left border + yellow-10 background on flagged briefing cards; dedicated amber-accented Silence Monitor panel in Dashboard layout
UX-DR24: Expand/collapse interactions with 200ms ease-out CSS transitions; respects prefers-reduced-motion media query
UX-DR25: Backfill onboarding section — one-time display at top of first briefing for new consultants covering role-filtered summary of missed project history (key decisions, unresolved issues, unowned action items)

### FR Coverage Map

FR1: Epic 2 - Batch polling ingestion from configured channels
FR2: Epic 2 - Thread update detection (new replies/activity)
FR3: Epic 2 - Historical backfill of message history
FR4: Epic 2 - Read-only mode enforcement (Silent Observer)
FR5: Epic 3 - Thread classification by topic and workstream
FR6: Epic 3 - Participant role identification from roster
FR7: Epic 3 - Plain-language summarization for non-technical personas
FR8: Epic 3 - Cross-workstream connection detection
FR9: Epic 3 - Orphaned action identification
FR10: Epic 5 - Personalized role-filtered daily briefings
FR11: Epic 5 - Architect briefing shape (cross-workstream patterns, source links)
FR12: Epic 5 - PM briefing shape (plain-language, orphaned actions, silence flags)
FR13: Epic 5 - Source deep-linking to original Slack threads
FR14: Epic 8 - Backfill briefing for new team members
FR15: Epic 6 - Natural language search across thread corpus
FR16: Epic 6 - Sourced answers with direct thread links
FR17: Epic 6 - Cross-channel search results
FR18: Epic 7 - Silence detection (topics gone quiet beyond threshold)
FR19: Epic 7 - "Gone Quiet" dashboard for PMs
FR20: Epic 7 - Workday-aware thresholds (weekend exclusion)
FR21: Epic 7 - Per-workstream threshold configuration
FR22: Epic 4 - Blocklist scanning of briefing content
FR23: Epic 4 - LLM-assisted entity detection
FR24: Epic 4 - Admin staging review interface
FR25: Epic 4 - Approve/reject workflow in staging pipeline
FR26: Epic 4 - Add terms to anonymization blocklist
FR27: Epic 4 - Entity replacement with anonymized equivalents
FR28: Epic 4 - Mandatory staging gate enforcement (nothing bypasses)
FR29: Epic 1 - Team roster management (names, handles, nicknames → roles)
FR30: Epic 1 - Channel configuration for ingestion
FR31: Epic 1 - Add team members and assign roles
FR32: Epic 7 - Admin silence threshold modification
FR33: Epic 4 - Anonymization blocklist management
FR34: Epic 1 - Web-based dashboard access
FR35: Epic 1 - Authentication requirement for all content
FR36: Epic 1 - Role-based view differentiation
FR37: Epic 5 - Briefing viewing through dashboard
FR38: Epic 6 - Search interface through dashboard
FR39: Epic 7 - PM silence detection dashboard view
FR40: Epic 1 - Admin panel access (roster, channels, staging, thresholds, blocklist)

## Epic List

### Epic 1: Project Foundation & System Administration
Admin (Shebi) can deploy the system, authenticate team members via corporate SSO, configure Slack channels for monitoring, and manage the team roster with role assignments. Team members can authenticate and see their role-appropriate dashboard shell.
**FRs covered:** FR29, FR30, FR31, FR34, FR35, FR36, FR40

### Epic 2: Slack Data Ingestion
System silently ingests Slack threads from configured channels via scheduled batch polling, detects new activity on existing threads, and can backfill historical message data — all read-only. Admin can monitor ingestion health.
**FRs covered:** FR1, FR2, FR3, FR4

### Epic 3: Knowledge Transformation Pipeline
Ingested threads are transformed into classified, summarized, interconnected knowledge — identifying topics, workstreams, participant roles, cross-channel connections, and orphaned actions — with quality safeguards and Gemini Pro fallback.
**FRs covered:** FR5, FR6, FR7, FR8, FR9

### Epic 4: Anonymization & Content Governance
Admin ensures NDA compliance through a three-layer anonymization gate — every piece of generated content is automatically scanned, flagged, and queued for human review before any team member sees it. Nothing bypasses the gate.
**FRs covered:** FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR33

### Epic 5: Daily Briefings & Core Dashboard
Team members open the dashboard and see their personalized daily briefing — Architects get cross-workstream technical patterns (Split Panel), PMs get plain-language summaries with action queues (News Feed), and executives get workstream health at a glance (Dashboard). Every item links directly to the source Slack thread.
**FRs covered:** FR10, FR11, FR12, FR13, FR37

### Epic 6: Search & Discovery
Team members can ask natural language questions across the entire thread corpus and get sourced answers linked to original Slack threads — regardless of which channel the discussion happened in.
**FRs covered:** FR15, FR16, FR17, FR38

### Epic 7: Silence Detection & Monitoring
PMs can spot topics that were actively discussed and then went quiet — surfacing potential project risks before they become crises — through a passive "Gone Quiet" dashboard with workday-aware thresholds.
**FRs covered:** FR18, FR19, FR20, FR21, FR32, FR39

### Epic 8: AI Enrichment & Consultant Onboarding
Architects and Consultants get an AI research assistant in the Intelligence Report side panel — proactively linking related documentation, Knowledge Base entries, and similar past discussions. New consultants joining mid-project receive a backfill briefing covering what they missed, scoped to their role and workstream.
**FRs covered:** FR14
**UX-DRs covered:** UX-DR5, UX-DR25

## Dependency Flow

```
E1 → E2 → E3 → E4 ─┬─→ E5 (Core Briefings) ─┬─→ E7 (Silence, needs BriefingCard)
                     │                          └─→ E8 (Enrichment, needs Split Panel)
                     └─→ E6 (Search, parallel to E5)
```

- Epics 5 and 6 can be built in parallel (both need only E1–E4)
- Epic 7 must follow Epic 5 (uses BriefingCard component)
- Epic 8 must follow Epic 5 (enhances the Split Panel layout)

## Epic 1: Project Foundation & System Administration

Admin (Shebi) can deploy the system, authenticate team members via corporate SSO, configure Slack channels for monitoring, and manage the team roster with role assignments. Team members can authenticate and see their role-appropriate dashboard shell.

### Story 1.1: Monorepo Scaffold & Development Environment

As a **developer**,
I want a fully configured Turborepo monorepo with NestJS backend, React/Vite frontend, shared packages, and local PostgreSQL via Docker Compose,
So that all subsequent development has a consistent, working foundation.

**Acceptance Criteria:**

**Given** a fresh clone of the repository
**When** I run `pnpm install && docker-compose up -d && pnpm dev`
**Then** the NestJS API starts on port 3000 with a health endpoint returning `{ "status": "ok" }`
**And** the React SPA starts on port 5173 with a placeholder page
**And** PostgreSQL 17 with pgvector extension is running via Docker Compose
**And** Turborepo caching and parallel builds work (`pnpm build` succeeds)
**And** the monorepo structure includes `apps/api`, `apps/web`, `packages/db`, `packages/shared`, `packages/config`

### Story 1.2: Database Schema & Core Models

As a **developer**,
I want the core database tables (users, roles, workstreams, channels) defined in Drizzle ORM with working migrations,
So that the system can persist team and configuration data.

**Acceptance Criteria:**

**Given** the PostgreSQL database is running
**When** I run `pnpm db:migrate`
**Then** tables are created: `users`, `workstreams`, `slack_channels`, `user_workstreams`
**And** the `users` table includes columns: id, email, display_name, slack_handle, slack_nicknames (array), role (enum: ARCHITECT, PM, CONSULTANT, SALES, TRAINING, ADMIN), created_at, updated_at
**And** the `workstreams` table includes columns: id, name, description, created_at
**And** the `slack_channels` table includes columns: id, slack_channel_id, name, workstream_id (FK), is_active, created_at
**And** the `user_workstreams` join table links users to their assigned workstreams
**And** a development seed script creates sample data for local testing
**And** Zod schemas for these entities exist in `packages/shared`

### Story 1.3: Authentication with Keycloak OIDC

As a **team member**,
I want to authenticate using my Red Hat corporate SSO credentials,
So that I can access the system without managing separate passwords.

**Acceptance Criteria:**

**Given** a Keycloak realm is configured with the application as an OIDC client
**When** an unauthenticated user visits any dashboard route
**Then** they are redirected to Keycloak login
**And** after successful SSO authentication, they are redirected back to the app with a valid session
**And** the JWT contains the user's email, name, and role claims
**And** NestJS validates the JWT on every API request using `@nestjs/passport` with OIDC strategy
**And** invalid or expired tokens return 401 Unauthorized
**And** the Slack bot token and Keycloak client secret are stored in environment variables (never in client-side code)

### Story 1.4: Role-Based Access Control & Route Guards

As an **admin**,
I want routes and API endpoints protected by role-based access control,
So that team members only see what their role permits and admin operations are restricted.

**Acceptance Criteria:**

**Given** a user is authenticated with a role claim in their JWT
**When** they access an admin-only endpoint (roster, channel config)
**Then** only users with the ADMIN role are permitted (others receive 403 Forbidden)
**And** a custom `@Roles()` decorator is available for NestJS controllers
**And** a `RolesGuard` checks JWT role claims against required roles
**And** the frontend reads the user's role from the auth context and conditionally renders the Admin navigation item
**And** direct URL access to admin routes by non-admin users shows an "Access Denied" message

### Story 1.5: Dashboard Shell & Navigation

As a **team member**,
I want a web dashboard with persistent navigation and role-appropriate layout routing,
So that I can access briefings, search, and admin features without confusion.

**Acceptance Criteria:**

**Given** an authenticated user with a known role
**When** they access the dashboard
**Then** the app header displays Red Hat branding, the user's role indicator badge, and a placeholder for briefing freshness timestamp
**And** persistent horizontal navigation shows: Briefing (default active), Search, and Admin (visible only to ADMIN role)
**And** the Briefing route loads an empty-state page ("Your first briefing hasn't been generated yet")
**And** the Search route loads an empty-state page with a search input placeholder
**And** the Admin route (ADMIN only) loads an admin panel with tabs (Roster, Channels, System)
**And** the layout is responsive at the three breakpoints (lg: 1024px, xl: 1280px, 2xl: 1536px)
**And** all pages use semantic HTML (`<main>`, `<nav>`, `<header>`) with visible focus rings and skip-to-content link
**And** page titles update on navigation (e.g., "Daily Briefing — Slack Thread Manager")

### Story 1.6: Team Roster Management

As an **admin**,
I want to create and manage a team roster mapping names, Slack handles, and nicknames to roles and workstreams,
So that the system knows who is on the team and can personalize their experience.

**Acceptance Criteria:**

**Given** the admin is on the Roster tab in the Admin panel
**When** they add a new team member
**Then** they can specify: display name, email, Slack handle, nicknames (comma-separated), role (dropdown), and workstream assignments (multi-select)
**And** the roster table displays all team members with sortable columns
**And** the admin can edit any team member's details inline or via a dialog
**And** the admin can remove a team member (with confirmation dialog)
**And** changes persist immediately to the database via the REST API
**And** the API validates input using Zod schemas (required fields, valid role enum, valid email format)
**And** non-admin users cannot access the roster management endpoint (403)

### Story 1.7: Channel Configuration

As an **admin**,
I want to configure which Slack channels the system monitors and map them to workstreams,
So that the ingestion pipeline knows where to pull threads from.

**Acceptance Criteria:**

**Given** the admin is on the Channels tab in the Admin panel
**When** they add a new channel
**Then** they can specify: Slack channel ID, channel name, and workstream assignment (dropdown)
**And** the channel list displays all configured channels with their workstream mapping and active/inactive status
**And** the admin can toggle a channel active/inactive (pausing ingestion for that channel)
**And** the admin can remove a channel (with confirmation dialog)
**And** changes persist immediately to the database via the REST API
**And** the API validates that the Slack channel ID format is valid
**And** non-admin users cannot access channel configuration endpoints (403)

## Epic 2: Slack Data Ingestion

System silently ingests Slack threads from configured channels via scheduled batch polling, detects new activity on existing threads, and can backfill historical message data — all read-only. Admin can monitor ingestion health.

### Story 2.1: Slack API Client with Rate Limiting

As a **developer**,
I want a Slack API client service that handles authentication, rate limiting, and retries,
So that the system can reliably read Slack data without exceeding API limits.

**Acceptance Criteria:**

**Given** a valid read-only Slack bot token is configured via environment variable
**When** the Slack client makes API requests
**Then** it authenticates using the bot token in the Authorization header
**And** it detects rate limit responses (HTTP 429) and retries after the `Retry-After` header duration
**And** it implements exponential backoff with jitter for non-rate-limit failures (max 3 retries)
**And** it logs all API errors at `error` level with structured JSON (method, channel, error code)
**And** it never writes to Slack — only read methods (conversations.history, conversations.replies) are exposed
**And** the bot token is never logged or exposed in error messages

### Story 2.2: Thread Ingestion & Storage

As a **system**,
I want to ingest Slack threads from configured channels and store them with idempotent upsert,
So that thread data is persisted without duplicates regardless of how many times ingestion runs.

**Acceptance Criteria:**

**Given** active channels are configured in the `slack_channels` table
**When** the ingestion service polls a channel
**Then** it retrieves thread messages using `conversations.history` and `conversations.replies`
**And** each thread is stored in a `slack_threads` table with columns: id, slack_team_id, channel_id (FK), thread_ts, latest_reply_ts, message_count, raw_messages (JSONB), participant_handles (array), created_at, updated_at
**And** a `thread_messages` table stores individual messages: id, thread_id (FK), message_ts, user_handle, text, raw_payload (JSONB)
**And** the upsert uses `ON CONFLICT (slack_team_id, channel_id, thread_ts) DO UPDATE SET updated_at = NOW(), message_count = EXCLUDED.message_count, latest_reply_ts = EXCLUDED.latest_reply_ts`
**And** re-running ingestion on the same data produces no duplicates and no data corruption
**And** each thread is processed in its own transaction — a failure on one thread does not block others

### Story 2.3: Batch Polling Job with Watermark

As a **system**,
I want a scheduled batch job that polls configured channels for new threads since the last successful poll,
So that ingestion runs automatically on a configurable schedule without re-processing old data.

**Acceptance Criteria:**

**Given** the batch polling schedule is configured (e.g., cron: every 4 hours)
**When** the polling job triggers
**Then** it queries each active channel starting from that channel's `last_polled_ts` watermark
**And** after successfully processing all threads for a channel, it updates that channel's `last_polled_ts` to the current timestamp
**And** if a channel poll fails partway through, the watermark is NOT advanced (ensuring retry on next run)
**And** the job logs batch start/completion with structured JSON including: channels polled, threads found, threads stored, errors
**And** the pipeline status is visible via the health endpoint (`/api/health` includes `lastBatchRun` timestamp and status)
**And** the job uses `@nestjs/schedule` cron decorator with configurable schedule from environment variables

### Story 2.4: Thread Update Detection

As a **system**,
I want to detect new replies or activity on previously ingested threads,
So that updated threads are flagged for re-processing and don't become stale.

**Acceptance Criteria:**

**Given** a thread was previously ingested and stored
**When** the polling job detects that `latest_reply_ts` for that thread has changed since last ingestion
**Then** the thread's messages are re-fetched and the `slack_threads` row is updated via upsert
**And** the thread's `updated_at` timestamp reflects the re-ingestion time
**And** the thread's processing state is reset to `ingested` (ready for re-classification in Epic 3)
**And** threads with no new activity since last poll are skipped (not re-fetched)

### Story 2.5: Historical Backfill

As an **admin**,
I want to trigger a one-time backfill of Slack message history from before the system was deployed,
So that the system has context from the project's entire conversation history.

**Acceptance Criteria:**

**Given** the admin triggers a backfill via `POST /api/admin/ingestion/backfill` with parameters: channel_id (optional, all if omitted), oldest_ts (how far back to go)
**When** the backfill job runs
**Then** it retrieves all threads from the specified timeframe using Slack's `conversations.history` with pagination (cursor-based)
**And** it processes threads using the same idempotent upsert as regular polling (no special handling)
**And** it respects Slack API rate limits throughout the entire backfill (may take multiple minutes for large histories)
**And** it logs progress periodically (e.g., every 50 threads processed)
**And** the backfill can be run multiple times safely (idempotent — does not duplicate data)
**And** only users with ADMIN role can trigger backfill (403 for others)
**And** the endpoint returns immediately with a job ID; status is available via `/api/admin/ingestion/backfill/:jobId`

## Epic 3: Knowledge Transformation Pipeline

Ingested threads are transformed into classified, summarized, interconnected knowledge — identifying topics, workstreams, participant roles, cross-channel connections, and orphaned actions — with quality safeguards and Gemini Pro fallback.

### Story 3.1: LLM Abstraction Layer & Provider Interface

As a **developer**,
I want a provider-agnostic LLM service that abstracts model calls behind a unified interface with CPU model primary and Gemini Pro fallback,
So that the pipeline can swap models without changing processing logic.

**Acceptance Criteria:**

**Given** the LLM module is configured with primary (CPU model) and fallback (Gemini Pro) providers
**When** a pipeline processor requests LLM inference
**Then** it calls `LlmService.complete()` with a prompt and receives a typed response
**And** the `LlmProviderInterface` defines: `complete(prompt, options)`, `embed(text)`, and `healthCheck()`
**And** `cpu-model.provider.ts` implements the interface for the local CPU model
**And** `gemini.provider.ts` implements the interface for Google Gemini Pro API
**And** if the primary provider times out (configurable, default 30s) or returns an error, the service retries once then falls back to Gemini Pro
**And** if both providers fail twice, the request is marked `pending_retry` (not silently dropped)
**And** every LLM call logs: provider used, model_version, prompt_version, latency_ms, success/failure
**And** the fallback rate is tracked per batch; if >50% of calls use fallback, a `warn` level log is emitted

### Story 3.2: Pipeline State Machine & Failure Tracking

As a **developer**,
I want a pipeline state machine that tracks each thread's processing progress with atomic transitions and failure logging,
So that threads move through the pipeline reliably and failures are debuggable.

**Acceptance Criteria:**

**Given** a thread has been ingested (state: `ingested`)
**When** the pipeline processes it
**Then** the thread's state transitions atomically through: `ingested` → `classified` → `summarized` → `embedded` → `staged`
**And** each state transition is a single database transaction
**And** a `pipeline_state` column is added to `slack_threads` (enum: INGESTED, CLASSIFIED, SUMMARIZED, EMBEDDED, STAGED, APPROVED, DELIVERED, FAILED, PENDING_RETRY)
**And** a `pipeline_runs` table tracks: id, started_at, completed_at, threads_processed, threads_failed, fallback_count
**And** a `pipeline_failures` table tracks: id, thread_id, pipeline_stage, error_message, error_context (JSONB), created_at
**And** failed state transitions keep the thread at its current state for retry
**And** `processing_date` (UTC) is recorded to prevent double-processing on the same day

### Story 3.3: Thread Classification

As a **system**,
I want to classify ingested threads by topic and workstream using LLM-powered analysis,
So that threads are organized into meaningful categories for briefing generation and search.

**Acceptance Criteria:**

**Given** a thread is in state `ingested`
**When** the classifier processor runs
**Then** it sends the thread content to the LLM with a classification prompt (from `prompts/classify.prompt.ts`)
**And** the LLM returns: primary_topic, secondary_topics (array), workstream_id, confidence_score
**And** results are stored in a `classified_topics` table: id, thread_id (FK), primary_topic, secondary_topics (JSONB), workstream_id (FK), confidence, model_version, prompt_version, created_at
**And** if confidence is below threshold (configurable), the thread is flagged for manual review (state: `PENDING_RETRY`)
**And** the thread state transitions to `classified` on success
**And** the classification prompt includes workstream names from the database for consistent mapping
**And** golden fixture tests validate output shape against `classify.golden.json`

### Story 3.4: Thread Summarization

As a **system**,
I want to generate plain-language and technical summaries of thread discussions,
So that briefings can serve both technical and non-technical personas with appropriate depth.

**Acceptance Criteria:**

**Given** a thread is in state `classified`
**When** the summarizer processor runs
**Then** it generates two summaries: a technical summary (preserving jargon, cross-references) and a plain-language summary (translating jargon for non-technical readers)
**And** summaries are stored in the `classified_topics` table: technical_summary, plain_summary columns
**And** each summary includes: headline (one sentence), body (2-3 paragraphs max), key_decisions (array), action_items (array)
**And** the summarization prompt identifies participant roles using the team roster data
**And** the thread state transitions to `summarized` on success
**And** the LLM output is validated against a Zod schema — malformed responses are logged at `error` level, retried once, then marked `FAILED`
**And** golden fixture tests validate output shape against `summarize.golden.json`

### Story 3.5: Thread Embedding Generation

As a **system**,
I want to generate vector embeddings for each classified thread,
So that semantic search can find threads by meaning rather than just keywords.

**Acceptance Criteria:**

**Given** a thread is in state `summarized`
**When** the embedder processor runs
**Then** it generates a vector embedding from the thread's combined summary text
**And** embeddings are stored in a `thread_embeddings` table: id, thread_id (FK), embedding (vector type via pgvector), model_version, created_at
**And** the embedding dimension matches the configured model's output (stored in config)
**And** the thread state transitions to `embedded` on success
**And** embedding generation runs in its own transaction (can be re-run independently)
**And** the pgvector extension is properly configured with an appropriate index (ivfflat or hnsw) for cosine similarity search

### Story 3.6: Cross-Workstream Correlation

As a **system**,
I want to detect when the same topic appears across multiple channels or workstreams,
So that briefings can surface cross-cutting patterns that team members would otherwise miss.

**Acceptance Criteria:**

**Given** threads have been classified with topics and workstreams
**When** the correlator processor runs (after a batch of threads are classified)
**Then** it identifies topic matches across different channels using semantic similarity (embedding cosine distance) and topic label matching
**And** correlations are stored in a `topic_correlations` table: id, source_thread_id, correlated_thread_id, correlation_type (enum: SEMANTIC, TOPIC_MATCH, PARTICIPANT_OVERLAP), confidence, created_at
**And** a correlation threshold is configurable (minimum similarity score)
**And** correlations are bidirectional (A correlates with B implies B correlates with A)
**And** the correlator runs as a batch-level post-processing step (not per-thread)
**And** results are available for briefing generation to flag as "cross-workstream" items

### Story 3.7: Orphaned Action Detection

As a **system**,
I want to identify commitments, questions, or action items in threads that have no follow-up or resolution,
So that PMs can surface forgotten work in their briefings.

**Acceptance Criteria:**

**Given** threads have been summarized with action_items extracted
**When** the orphaned action detector runs
**Then** it identifies action items where: no subsequent thread message references the action AND no thread activity occurred after the commitment for a configurable duration (default: 48 hours on workdays)
**And** orphaned actions are stored: id, thread_id (FK), action_text, assigned_to (if identifiable from thread), detected_at, status (enum: ORPHANED, RESOLVED, DISMISSED)
**And** if a thread with an orphaned action receives new activity (detected via Story 2.4), the action's status is automatically updated to RESOLVED
**And** orphaned actions are available for PM briefing generation (Epic 5, FR12)
**And** the detector applies workday-aware logic (weekends excluded from the inactivity window)

## Epic 4: Anonymization & Content Governance

Admin ensures NDA compliance through a three-layer anonymization gate — every piece of generated content is automatically scanned, flagged, and queued for human review before any team member sees it. Nothing bypasses the gate.

### Story 4.1: Anonymization Blocklist & Filter

As a **system**,
I want to automatically scan all generated content against a maintained blocklist of known customer identifiers,
So that obvious NDA-sensitive terms are caught before human review.

**Acceptance Criteria:**

**Given** a thread has completed processing (state: `embedded`)
**When** the blocklist filter runs on its summaries and extracted content
**Then** it scans for exact and fuzzy matches against all terms in the `anonymization_blocklist` table
**And** the `anonymization_blocklist` table includes: id, term, replacement (e.g., "EOS"), category (enum: COMPANY_NAME, PERSON_NAME, URL, ACCOUNT_ID, INFRASTRUCTURE), created_at
**And** matched terms are logged with their positions in the content and which blocklist entry triggered them
**And** the filter replaces matched terms with their configured replacement values (e.g., customer name → "EOS")
**And** both original and anonymized versions of the content are preserved for admin review
**And** the filter handles case-insensitive matching and common variations (plurals, possessives)

### Story 4.2: LLM Entity Detection

As a **system**,
I want LLM-assisted entity detection to identify customer references that the blocklist might miss,
So that novel or unanticipated customer identifiers are caught.

**Acceptance Criteria:**

**Given** content has passed through the blocklist filter
**When** the LLM entity detector runs
**Then** it sends the content to the LLM with a detection prompt (from `prompts/detect-entities.prompt.ts`) asking it to identify: customer company names, personnel names, private/intranet URLs, account identifiers, infrastructure IPs and hostnames
**And** detected entities are returned with: entity_text, entity_type, confidence, suggested_replacement
**And** entities detected by LLM that are NOT already in the blocklist are flagged as "LLM entity detection" (distinct from blocklist matches)
**And** the LLM detection uses the same fallback chain as other pipeline processors (CPU → Gemini Pro)
**And** golden fixture tests validate detection against `detect-entities.golden.json`
**And** false positives are acceptable — human review in the staging queue resolves them

### Story 4.3: Staging Queue & Pipeline Gate

As a **system**,
I want all processed content to enter a staging queue that gates delivery until admin approval,
So that no briefing or search result reaches team members without human review of anonymization.

**Acceptance Criteria:**

**Given** content has passed through both blocklist filter and LLM entity detection
**When** the staging service processes it
**Then** the content enters the `staging_queue` table: id, thread_id (FK), original_content (JSONB), anonymized_content (JSONB), flags (JSONB array of detected entities with source: BLOCKLIST or LLM), status (enum: PENDING, APPROVED, REJECTED), reviewed_by, reviewed_at, created_at
**And** the thread's pipeline state transitions to `staged`
**And** content with zero flags still enters the staging queue (mandatory gate — FR28)
**And** no API endpoint serving user-facing content (briefings, search) returns threads that are not in `APPROVED` state
**And** this gate is enforced at the service layer — no controller can bypass it
**And** the staging queue tracks batch_id for grouping items from the same pipeline run

### Story 4.4: Admin Staging Review Interface

As an **admin**,
I want a staging review interface to inspect flagged content and approve or reject items before they reach team members,
So that I can ensure NDA compliance with efficient daily review.

**Acceptance Criteria:**

**Given** the admin navigates to the Staging tab in the Admin panel
**When** pending items exist in the staging queue
**Then** each item displays: flagged content with highlighted terms (red-10 background), flag source label ("Blocklist match" or "LLM entity detection"), and original vs. anonymized content comparison
**And** the admin can approve an item (status → APPROVED, thread state → APPROVED)
**And** the admin can reject an item (status → REJECTED, thread remains in STAGED state, not delivered)
**And** the admin can approve all unflagged items in bulk ("Approve all clean")
**And** the review queue shows item count, batch timestamp, and filter options (flagged only / all / by workstream)
**And** after all items for a batch are reviewed, a success toast confirms "Briefings cleared for delivery"
**And** only ADMIN role can access staging endpoints (403 for others)

### Story 4.5: Blocklist Management

As an **admin**,
I want to add, edit, and remove terms from the anonymization blocklist,
So that the automated filter stays current as new customer identifiers are discovered.

**Acceptance Criteria:**

**Given** the admin accesses blocklist management (sub-section of Staging or dedicated tab)
**When** they add a new blocklist term
**Then** they specify: term, replacement text, and category (dropdown: Company Name, Person Name, URL, Account ID, Infrastructure)
**And** the blocklist table is updated immediately
**And** the admin can edit existing terms (change replacement or category)
**And** the admin can delete terms (with confirmation dialog)
**And** newly added terms will be applied on the next pipeline run (not retroactively on already-approved content)
**And** the interface shows the current blocklist in a searchable, sortable table
**And** when reviewing a staged item, the admin can click "Add to Blocklist" on any flagged entity to add it directly (pre-filling the term and suggesting a category)

## Epic 5: Daily Briefings & Core Dashboard

Team members open the dashboard and see their personalized daily briefing — Architects get cross-workstream technical patterns (Split Panel), PMs get plain-language summaries with action queues (News Feed), and executives get workstream health at a glance (Dashboard). Every item links directly to the source Slack thread.

### Story 5.1: Briefing Generation Service & Scheduling

As a **system**,
I want a scheduled briefing generation service that creates personalized daily briefings from approved content,
So that briefings are pre-generated and ready when team members open the dashboard.

**Acceptance Criteria:**

**Given** approved threads exist in the database (pipeline state: `APPROVED`)
**When** the briefing generation job runs (scheduled cron, configurable — default: daily at 04:00 UTC)
**Then** it generates one briefing per active user based on their role and workstream assignments
**And** briefings are stored in a `briefings` table: id, user_id (FK), briefing_date, briefing_shape (enum: EXECUTIVE_SCAN, FILTERED_BRIEF, INTELLIGENCE_REPORT), generated_at, thread_count, workstream_count
**And** briefing items are stored in a `briefing_items` table: id, briefing_id (FK), thread_id (FK), headline, summary_text, workstream_name, source_thread_url, item_type (enum: STANDARD, CROSS_WORKSTREAM, ORPHANED_ACTION, GONE_QUIET), sort_order
**And** the generation job logs: start time, users processed, items generated, duration
**And** if no new approved content exists since last run, the job completes without generating duplicate briefings
**And** if the system was down, the next run covers the missed period (catch-up logic)

### Story 5.2: Executive Scan Briefing Shape (Dashboard Layout)

As a **Program Manager / Engagement Lead / Sales user**,
I want a high-level dashboard showing workstream health, thread counts, and key decisions at a glance,
So that I can assess project status in under 2 minutes without reading individual threads.

**Acceptance Criteria:**

**Given** an authenticated user with role PM, SALES, or TRAINING
**When** they navigate to the Briefing page
**Then** the Dashboard layout loads with:
- **StatsBar** at top: 4 cells showing total threads processed, active workstreams, gone quiet count, flags raised (semantic colors per UX-DR3)
- **Workstream Status panel**: one row per workstream with health indicator, thread count, latest activity timestamp
- **Key Decisions panel**: compact BriefingCards showing extracted decisions with source deep-links
**And** the StatsBar shows skeleton loading state while data fetches (UX-DR16)
**And** each BriefingCard (compact variant) shows: headline, workstream label, deep-link to Slack (UX-DR13)
**And** the briefing freshness timestamp displays "Generated today at [time] from [X] threads across [Y] workstreams" (UX-DR22)
**And** if no briefing exists, an empty state displays: "Your first briefing hasn't been generated yet" with guidance (UX-DR17)

### Story 5.3: Filtered Brief Briefing Shape (News Feed Layout)

As a **Project Manager**,
I want a card-based briefing filtered to my assigned workstreams showing decisions, blockers, and orphaned actions,
So that I can identify what needs my attention without wading through irrelevant channels.

**Acceptance Criteria:**

**Given** an authenticated user with role PM and assigned workstreams
**When** they navigate to the Briefing page
**Then** the News Feed layout loads with:
- **WorkstreamFilter** pills at top showing only assigned workstreams + "All" default (UX-DR7)
- **Card grid** (2-column at xl+, single column at lg) with BriefingCards
- **Featured card** (full-width) for the highest-priority item (cross-workstream or orphaned action)
**And** each BriefingCard (standard variant) shows: workstream label (top, blue-50), headline (H3), summary text, metadata row (participant count, message count, time since last activity), deep-link "View in Slack →" (UX-DR2, UX-DR13)
**And** clicking a WorkstreamFilter pill filters cards to that workstream (client-side filter, no API call)
**And** cards with orphaned actions display an amber badge
**And** clicking a card expands it to show full summary + action items (200ms ease-out transition, UX-DR24)
**And** the layout renders within the xl:1280px max-width container (UX-DR18)

### Story 5.4: Intelligence Report Briefing Shape (Split Panel Layout)

As an **Architect / Consultant**,
I want a detailed thread analysis in a split-panel layout with full technical context,
So that I can see cross-workstream patterns and trace each insight back to its source.

**Acceptance Criteria:**

**Given** an authenticated user with role ARCHITECT or CONSULTANT
**When** they navigate to the Briefing page
**Then** the Split Panel layout loads with:
- **Main panel** (left, flexible width): BriefingCards (standard variant) with full technical summaries, participant context, cross-workstream markers
- **Side panel** (right, 360px at xl+, stacks below at lg): displays empty state "Select a topic card to see related context" with arrow pointing left (UX-DR17)
**And** each BriefingCard shows: workstream label, headline, technical summary, key decisions, participant handles, source deep-link
**And** clicking a BriefingCard selects it (blue-50 border, subtle blue background tint — UX-DR2 `selected` state)
**And** the side panel placeholder updates to show "AI enrichment coming soon" (populated in Epic 8)
**And** cross-workstream items are visually marked with a distinct badge and listed first
**And** the side panel is collapsible to a 40px strip via chevron toggle (UX-DR24)

### Story 5.5: Read/Unread State & Source Deep-Links

As a **team member**,
I want to track which briefing items I've already reviewed and jump directly to the original Slack thread,
So that I can resume scanning without re-reading and verify any summary with one click.

**Acceptance Criteria:**

**Given** a briefing is displayed with multiple BriefingCards
**When** a user interacts with a card (expands in News Feed, selects in Split Panel)
**Then** the card transitions from `unread` state (full opacity, 2px left border in workstream color) to `read` state (opacity 0.6, no left border) — UX-DR12
**And** read state persists across page navigation and browser refreshes (stored via API: `briefing_item_reads` table with user_id, briefing_item_id, read_at)
**And** read state resets when the next daily briefing is generated (new briefing = fresh slate)
**And** every BriefingCard includes a "View in Slack →" link (blue-50, right-aligned, opens in new tab via `target="_blank"`) — UX-DR13
**And** the deep-link URL points to the specific thread message in Slack (using thread_ts for permalink construction)
**And** Executive Scan (Dashboard) does not use read state — it's a snapshot view (UX-DR12 exception)

### Story 5.6: Briefing API & Frontend Data Layer

As a **developer**,
I want a REST API serving briefing data and a TanStack Query-powered frontend data layer,
So that the dashboard loads fast and handles caching, refetch, and error states consistently.

**Acceptance Criteria:**

**Given** an authenticated user requests their briefing
**When** `GET /api/briefings/today` is called
**Then** it returns the user's latest briefing with all items in `{ data: { briefing, items } }` format
**And** `GET /api/briefings/:id` returns a specific briefing by ID
**And** `GET /api/briefings/history` returns past briefings (paginated, default: last 7 days)
**And** responses include role-appropriate content (technical summaries for Architects, plain summaries for PMs/Sales)
**And** the frontend uses TanStack Query with key factory `['briefings', { date, role }]` for caching
**And** loading states render Skeleton components matching BriefingCard shapes (UX-DR16)
**And** stale data shows a warning: "Briefing data is from [date]. Next batch scheduled at [time]" if >24h old (UX-DR22)
**And** API errors display an error alert (red-10 background) with retry guidance (UX-DR21)

## Epic 6: Search & Discovery

Team members can ask natural language questions across the entire thread corpus and get sourced answers linked to original Slack threads — regardless of which channel the discussion happened in.

### Story 6.1: Full-Text Search Infrastructure

As a **developer**,
I want PostgreSQL full-text search configured on thread content with GIN indexes,
So that keyword-based queries return relevant results fast.

**Acceptance Criteria:**

**Given** threads have been approved (pipeline state: `APPROVED`)
**When** the FTS infrastructure is set up
**Then** a `tsvector` column is added to `classified_topics` populated from headline + summary text
**And** a GIN index is created on the `tsvector` column for fast lookup
**And** the `tsvector` is automatically updated when summaries are written or updated (trigger or application-level)
**And** the FTS service (`fts.service.ts`) exposes a `search(query: string)` method that converts natural language to `tsquery`
**And** results are ranked by `ts_rank` relevance score
**And** search only returns threads in `APPROVED` state (security gate enforced in the query WHERE clause)

### Story 6.2: Semantic Search with pgvector

As a **developer**,
I want semantic search using pgvector embeddings alongside keyword search,
So that users can find threads by meaning even when exact keywords don't match.

**Acceptance Criteria:**

**Given** thread embeddings exist in the `thread_embeddings` table (from Epic 3, Story 3.5)
**When** a user submits a search query
**Then** the query text is embedded using the same LLM embedding model used for threads
**And** cosine similarity search is performed against the `thread_embeddings` table
**And** results are filtered to only include threads in `APPROVED` state
**And** a configurable similarity threshold filters out low-relevance matches (default: 0.7)
**And** the vector search service (`vector-search.service.ts`) returns results ranked by cosine similarity
**And** semantic results are merged with FTS results using a combined ranking strategy (configurable weights)

### Story 6.3: Search API & Query Processing

As a **team member**,
I want to submit natural language questions and receive sourced answers with links to original threads,
So that I get oriented to the right context in under 5 seconds.

**Acceptance Criteria:**

**Given** an authenticated user submits a search query via `POST /api/search` with body `{ query: string }`
**When** the search service processes the query
**Then** it runs both FTS and semantic search in parallel, merges results, and returns the top matches
**And** each result includes: thread headline, summary snippet (role-appropriate: plain for PM/Sales, technical for Architect/Consultant), workstream name, source_thread_url (deep-link to Slack), relevance_score, match_type (KEYWORD, SEMANTIC, BOTH)
**And** results are returned in `{ data: { results: [], meta: { total, query, searchTime } } }` format
**And** response time is under 5 seconds for typical queries (NFR2)
**And** if no results match, the response includes `suggestions` for query refinement
**And** search respects the user's role for summary depth but does NOT filter by workstream (FR17: cross-channel)
**And** the endpoint requires authentication (401 for anonymous)

### Story 6.4: Search Frontend Interface

As a **team member**,
I want a search page with a natural language input and clearly sourced results,
So that I can ask questions and get oriented to the right Slack threads quickly.

**Acceptance Criteria:**

**Given** the user navigates to the Search page
**When** the page loads
**Then** it displays a single prominent search input field with placeholder "Ask a question about project discussions..."
**And** submitting a query shows a loading skeleton matching result card shapes (UX-DR16)
**And** results display as cards with: headline, summary snippet, workstream badge, "View in Slack →" deep-link (UX-DR13), relevance indicator
**And** each result card uses white background for source content (UX-DR11)
**And** if no results are found, an empty state displays: "No matches found for your question" with suggestions to broaden the query (UX-DR17)
**And** partial/low-confidence matches show a subtle info badge: "Partial match — verify with source"
**And** the frontend uses TanStack Query with key `['search', { query }]` — results are cached for repeat queries
**And** search history (last 5 queries) is shown below the input for quick re-search

## Epic 7: Silence Detection & Monitoring

PMs can spot topics that were actively discussed and then went quiet — surfacing potential project risks before they become crises — through a passive "Gone Quiet" dashboard with workday-aware thresholds.

### Story 7.1: Silence Detection Engine

As a **system**,
I want to detect topics that were actively discussed and then went quiet beyond a configurable threshold,
So that silence signals are available for PM briefings and the monitoring dashboard.

**Acceptance Criteria:**

**Given** threads exist in the database with activity timestamps
**When** the silence detection job runs (scheduled, after each ingestion batch)
**Then** it identifies threads where: last activity is older than the configured silence threshold AND the thread had prior active discussion (minimum 3 messages or 2 participants)
**And** silence alerts are stored in a `silence_alerts` table: id, thread_id (FK), workstream_id (FK), topic_name, last_activity_at, silence_days, participant_count, status (enum: ACTIVE, RESOLVED, DISMISSED), detected_at
**And** if a thread that was flagged as silent receives new activity (via ingestion update detection), the alert status automatically transitions to RESOLVED
**And** the detection only flags threads that went quiet AFTER being active — never-active threads are ignored
**And** the job logs: alerts created, alerts resolved, threads scanned

### Story 7.2: Workday-Aware Threshold Logic

As a **system**,
I want silence thresholds that exclude weekends and non-working days from inactivity calculations,
So that normal weekend gaps don't trigger false positive silence alerts.

**Acceptance Criteria:**

**Given** a silence threshold of 3 days is configured for a workstream
**When** the silence detector calculates days of inactivity
**Then** it counts only Monday–Friday (workdays) in the inactivity window
**And** a thread last active on Friday at 5pm is NOT flagged on Monday morning (only 0 workdays have passed)
**And** the same thread IS flagged on Thursday if no activity occurs Mon–Wed (3 workdays of silence)
**And** silence thresholds are stored in a `silence_thresholds` table: id, workstream_id (FK, nullable for global default), threshold_days (integer), created_at, updated_at
**And** if no workstream-specific threshold exists, the global default is used (default: 3 workdays)
**And** the workday calculation is timezone-aware (uses the project's configured timezone, not UTC)

### Story 7.3: Admin Silence Threshold Configuration

As an **admin**,
I want to configure silence detection thresholds per workstream,
So that different workstreams can have different sensitivity levels based on their activity patterns.

**Acceptance Criteria:**

**Given** the admin navigates to a Silence Configuration section in the Admin panel
**When** they configure thresholds
**Then** they can set a global default threshold (applies to all workstreams without a specific override)
**And** they can set per-workstream overrides (e.g., "Infrastructure" = 2 days, "VM Migration" = 5 days)
**And** changes take effect on the next silence detection run (not retroactive)
**And** the interface shows current thresholds in a table: workstream name, threshold days, last modified
**And** the admin can reset a workstream override to use the global default
**And** only ADMIN role can modify thresholds (403 for others)
**And** the API validates threshold values (minimum: 1 day, maximum: 30 days)

### Story 7.4: Silence Monitor Dashboard Component

As a **PM**,
I want a dedicated "Gone Quiet" section in my dashboard showing topics that have dropped off discussion,
So that I can spot potential risks and add them to my standup agenda.

**Acceptance Criteria:**

**Given** silence alerts exist with status ACTIVE
**When** a PM views their briefing (News Feed or Dashboard layout)
**Then** a **SilenceMonitor** panel displays on the Dashboard layout with yellow-10 background and "Silence Monitor" header (UX-DR4)
**And** each silence item shows: topic name (bold), days silent, participant count, resolution status, and workstream label
**And** each item has a yellow-30 left border accent (UX-DR23)
**And** if no silence alerts are active, the panel shows: "All topics active — no silence detected" with a green-50 check icon (UX-DR4 empty state)
**And** clicking a silence item deep-links to the original Slack thread ("View in Slack →")
**And** the PM can dismiss a silence alert (removes from their view, does not re-trigger until new activity + re-silence)

### Story 7.5: Gone Quiet Badges on Briefing Cards

As a **team member**,
I want briefing cards for silent topics to be visually distinct with "Gone Quiet" badges,
So that silence signals are visible within my normal briefing scan without visiting a separate dashboard.

**Acceptance Criteria:**

**Given** a briefing item's underlying thread has an ACTIVE silence alert
**When** the briefing is rendered in any layout variant (Dashboard, News Feed, Split Panel)
**Then** the BriefingCard displays in `flagged-quiet` state: yellow-30 left border + yellow-10 background (UX-DR2, UX-DR23)
**And** a "Gone Quiet" badge (yellow-30 background, dark text) appears on the card metadata row
**And** the badge shows days of silence: "Quiet for 5 days"
**And** flagged-quiet cards sort above standard cards (higher visual priority) but below cross-workstream items
**And** the News Feed layout shows "Gone Quiet" cards with the amber border visible in the card grid
**And** the Dashboard layout's Key Decisions panel does NOT show gone-quiet items (they appear in SilenceMonitor instead)

## Epic 8: AI Enrichment & Consultant Onboarding

Architects and Consultants get an AI research assistant in the Intelligence Report side panel — proactively linking related documentation, Knowledge Base entries, and similar past discussions. New consultants joining mid-project receive a backfill briefing covering what they missed, scoped to their role and workstream.

### Story 8.1: Enrichment Service & Source Integration

As a **developer**,
I want an enrichment service that queries external knowledge sources (NotebookLM, OpenShift docs) for context related to a selected topic,
So that the Intelligence Report side panel can display relevant documentation alongside thread analysis.

**Acceptance Criteria:**

**Given** a user selects a BriefingCard in the Intelligence Report layout
**When** the enrichment service is called with the topic's classification and summary
**Then** it queries configured external sources in parallel:
- **NotebookLM source**: queries the team's NotebookLM instance for related entries (via API)
- **OpenShift docs source**: searches Red Hat OpenShift public documentation for relevant pages
- **Similar Past Discussions**: finds previously ingested threads on the same topic using embedding similarity (reuses pgvector from Epic 6)
**And** each source returns: title, description/snippet, source_url, source_type (enum: NOTEBOOKLM, OPENSHIFT_DOCS, PAST_DISCUSSION), relevance_score
**And** results are cached per topic per day (avoid re-querying the same enrichment repeatedly)
**And** each external source has an independent timeout (configurable, default 5s) — if one source fails or times out, the others still return results (partial success semantics)
**And** if all external sources are unavailable, the panel displays "Enrichment temporarily unavailable" rather than failing the briefing
**And** the enrichment API endpoint: `GET /api/enrichment/:threadId` returns results in `{ data: { sections: [] } }` format

### Story 8.2: Enrichment Panel Frontend

As an **Architect / Consultant**,
I want the Intelligence Report side panel to populate with AI-researched context when I select a topic card,
So that I can see related documentation and past discussions without searching manually.

**Acceptance Criteria:**

**Given** the user is in the Intelligence Report (Split Panel) layout and selects a BriefingCard
**When** the side panel receives the enrichment data
**Then** the **EnrichmentPanel** renders on blue-10 background with "AI-Assisted" teal badge at the top (UX-DR5, UX-DR11)
**And** the panel shows three collapsible sections: "OpenShift Documentation", "Knowledge Base (NotebookLM)", "Similar Past Discussions"
**And** each section contains enrichment links with: title (blue-50, clickable), description (12px, gray-50), source label (11px, gray-30 with source icon)
**And** clicking any enrichment link opens the source URL in a new tab
**And** each section shows a count of results: e.g., "3 related docs"
**And** while loading, the panel shows skeleton links (3 per section) matching the link shape (UX-DR16)
**And** if no enrichment is available for a topic, the panel shows: "No related context found for this topic"
**And** if a source is unavailable, its section shows "Source temporarily unavailable" rather than hiding the section
**And** the panel background (blue-10) is visually distinct from the main panel (white) to prevent confusion between source and AI content (UX-DR11)

### Story 8.3: Backfill Briefing Generation for New Consultants

As a **new consultant joining mid-project**,
I want my first briefing to include a backfill section covering what I missed since the project started,
So that I achieve working context within my first briefing cycle instead of scrolling Slack history.

**Acceptance Criteria:**

**Given** a new team member is added to the roster with a role and workstream assignments
**When** the next briefing generation job runs for this user
**Then** it detects this is the user's first briefing (no prior briefings exist for this user_id)
**And** it generates a backfill section at the top of the briefing containing:
- Role-filtered summary of project history scoped to assigned workstreams
- Key decisions made (extracted from all approved threads in assigned workstreams)
- Unresolved issues still open (threads with no resolution marker)
- Action items in their workstream that have no assignee
**And** the backfill section is stored as briefing items with item_type: `BACKFILL`
**And** subsequent briefings for the same user do NOT include the backfill section (one-time only)
**And** the backfill lookback window is configurable (default: from project start or max 90 days)

### Story 8.4: Backfill Section Frontend Display

As a **new consultant**,
I want the backfill section to appear prominently at the top of my first briefing with clear "catching up" framing,
So that I understand this is historical context separate from today's activity.

**Acceptance Criteria:**

**Given** a user's briefing contains backfill items (item_type: `BACKFILL`)
**When** the briefing page renders
**Then** the backfill section appears at the top of the main panel with a distinct visual treatment:
- Section header: "Since you joined: Key context from [workstream names]" with info badge (teal-50, UX-DR21)
- A subtle border or background distinction separating backfill from today's briefing items
**And** backfill items use BriefingCard (standard variant) with a "Historical" badge (gray) to distinguish from fresh content
**And** each backfill card includes: headline, summary, decision/issue/action classification, source deep-link
**And** after the backfill section, a separator and "Today's Briefing" header introduces the current day's content
**And** the backfill section respects the same read/unread tracking as regular briefing items (UX-DR12)
**And** on the user's second visit (or next day's briefing), the backfill section is gone — replaced by normal daily content

## Implementation Notes

- Epic 4 (Anonymization) is a mandatory gate — NDA is the hard boundary. FR28 enforces that nothing reaches users without staging approval.
- Search (Epic 6) operates only over approved/staged content — security model stays uniform.
- Slack ingestion is polling-only (cron job) — no Socket Mode or Events API.
- Sales persona (Marcus) briefings are Phase 2 (Growth) — V1 serves Architect and PM personas. Marcus uses Search.
- Epic 5 stories sliced by layout variant and component, not bundled monolithically.
- Epic 3 stories sequenced as single-processor E2E (classifier → summarizer → embedder → correlator).
