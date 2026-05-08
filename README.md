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

### Epic 3 — Knowledge Transformation Pipeline (in progress)

- **LLM Abstraction Layer** — Provider-agnostic `LlmService` behind `LlmProviderInterface`; `CpuModelProvider` for local OpenAI-compatible inference (Ollama / phi3:mini); `GeminiProvider` for Google Gemini 2.5 Flash fallback via `@google/generative-ai` SDK; 2 + 2 retry-then-fallback strategy with `LlmPendingRetryError`; batch-level fallback rate tracking with configurable `LLM_FALLBACK_RATE_THRESHOLD` warning
- **LLM Health Endpoint** — `GET /api/admin/llm/health` returns per-provider healthy/unhealthy status and aggregated `ok | degraded` state; requires ADMIN role

## Quick Start

### Prerequisites

- Node.js >= 22
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

**Admin — Ingestion & LLM**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/ingestion/backfill` | Trigger async historical backfill (HTTP 202) |
| GET | `/api/admin/ingestion/backfill/:jobId` | Poll backfill job status |
| GET | `/api/admin/health` | System health check |
| GET | `/api/admin/llm/health` | LLM provider health (cpu + gemini) |

**Slack (proxy)**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/slack/status` | Slack integration health check |
| GET | `/api/slack/channels/:channelId` | Get Slack channel info |
| GET | `/api/slack/channels/:channelId/history` | Fetch channel message history |
| GET | `/api/slack/channels/:channelId/threads/:threadTs` | Fetch thread replies |

All `/admin/*` and `/slack/*` endpoints require the `ADMIN` role.

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
| `CPU_MODEL_URL` | — | Ollama / OpenAI-compatible endpoint URL |
| `CPU_MODEL_NAME` | `phi3:mini` | Completion model name |
| `CPU_EMBED_MODEL_NAME` | `nomic-embed-text` | Embedding model name |
| `GEMINI_API_KEY` | — | Google Gemini API key; fallback disabled if absent |
| `GEMINI_MODEL_NAME` | `gemini-2.5-flash` | Gemini model name |
| `LLM_TIMEOUT_MS` | `60000` | Per-call timeout for LLM providers |
| `LLM_FALLBACK_RATE_THRESHOLD` | `0.5` | Warn when fallback rate exceeds this |

## Tech Stack

- **Runtime:** Node.js 22+ / TypeScript 5.x
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
