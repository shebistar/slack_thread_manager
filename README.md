# Slack Thread Manager

A self-hosted project intelligence platform that passively observes Slack conversations and transforms them into organized, role-personalized, searchable team memory.

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 10
- Podman & podman-compose

### Setup

```bash
# Install dependencies
pnpm install

# Start PostgreSQL (with pgvector)
podman-compose up -d

# Copy environment file
cp .env.example .env

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
| PostgreSQL | localhost:5432 | Database (via Docker) |

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

- **apps/api** — NestJS v11 backend with REST API
- **apps/web** — React 19 + Vite + Tailwind CSS 4 + Shadcn/ui
- **packages/db** — Drizzle ORM schemas and migrations (PostgreSQL 17 + pgvector)
- **packages/shared** — Zod schemas, types, and constants shared across apps
- **packages/config** — Shared ESLint and TypeScript configurations

## Tech Stack

- **Runtime:** Node.js 20+ / TypeScript 5.x
- **Monorepo:** Turborepo + pnpm workspaces
- **Backend:** NestJS v11 with SWC compilation
- **Frontend:** React 19, Vite 6, Tailwind CSS 4, Shadcn/ui
- **Database:** PostgreSQL 17 with pgvector extension
- **ORM:** Drizzle ORM with code-first migrations
- **Testing:** Vitest
