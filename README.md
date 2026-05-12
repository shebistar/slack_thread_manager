# Slack Thread Manager

A self-hosted project intelligence platform that passively observes Slack conversations and transforms them into organized, role-personalized, searchable team memory.

## Features

### Epic 1 — Project Foundation & Admin

- **Authentication & Authorization** — Keycloak OIDC single sign-on with role-based access control (`@Roles('ADMIN')` decorator, `RolesGuard`, route-level guards)
- **Admin Panel** — Tabbed administration interface (Roster, Channels, Import History, System) restricted to ADMIN users
- **Team Roster Management** — Full CRUD for team members with email, Slack handle, role assignment, and multi-workstream mapping; sortable table with inline editing and confirmation dialogs
- **Channel Configuration** — Configure which Slack channels the system monitors; optionally map channels to workstreams or leave as general-purpose; toggle active/inactive status; Slack Channel ID format validation (`C`, `G`, or `D` prefix)
- **Dashboard Shell** — Responsive navigation with role-gated links, Red Hat typography, branded header with role badge and logout, dynamic page titles
- **In-App Help** — Documentation page with Getting Started guide, feature descriptions, role/permission reference, and changelog; accessible from navbar and footer

### Epic 2 — Slack Data Ingestion

- **Slack API Client** — Bot token-based integration with `@slack/web-api`; channel history, thread replies, and channel info retrieval; exponential backoff with jitter; Slack rate-limit (`Retry-After`) awareness; graceful degradation when unconfigured
- **Thread Ingestion & Storage** — Automatic polling of active channels for threaded conversations; idempotent upsert with per-thread transaction isolation; participant extraction; `slack_threads` and `thread_messages` tables with cascade delete
- **Batch Polling Job** — `@Cron`-scheduled polling with per-channel `last_polled_ts` watermark; configurable schedule via `INGESTION_CRON_SCHEDULE` env var (default: every 4 hours)
- **Thread Update Detection** — Two-phase polling detects modified threads by comparing `latest_reply` timestamps; re-ingests only changed threads; phase-2 errors isolated from watermark advancement
- **Historical Backfill API** — Admin-triggered async backfill via `POST /api/admin/ingestion/backfill` (HTTP 202); status polling via `GET /api/admin/ingestion/backfill/:jobId`; in-memory job registry
- **Slack History Upload** — Manual import of Slack workspace export JSON files via Admin UI; groups messages into threads; reuses the same idempotent storage path
- **Text-Paste Import** — Copy-paste messages directly from Slack's UI for environments without live API access; CLI script for bulk imports via OpenShift `oc port-forward`; primary ingestion mode alongside Slack API polling

### Epic 3 — Knowledge Transformation Pipeline

- **LLM Abstraction Layer** — Provider-agnostic `LlmService` behind `LlmProviderInterface`; `CpuModelProvider` for local OpenAI-compatible inference (Ollama / phi3:mini); `GeminiProvider` for Google Gemini 2.5 Flash fallback via `@google/generative-ai` SDK; 2 + 2 retry-then-fallback strategy with `LlmPendingRetryError`; batch-level fallback rate tracking with configurable `LLM_FALLBACK_RATE_THRESHOLD` warning
- **LLM Health Endpoint** — `GET /api/admin/llm/health` returns per-provider healthy/unhealthy status and aggregated `ok | degraded` state; requires ADMIN role
- **Pipeline State Machine** — Thread lifecycle management (`ingested` → `classified` → `summarized` → `embedded` → `staged` → `approved` → `delivered`); failure tracking with retry support
- **Thread Classification** — LLM-powered topic classification with primary/secondary topics, workstream assignment, and confidence scoring
- **Thread Summarization** — Dual-summary generation (technical + plain language) per thread for role-appropriate briefing content
- **Embedding Generation** — Vector embeddings via `nomic-embed-text` for future semantic search (pgvector storage)
- **Cross-Workstream Correlation** — Detects related threads across workstreams via topic matching, participant overlap, and temporal proximity
- **Orphaned Action Detection** — Identifies unresolved action items in threads for surfacing in briefings

### Epic 4 — Anonymization & Content Governance

- **Anonymization Blocklist** — Admin-managed term blocklist for PII/sensitive entity detection; exact-match scanning of thread content
- **LLM Entity Detection** — AI-powered detection of sensitive entities not covered by the static blocklist; augments blocklist flags with LLM-detected entities
- **Staging Queue & Pipeline Gate** — Threads pass through a staging review queue before becoming visible in briefings; threads with flags require explicit admin review
- **Admin Staging Review Interface** — Review pending staged threads, approve/reject individually or bulk-approve clean (unflagged) items; batch progress tracking
- **Blocklist Management** — Full CRUD for blocklist terms with quick-add from the staging review interface; real-time invalidation of staging cache

### Epic 5 — Daily Briefings & Core Dashboard (in progress)

