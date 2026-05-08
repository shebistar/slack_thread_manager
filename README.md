# Slack Thread Manager

A self-hosted project intelligence platform that passively observes Slack conversations and transforms them into organized, role-personalized, searchable team memory.

## Features

- **Authentication & Authorization** — Keycloak OIDC single sign-on with role-based access control (`@Roles('ADMIN')` decorator, `RolesGuard`, route-level guards)
- **Admin Panel** — Tabbed administration interface (Roster, Channels, System) restricted to ADMIN users
- **Team Roster Management** — Full CRUD for team members with email, Slack handle, role assignment, and multi-workstream mapping; sortable table with inline editing and confirmation dialogs
- **Channel Configuration** — Configure which Slack channels the system monitors; map channels to workstreams; toggle active/inactive status; Slack Channel ID format validation (`C`, `G`, or `D` prefix)
- **Slack API Client** — Bot token-based integration with `@slack/web-api`; channel history, thread replies, and channel info retrieval; exponential backoff with jitter; Slack rate-limit (`Retry-After`) awareness; graceful degradation when unconfigured
- **Dashboard Shell** — Responsive navigation with role-gated links, Red Hat typography, branded header with role badge and logout, dynamic page titles
- **In-App Help** — Documentation page with Getting Started guide, feature descriptions, role/permission reference, and changelog; accessible from navbar and footer
- **Version Display** — Application version shown in the global footer, injected at build time

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 10
- Podman & podman-compose
- Keycloak instance (for authentication)
- Slack Bot Token (`xoxb-*`) with `channels:history`, `channels:read` scopes (optional — Slack integration is disabled without it)

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

| GET | `/api/slack/status` | Slack integration health check |
| GET | `/api/slack/channels/:channelId` | Get Slack channel info |
| GET | `/api/slack/channels/:channelId/history` | Fetch channel message history |
| GET | `/api/slack/channels/:channelId/threads/:threadTs` | Fetch thread replies |

All `/admin/*` and `/slack/*` endpoints require the `ADMIN` role.

## Tech Stack

- **Runtime:** Node.js 20+ / TypeScript 5.x
- **Monorepo:** Turborepo + pnpm workspaces
- **Backend:** NestJS v11 with SWC compilation
- **Frontend:** React 19, Vite 6, TanStack Router, TanStack Query, Tailwind CSS 4, Shadcn/ui
- **Database:** PostgreSQL 17 with pgvector extension
- **ORM:** Drizzle ORM with code-first migrations
- **Auth:** Keycloak OIDC with JWT validation
- **Slack:** `@slack/web-api` SDK with custom retry/rate-limit handling
- **Testing:** Vitest with Testing Library

## License

Private — see `package.json`.