- **Briefing Generation Service** — Scheduled job (default 4:00 AM UTC via `BRIEFING_CRON_SCHEDULE`) generates personalized briefings for all roster users; role-to-shape mapping (PM → `filtered_brief`, Architect/Consultant → `intelligence_report`, Sales/Training/Admin → `executive_scan`); idempotent — skips if already generated for today; transitions threads from `approved` → `delivered`
- **On-Demand Briefing Generation** — `POST /api/admin/briefings/generate` allows admins to trigger briefing generation manually, enabling E2E testing without waiting for the cron schedule
- **Executive Scan Layout** — Dashboard view for Sales/Training/Admin roles with stats bar, workstream status table, and key decisions panel
- **Filtered Brief Layout** — News feed view for PM role with workstream filter pills, featured card, and grid of briefing cards; items scoped to user's assigned workstreams
- **Intelligence Report Layout** — Split-panel view for Architect/Consultant roles with a topic list and collapsible side panel (AI enrichment placeholder for Epic 8)
- **Briefing Cards** — Compact/standard/featured variants with headline, summary, workstream badge, item type indicator, Slack deep links, message count, and participant count
- **Freshness Indicators** — Generation timestamp, stale-data warning banner (>24h), and next-batch countdown

## Quick Start

### Prerequisites

- Node.js >= 24
- pnpm >= 10
- Podman & podman-compose
- Keycloak instance (for authentication)
- Slack Bot Token (`xoxb-*`) with `channels:history`, `channels:read` scopes (optional — Slack integration is disabled without it)
- Ollama with `phi3:mini` + `nomic-embed-text` models (optional — LLM pipeline is disabled without it)
- Google Gemini API key (optional — LLM fallback is disabled without it)

### Setup

```bash
# Install dependencies
pnpm install

# Start PostgreSQL (with pgvector)
podman-compose up -d

# Copy environment file and configure Keycloak + Slack
cp .env.example .env
# Set SLACK_BOT_TOKEN=xoxb-... for Slack integration (optional)

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

### Services

| Service | URL | Description |
|---------|-----|-------------|
| API | http://localhost:3000 | NestJS backend |
| Web | http://localhost:5173 | React SPA frontend |
| PostgreSQL | localhost:5432 | Database (via Podman) |
| Keycloak | (configurable) | OIDC identity provider |

### Commands

```bash
pnpm dev               # Start all services in development mode
pnpm build             # Build all packages
pnpm test              # Run all tests
pnpm lint              # Lint all packages
pnpm db:generate       # Generate Drizzle migrations
pnpm db:migrate        # Run database migrations
pnpm db:push           # Push schema changes directly
podman-compose up -d   # Start PostgreSQL container
podman-compose down    # Stop PostgreSQL container
```

## Architecture

- **apps/api** — NestJS v11 backend with REST API, RBAC guards, admin CRUD modules
- **apps/web** — React 19 + Vite + TanStack Router + Tailwind CSS 4 + Shadcn/ui
- **packages/db** — Drizzle ORM schemas and migrations (PostgreSQL 17 + pgvector)
- **packages/shared** — Zod schemas, types, and constants shared across apps
- **packages/config** — Shared ESLint and TypeScript configurations

### API Endpoints

**Admin — Roster & Channels**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/roster` | List all team members |
| POST | `/api/admin/roster` | Add a team member |
| PATCH | `/api/admin/roster/:id` | Update a team member |
| DELETE | `/api/admin/roster/:id` | Remove a team member |
| GET | `/api/admin/roster/workstreams` | List all workstreams |
| GET | `/api/admin/channels` | List all configured channels |
| POST | `/api/admin/channels` | Add a channel |
| PATCH | `/api/admin/channels/:id` | Update a channel |
| PATCH | `/api/admin/channels/:id/toggle` | Toggle channel active status |
| DELETE | `/api/admin/channels/:id` | Remove a channel |
| POST | `/api/admin/channels/:id/import` | Import Slack export JSON / text-paste into channel |

**Admin — Pipeline, Staging & Briefings**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/pipeline/run` | Run full pipeline (classify → summarize → embed → correlate → anonymize → stage) |
| POST | `/api/admin/briefings/generate` | Trigger on-demand briefing generation for all roster users |
| GET | `/api/admin/staging` | List pending staging queue items with counts |
| POST | `/api/admin/staging/:id/review` | Approve or reject a staged item |
| POST | `/api/admin/staging/approve-all-clean` | Bulk-approve all unflagged pending items |
| GET | `/api/admin/staging/batches/:batchId` | Get batch progress summary |
| GET | `/api/admin/blocklist` | List all blocklist terms |
| POST | `/api/admin/blocklist` | Add a blocklist term |
| PATCH | `/api/admin/blocklist/:id` | Update a blocklist term |
| DELETE | `/api/admin/blocklist/:id` | Remove a blocklist term |

**Admin — Ingestion & LLM**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/ingestion/backfill` | Trigger async historical backfill (HTTP 202) |
| GET | `/api/admin/ingestion/backfill/:jobId` | Poll backfill job status |
| GET | `/api/admin/health` | System health check |
| GET | `/api/admin/llm/health` | LLM provider health (cpu + gemini) |

**Briefings (authenticated)**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/briefings/today` | Get today's briefing for the authenticated user |

**Slack (proxy)**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/slack/status` | Slack integration health check |
| GET | `/api/slack/channels/:channelId` | Get Slack channel info |
| GET | `/api/slack/channels/:channelId/history` | Fetch channel message history |
| GET | `/api/slack/channels/:channelId/threads/:threadTs` | Fetch thread replies |

All `/admin/*` and `/slack/*` endpoints require the `ADMIN` role. `/briefings/*` requires any authenticated user.

### E2E Testing on OpenShift

An end-to-end smoke test script exercises the full pipeline against the OpenShift deployment:

```bash
./deploy/test-pipeline.sh
```

The script is self-contained — it handles OpenShift login (`oc login`), obtains a JWT from Keycloak, then runs 11 steps: health checks → channel listing → roster user setup → test data import (realistic multi-thread conversations) → full pipeline run → staging approval (auto-approves clean items, individually approves flagged items) → briefing generation → briefing API verification → web UI reachability check with a manual verification checklist.

**Important:** The pipeline requires at least one user in the application roster for briefing generation to produce output. Step 3 automatically creates a workstream and roster user if they don't already exist.

Configuration is hardcoded for the OpenShift environment:

| Setting | Value |
|---------|-------|
| OpenShift API | `https://api.ocp4.shebi.eu:6443` |
| API URL | `https://stm-web-slack-thread-manager.apps.ocp4.shebi.eu/api` |
| Web URL | `https://stm-web-slack-thread-manager.apps.ocp4.shebi.eu` |
| Keycloak | `https://stm-keycloak-slack-thread-manager.apps.ocp4.shebi.eu` |
| Realm/Client | `slack-thread-manager` / `slack-thread-manager-web` |
| Test user | `shebi` / `shebi` (ADMIN role) |

Optional overrides:

| Variable | Default | Description |
|----------|---------|-------------|
| `CHANNEL_ID` | — | Override channel for import (auto-detects first channel if unset) |
| `VERBOSE` | `false` | Show response bodies on failure |

Requirements: `curl`, `jq`, `oc` (OpenShift CLI).

### OpenShift Deployment

OpenShift manifests are in `deploy/openshift/`:

```bash
# Build and deploy
./deploy/deploy.sh

# Manifests: api.yaml (ConfigMap + Deployment + Service),
#            web.yaml (Deployment + Service + Route with TLS),
#            postgres.yaml (Secret + Deployment + Service + PVC)
```

## Environment Variables

All variables are validated on startup via Zod (`apps/api/src/config/app.config.ts`). Optional variables degrade gracefully when absent.

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `KEYCLOAK_REALM_URL` | — | OIDC realm URL (required) |
| `KEYCLOAK_CLIENT_ID` | — | OIDC client ID (required) |
| `SLACK_BOT_TOKEN` | — | Starts with `xoxb-`; Slack disabled if absent |
| `SLACK_TEAM_ID` | — | Ingestion skipped if absent |
| `INGESTION_CRON_SCHEDULE` | `0 */4 * * *` | Cron expression for polling interval |
| `BRIEFING_CRON_SCHEDULE` | `0 4 * * *` | Cron expression for daily briefing generation |
| `CPU_MODEL_URL` | — | Ollama / OpenAI-compatible endpoint URL |
| `CPU_MODEL_NAME` | `phi3:mini` | Completion model name |
| `CPU_EMBED_MODEL_NAME` | `nomic-embed-text` | Embedding model name |
| `GEMINI_API_KEY` | — | Google Gemini API key; fallback disabled if absent |
| `GEMINI_MODEL_NAME` | `gemini-2.5-flash` | Gemini model name |
| `LLM_TIMEOUT_MS` | `60000` | Per-call timeout for LLM providers |
| `LLM_FALLBACK_RATE_THRESHOLD` | `0.5` | Warn when fallback rate exceeds this |

## Tech Stack

- **Runtime:** Node.js 24+ / TypeScript 5.x
- **Monorepo:** Turborepo + pnpm workspaces
- **Backend:** NestJS v11 with SWC compilation
- **Frontend:** React 19, Vite 6, TanStack Router, TanStack Query, Tailwind CSS 4, Shadcn/ui
- **Database:** PostgreSQL 17 with pgvector extension
- **ORM:** Drizzle ORM with code-first migrations
- **Auth:** Keycloak OIDC with JWT validation
- **Slack:** `@slack/web-api` SDK with custom retry/rate-limit handling
- **LLM:** `@google/generative-ai` SDK (Gemini fallback) + native `fetch` (CPU model via Ollama)
- **Testing:** Vitest with Testing Library

## License

Private — see `package.json`.
