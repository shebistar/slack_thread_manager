---
stepsCompleted:
  - "step-01-init"
  - "step-02-context"
  - "step-03-starter"
  - "step-04-decisions"
  - "step-05-patterns"
  - "step-06-structure"
  - "step-07-validation"
  - "step-08-complete"
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "_bmad-output/planning-artifacts/product-brief-slack_thread_manager.md"
  - "_bmad-output/planning-artifacts/prfaq-slack_thread_manager-distillate.md"
  - "_bmad-output/brainstorming/brainstorming-session-2026-05-05-1219.md"
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-05-06'
project_name: 'slack_thread_manager'
user_name: 'Shebi'
date: '2026-05-06'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

40 FRs across 7 capability areas define a batch-driven intelligence pipeline with a web dashboard:

| Capability Area | FRs | Architectural Implication |
|----------------|-----|--------------------------|
| Slack Data Ingestion (FR1-4) | Read-only batch polling, backfill, thread update detection | Scheduled job, Slack API client, idempotent ingestion |
| Knowledge Transformation (FR5-9) | Classification, summarization, cross-workstream correlation, orphaned action detection | LLM processing pipeline, abstraction layer for model swapping |
| Daily Briefings (FR10-14) | Role-filtered generation, source linking, backfill briefings for new members | Briefing generator service, role-based templates, deep-link construction |
| Search & Discovery (FR15-17) | Natural language queries, sourced answers, cross-channel search | Search index, LLM-powered query processing, result ranking |
| Silence Detection (FR18-21) | Configurable thresholds, workday-aware calculations, per-workstream tuning | Activity tracker, threshold engine, calendar-aware scheduling |
| Anonymization & Data Governance (FR22-28) | Three-layer gate (blocklist + LLM + human review), staging pipeline | Content filter pipeline, staging queue, admin review interface |
| Team & System Admin (FR29-40) | Roster CRUD, channel config, dashboard with role-based views, authentication | Admin API, RBAC, SPA with adaptive layout |

**Non-Functional Requirements:**

| Category | Key Constraints | Architectural Impact |
|----------|----------------|---------------------|
| Performance | Batch cycle completes before India workday start; search < 5s; SPA load < 3s | Batch scheduling with timezone awareness; search index optimization; lightweight SPA bundle |
| Security | All routes authenticated; HTTPS/TLS; bot token secured; anonymization gates all output | Auth middleware; TLS termination (OpenShift route); secrets management; staging pipeline enforcement |
| Integration | Slack API with rate limit handling; LLM abstraction with Gemini Pro fallback; API version detection | Retry-with-backoff client; provider-agnostic LLM interface; API compatibility checks |
| Reliability | 1-day outage acceptable; missed briefings covered on next run; idempotent ingestion; crash-safe persistence | No HA requirement; catch-up logic in batch scheduler; idempotent writes; durable storage |

### Scale & Complexity

- **Primary domain:** Full-stack web application + backend intelligence pipeline
- **Complexity level:** Medium-high
- **User scale:** ~30 authenticated users, ~10 threads/day, ~4 Slack channels
- **Data volume:** Low (text-only, no media assets)
- **Data model:** Threads → classified topics → briefing artifacts → staged output
- **Processing model:** Batch (not real-time) — ingestion, LLM processing, briefing generation all run on scheduled cycles
- **UI complexity:** Medium-high — SPA with 3 adaptive layout variants (Dashboard, News Feed, Split Panel), AI enrichment side panel, admin surfaces

### Technical Constraints & Dependencies

- **Compute:** CPU-only server (no GPU) — constrains LLM model selection to CPU-optimized models
- **Deployment:** OpenShift cluster operated by single admin (Shebi) — Kubernetes-native, containerized
- **LLM fallback:** Gemini Pro via company license — requires network access to Google API, needs permission path
- **Slack API:** Read-only bot token, standard rate limits, batch polling model
- **External knowledge sources:** NotebookLM (existing, controlled by Shebi), Red Hat OpenShift public documentation
- **Design system:** Shadcn/ui + Tailwind CSS with Red Hat Design System palette (Red Hat Display/Text/Mono fonts)
- **Browser support:** Latest stable Chrome, Firefox, Edge, Safari — no legacy support
- **Operational model:** Solo operator — architecture must minimize operational complexity

### Cross-Cutting Concerns

- **Authentication & RBAC:** Every route requires auth; role determines layout variant, data scope, and admin access. Roles: Architect, PM, Consultant, Sales, Training, Admin.
- **Anonymization enforcement:** The staging pipeline cross-cuts all output paths — briefings, search results, and any user-facing content must pass through the three-layer gate before delivery.
- **LLM abstraction:** Classification, summarization, entity detection, search, and enrichment all depend on LLM processing. The abstraction layer must support model swapping (CPU model ↔ Gemini Pro) without changing the pipeline.
- **Source provenance:** Every piece of generated content must link back to its original Slack thread(s). This deep-link requirement cross-cuts briefings, search results, and enrichment panel.
- **Batch orchestration:** Ingestion → LLM processing → anonymization staging → briefing delivery is a sequential pipeline. Failure at any stage must not corrupt data or deliver unreviewed content.

## Starter Template Evaluation

### Primary Technology Domain

**Full-stack web application + backend intelligence pipeline** — based on project requirements analysis. Three workload types share a monorepo codebase:

1. **SPA Frontend** — React + Vite + Shadcn/ui + Tailwind CSS (decided in UX spec)
2. **API Backend** — serves the SPA, handles auth, admin, search
3. **Batch Pipeline** — ingestion, LLM processing, anonymization staging, briefing generation

### Technical Preferences Established

| Preference | Choice | Source |
|-----------|--------|--------|
| Language | TypeScript (full-stack) | React/Shadcn/ui dictates frontend; unified language maximizes AI agent effectiveness |
| Database | PostgreSQL | User preference |
| Repository | Monorepo (Turborepo + pnpm) | User preference |
| Frontend | React 19 + Vite | UX spec (Shadcn/ui requires React; SPA with no SSR → Vite over Next.js) |
| Design system | Shadcn/ui + Tailwind CSS + Red Hat palette | UX spec |
| Deployment | Containerized on OpenShift | PRD constraint |

### Starter Options Considered

#### Option A: Existing Community Starter (e.g., `nasroykh/app_template`)

**Stack:** Hono + React 19 + Drizzle + Turborepo (Feb 2026)

| Aspect | Assessment |
|--------|-----------|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | React 19 + Vite + Tailwind CSS — close match |
| Backend | Hono — lightweight, but lacks built-in DI, scheduling, guards |
| ORM | Drizzle — SQL-native, lightweight |
| Auth | Better Auth — generic, needs RBAC customization |
| **Fit verdict** | **Partial.** Frontend matches well, but Hono is too minimal for the batch pipeline and RBAC requirements. Heavy customization needed. |

#### Option B: T3 Stack (`create-t3-app` v7.40)

**Stack:** Next.js + tRPC + Tailwind + Drizzle/Prisma

| Aspect | Assessment |
|--------|-----------|
| Architecture | Next.js monolith — frontend + backend coupled |
| Monorepo | Not a traditional monorepo — single Next.js app |
| Backend | Next.js API routes — no built-in scheduling, limited DI |
| Pipeline | Would need a separate process for batch pipeline anyway |
| **Fit verdict** | **Poor.** Next.js adds SSR complexity not needed (no SEO, desktop SPA). Doesn't solve the batch pipeline problem. Fights the monorepo structure. |

#### Option C: Custom Turborepo Monorepo with NestJS (Selected)

**Stack:** NestJS + React/Vite + Drizzle ORM + Turborepo

| Aspect | Assessment |
|--------|-----------|
| Monorepo | Turborepo + pnpm workspaces — industry standard |
| Frontend | React 19 + Vite + Shadcn/ui + Tailwind CSS — exact UX spec match |
| Backend | NestJS — opinionated, TypeScript-first, built-in scheduling, guards, DI |
| ORM | Drizzle ORM — SQL-native, lightweight, excellent PostgreSQL support |
| Auth | NestJS Guards + Passport — purpose-built RBAC |
| Pipeline | NestJS `@nestjs/schedule` + `@nestjs/bull` — native batch orchestration |
| **Fit verdict** | **Strong.** Every component serves a specific project need. |

### Selected Starter: Custom Turborepo Monorepo with NestJS

**Rationale for Selection:**

No existing community starter matches the specific combination of NestJS + React/Vite + Drizzle + Turborepo + PostgreSQL at the quality level needed. A custom scaffold from Turborepo's official template, with hand-picked packages, gives maximum control and avoids ripping out unwanted dependencies.

**Why NestJS:**

- **Opinionated structure** — modules, controllers, services, and dependency injection enforce consistent patterns. AI agents generate predictable, non-drifting code.
- **Built-in scheduling** — `@nestjs/schedule` provides cron-based batch orchestration (ingestion → LLM processing → anonymization → briefing delivery).
- **Built-in guards** — maps directly to the RBAC requirement (6 roles determining layout variant, data scope, admin access).
- **Built-in interceptors** — natural fit for the anonymization pipeline (content passes through interceptors before response).
- **TypeScript-first** — decorators and metadata reflection provide strong typing throughout.
- **Massive training corpus** — the most AI-agent-compatible backend framework, with predictable conventions that reduce hallucination.

**Why Drizzle ORM over Prisma:**

| Factor | Drizzle | Prisma 7 |
|--------|---------|----------|
| Bundle size | ~7KB | ~600KB–1.6MB |
| Schema definition | TypeScript code (no separate DSL) | Custom `.prisma` file |
| SQL control | SQL-native syntax — important for batch pipeline queries | Abstracted away |
| Migration | Code-first, `drizzle-kit` generates SQL | `prisma migrate` |
| PostgreSQL features | Full access to PG-specific features | Good but abstracted |

Drizzle's direct SQL control is better suited for the complex aggregation queries in the intelligence pipeline.

**Initialization Command:**

```bash
pnpm dlx create-turbo@latest slack-thread-manager --package-manager pnpm
```

**Proposed Monorepo Structure:**

```
slack-thread-manager/
├── apps/
│   ├── web/          # React 19 + Vite + Shadcn/ui + Tailwind CSS
│   └── api/          # NestJS + Drizzle ORM + PostgreSQL
├── packages/
│   ├── db/           # Drizzle schema, migrations, client
│   ├── shared/       # Shared types, constants, utilities
│   └── config/       # Shared ESLint, TypeScript, Tailwind configs
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── Dockerfile        # Multi-stage build for OpenShift
└── docker-compose.yml # Local dev (PostgreSQL + app)
```

**Architectural Decisions Provided by Starter:**

- **Language & Runtime:** TypeScript 5.x across all packages; Node.js 22 LTS
- **Styling Solution:** Tailwind CSS 4 + Shadcn/ui + Red Hat Design System tokens
- **Build Tooling:** Vite (frontend), tsc + SWC (NestJS backend), Turborepo caching
- **Testing Framework:** Vitest (unit/integration), Playwright (E2E — post-MVP)
- **Code Organization:** Turborepo workspaces with shared `packages/db` and `packages/shared`
- **Development Experience:** Turborepo parallel dev (`turbo dev`), hot reload on both apps, Docker Compose for local PostgreSQL

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Authentication | Red Hat SSO / Keycloak (OIDC) | Corporate SSO, zero user management, maps to OpenShift identity |
| 2 | Database | PostgreSQL (single data store) | Relational + JSONB + pgvector covers all data patterns; solo operator simplicity |
| 3 | API Design | REST with NestJS controllers | Modest API surface, well-understood, auto-generated OpenAPI docs |
| 4 | State Management | TanStack Query + Zustand | Server state (briefings/search) + minimal client state (UI preferences) |
| 5 | Data Validation | Zod (shared schemas) | Single library for frontend forms + backend API + pipeline validation |

**Important Decisions (Shape Architecture):**

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 6 | Authorization | NestJS Guards with RBAC decorator | 6 roles mapped to layout variants, data scopes, admin access |
| 7 | Frontend Routing | TanStack Router | Type-safe, file-based routes, Vite-native |
| 8 | Search Strategy | PostgreSQL FTS + pgvector | Keyword search via tsvector/GIN; semantic search via LLM embeddings |
| 9 | Batch Orchestration | @nestjs/schedule + @nestjs/bull | Cron scheduling + job queues for the intelligence pipeline |
| 10 | Logging | NestJS Logger (structured JSON) | OpenShift-compatible log aggregation |

**Deferred Decisions (Post-MVP):**

| # | Decision | Deferral Rationale |
|---|----------|--------------------|
| 1 | Caching layer (Redis) | ~30 users, batch-generated content — PostgreSQL reads sufficient at this scale |
| 2 | E2E testing (Playwright) | Unit/integration tests first; E2E after stable UI |
| 3 | Horizontal scaling | Single-pod deployment sufficient; revisit after first feedback round |
| 4 | CDN / static asset optimization | Desktop-only, internal users on corporate network |

### Data Architecture

**Database:** PostgreSQL 17 with extensions:
- `pgvector` — stores LLM embeddings for semantic search (cosine similarity)
- Built-in full-text search — `tsvector` columns with GIN indexes for keyword search

**Data Modeling Approach:** Relational core with JSONB flexibility:
- **Structured tables:** users, roles, workstreams, channels, briefings, anonymization staging queue
- **JSONB columns:** raw Slack API responses, LLM output metadata, enrichment panel content (variable structure)
- **Vector columns:** thread embeddings for semantic search via pgvector

**ORM & Migrations:** Drizzle ORM with `drizzle-kit`:
- TypeScript-first schema definitions in `packages/db`
- Code-first migrations — `drizzle-kit generate` produces SQL migration files
- Migration files committed to repo for reproducible deployments

**Data Validation:** Zod schemas in `packages/shared`:
- API request/response validation (NestJS pipes)
- Frontend form validation (Shadcn/ui form components)
- Pipeline data validation (batch processing integrity checks)
- Single source of truth for data shapes across the monorepo

### Authentication & Security

**Authentication:** Red Hat SSO / Keycloak via OpenID Connect (OIDC):
- Users authenticate with corporate credentials — no local password management
- NestJS `@nestjs/passport` with `passport-openidconnect` strategy
- JWT tokens issued by Keycloak, validated by NestJS guards
- Session stored server-side (PostgreSQL session store) for revocation capability

**Authorization:** Role-Based Access Control (RBAC):
- 6 roles: Architect, PM, Consultant, Sales, Training, Admin
- Custom `@Roles()` decorator on NestJS controllers
- `RolesGuard` checks JWT claims against required roles
- Role determines: layout variant (Dashboard/Feed/Split), data scope (workstreams), admin access

**API Security:**
- CORS configured for SPA origin only
- Helmet middleware for HTTP security headers
- Rate limiting via `@nestjs/throttler` (protection against runaway clients)
- TLS termination at OpenShift Route level (not application-level)
- Slack bot token and Keycloak secrets in OpenShift Secrets, injected as environment variables

**Anonymization Pipeline Security:**
- All user-facing content passes through the three-layer gate before delivery
- Staging queue in PostgreSQL with admin review interface
- No content bypasses anonymization — enforced at the service layer, not the controller

### API & Communication Patterns

**API Style:** RESTful with NestJS decorators:
- Resource-based routes (`/api/briefings`, `/api/search`, `/api/admin/roster`)
- Standard HTTP methods and status codes
- Consistent error response format with Zod validation errors

**API Documentation:** Swagger/OpenAPI auto-generated:
- `@nestjs/swagger` decorators on controllers and DTOs
- Swagger UI available at `/api/docs` (dev/staging only)
- OpenAPI spec serves as contract for frontend development

**Error Handling:** Structured error responses:
- NestJS exception filters for consistent error formatting
- Zod validation errors mapped to 400 responses with field-level detail
- LLM/external service failures return 503 with retry guidance
- All errors logged with structured JSON for OpenShift log aggregation

### Frontend Architecture

**State Management:**
- **TanStack Query** — all server data (briefings, search results, admin data). Provides caching, background refetch, optimistic updates, loading/error states.
- **Zustand** — minimal client state: active role filter, sidebar open/closed, read state tracking, UI preferences. No Redux boilerplate.

**Routing:** TanStack Router:
- File-based route definitions in `apps/web/src/routes/`
- Type-safe route parameters and search params
- Route-level code splitting for bundle optimization
- Auth guard at router level (redirect to Keycloak login)

**Component Architecture:**
- Shadcn/ui primitives + 6 custom components (from UX spec)
- Colocation: component + styles + tests in same directory
- Shared types from `packages/shared` — no frontend-only type definitions for API data

**Bundle Optimization:**
- Vite code splitting by route
- Tree-shaking of Shadcn/ui (only imported components bundled)
- Red Hat fonts self-hosted (no Google Fonts CDN dependency on corporate network)

### Infrastructure & Deployment

**Container Strategy:**
- Multi-stage Dockerfile: build stage (Node.js 22 + pnpm) → production stage (Node.js 22 slim)
- Single container: NestJS serves both the API and the static SPA build
- OpenShift Deployment with resource limits (CPU/memory)

**Environment Configuration:**
- `@nestjs/config` with Zod-validated environment variables
- OpenShift ConfigMaps for non-sensitive config (batch schedule, channel list)
- OpenShift Secrets for sensitive values (Slack token, Keycloak client secret, database credentials)
- Docker Compose for local development (PostgreSQL + pgvector + app)

**CI/CD:** OpenShift BuildConfig or GitHub Actions → OpenShift image push:
- Build: `turbo build` (parallel frontend + backend build)
- Test: `turbo test` (Vitest unit/integration)
- Deploy: Container image push to OpenShift internal registry

**Monitoring & Logging:**
- Structured JSON logs from NestJS Logger → OpenShift log aggregation
- Health check endpoint (`/api/health`) for OpenShift readiness/liveness probes
- Batch pipeline status endpoint (`/api/admin/pipeline-status`) for operational visibility

### Decision Impact Analysis

**Implementation Sequence:**
1. Project scaffold (Turborepo + monorepo structure)
2. Database schema + Drizzle setup (`packages/db`)
3. NestJS API with Keycloak auth + RBAC guards
4. Slack ingestion batch job
5. LLM pipeline (classification, summarization, embeddings)
6. Anonymization staging pipeline
7. Briefing generation service
8. Frontend SPA (adaptive layout + briefing views)
9. Search (FTS + pgvector semantic)
10. Admin surfaces

**Cross-Component Dependencies:**
- `packages/db` → used by both `apps/api` (NestJS) and indirectly by `apps/web` (via API)
- `packages/shared` → Zod schemas shared by frontend validation and backend pipes
- Keycloak → must be deployed on OpenShift before API auth works
- LLM abstraction → used by ingestion pipeline, search, and enrichment panel

## Implementation Patterns & Consistency Rules

These patterns prevent AI agents from making conflicting implementation choices. Every agent building on this codebase must follow these conventions exactly.

### Naming Patterns

**Database (PostgreSQL + Drizzle):**

| Element | Convention | Example |
|---------|-----------|---------|
| Tables | snake_case, plural | `users`, `briefings`, `slack_threads` |
| Columns | snake_case | `user_id`, `created_at`, `workstream_id` |
| Foreign keys | `{referenced_table_singular}_id` | `user_id`, `workstream_id` |
| Indexes | `idx_{table}_{columns}` | `idx_users_email`, `idx_threads_channel_id` |
| Enums | snake_case type, UPPER_CASE values | `user_role` → `ARCHITECT`, `PM`, `CONSULTANT` |

Drizzle maps snake_case DB columns to camelCase TypeScript properties automatically. Agents must define schemas in snake_case and consume them in camelCase — no manual mapping.

**API (NestJS REST):**

| Element | Convention | Example |
|---------|-----------|---------|
| Endpoints | kebab-case, plural nouns | `/api/briefings`, `/api/slack-threads` |
| Route params | camelCase | `/api/briefings/:briefingId` |
| Query params | camelCase | `?workstreamId=1&includeArchived=false` |
| JSON fields | camelCase | `{ userId, createdAt, workstreamName }` |
| Headers | Standard HTTP convention | `Authorization`, `Content-Type` |

**Code (TypeScript):**

| Element | Convention | Example |
|---------|-----------|---------|
| Files (NestJS) | kebab-case | `briefing.service.ts`, `roles.guard.ts` |
| Files (React) | kebab-case | `briefing-card.tsx`, `use-briefings.ts` |
| Classes/Components | PascalCase | `BriefingService`, `BriefingCard` |
| Functions/methods | camelCase | `getBriefingsByRole()`, `useBriefings()` |
| Variables | camelCase | `currentUser`, `briefingList` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_ATTEMPTS`, `BATCH_SCHEDULE_CRON` |
| Types/Interfaces | PascalCase, no `I` prefix | `Briefing`, `UserRole`, `SearchResult` |
| Zod schemas | camelCase + `Schema` suffix | `briefingSchema`, `createUserSchema` |

### Structure Patterns

**NestJS Backend (`apps/api/src/`):**

```
src/
├── modules/
│   ├── auth/           # Keycloak OIDC, guards, RBAC
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── roles.guard.ts
│   │   ├── decorators/
│   │   │   └── roles.decorator.ts
│   │   └── auth.service.spec.ts
│   ├── briefings/      # Briefing generation + delivery
│   ├── ingestion/      # Slack polling + thread storage
│   ├── pipeline/       # LLM processing + anonymization
│   ├── search/         # FTS + pgvector semantic search
│   ├── admin/          # Roster, channels, system config
│   └── silence/        # Gone-quiet detection
├── common/
│   ├── filters/        # Exception filters
│   ├── interceptors/   # Response transform, logging
│   ├── pipes/          # Zod validation pipe
│   └── decorators/     # Shared decorators
├── config/             # @nestjs/config schemas
├── app.module.ts
└── main.ts
```

**React Frontend (`apps/web/src/`):**

```
src/
├── routes/             # TanStack Router file-based routes
│   ├── __root.tsx
│   ├── index.tsx       # Redirects to briefings
│   ├── briefings/
│   ├── search/
│   └── admin/
├── components/
│   ├── ui/             # Shadcn/ui components (auto-generated)
│   ├── briefing-card/
│   │   ├── briefing-card.tsx
│   │   └── briefing-card.test.tsx
│   ├── enrichment-panel/
│   ├── stats-bar/
│   └── silence-monitor/
├── hooks/              # Custom React hooks
│   ├── use-briefings.ts
│   └── use-search.ts
├── stores/             # Zustand stores
│   └── ui-store.ts
├── lib/                # Utilities (API client, date formatting)
└── styles/             # Global styles, Red Hat tokens
```

**Test Location:** Colocated — `*.spec.ts` next to the file it tests (NestJS convention), `*.test.tsx` for React. No separate `__tests__/` directory.

### Format Patterns

**API Success Response:**

```json
{
  "data": { ... },
  "meta": {
    "total": 42,
    "page": 1,
    "pageSize": 20
  }
}
```

Single item (no pagination):

```json
{
  "data": { "id": "abc", "title": "..." }
}
```

**API Error Response (NestJS exception filter):**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    { "field": "workstreamId", "message": "Required" }
  ]
}
```

**Date Format:** ISO 8601 strings in all API responses (`2026-05-06T10:30:00.000Z`). Frontend formats for display using `Intl.DateTimeFormat`.

**Null Handling:** Explicit `null` for absent optional fields — never `undefined` in API responses. Drizzle enforces this at the DB level.

### Communication Patterns

**NestJS Event Naming:** dot-notation, past tense — `briefing.generated`, `thread.ingested`, `staging.approved`. Payload always includes `{ eventId, timestamp, data }`.

**TanStack Query Keys:** Array format matching API structure — `['briefings', { role, workstreamId }]`, `['search', { query }]`, `['admin', 'roster']`. Consistent key factories in hooks files.

**Zustand Store Pattern:** Single flat store for UI state, actions defined inside the store:

```typescript
interface UIStore {
  sidebarOpen: boolean;
  activeWorkstream: string | null;
  toggleSidebar: () => void;
  setActiveWorkstream: (id: string | null) => void;
}
```

### Process Patterns

**Error Handling:**
- **Backend:** NestJS exception filters catch all errors. Business logic throws typed exceptions (`NotFoundException`, `ForbiddenException`). External service failures (Slack, LLM) wrapped in `ServiceUnavailableException` with retry metadata.
- **Frontend:** TanStack Query `onError` callbacks + React Error Boundaries at route level. Toast notifications (Shadcn/ui Sonner) for transient errors. Full-page error state for auth failures.

**Loading States:**
- TanStack Query's `isLoading` / `isPending` / `isFetching` states drive UI
- Skeleton components (from UX spec) for initial loads
- Subtle spinner overlay for background refetch
- No custom loading state management — TanStack Query handles it

**Retry Patterns:**
- Slack API: exponential backoff with jitter, max 3 retries, respect `Retry-After` header
- LLM calls: 2 retries on timeout, then fallback to Gemini Pro
- Frontend API: TanStack Query default retry (3 attempts with exponential backoff)

**Logging Levels:**
- `error` — unrecoverable failures, pipeline corruption
- `warn` — degraded operation (LLM fallback triggered, retry needed)
- `log` — pipeline milestones (batch started/completed, briefing generated)
- `debug` — detailed processing (thread classified, entity detected)

### Enforcement Guidelines

**All AI agents MUST:**
1. Follow naming conventions exactly — any deviation creates runtime errors across the monorepo
2. Place tests colocated with source files — never create separate test directories
3. Use Zod schemas from `packages/shared` — never define duplicate types locally
4. Wrap all API responses in `{ data }` format — the frontend's API client depends on it
5. Use NestJS module boundaries — never import directly from another module's internals
6. Log with structured JSON using NestJS Logger — never use `console.log`

**Anti-Patterns (agents must avoid):**
- Creating a `types.ts` in a frontend component when the type exists in `packages/shared`
- Using `console.log` instead of NestJS Logger
- Returning bare objects from API endpoints without `{ data }` wrapper
- Using PascalCase or camelCase for database table/column names
- Placing test files in a separate `__tests__/` directory
- Importing a service directly from another NestJS module's file instead of through its module exports

## Project Structure & Boundaries

### Complete Project Directory Structure

```
slack-thread-manager/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Build + test on PR
│       └── deploy.yml                # Push to OpenShift registry
├── .vscode/
│   ├── settings.json                 # Shared editor settings
│   └── extensions.json               # Recommended extensions
├── apps/
│   ├── api/                          # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.module.ts
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.service.spec.ts
│   │   │   │   │   ├── strategies/
│   │   │   │   │   │   └── oidc.strategy.ts
│   │   │   │   │   ├── guards/
│   │   │   │   │   │   ├── jwt-auth.guard.ts
│   │   │   │   │   │   └── roles.guard.ts
│   │   │   │   │   └── decorators/
│   │   │   │   │       ├── roles.decorator.ts
│   │   │   │   │       └── current-user.decorator.ts
│   │   │   │   ├── ingestion/                  # FR1-4: Slack data ingestion
│   │   │   │   │   ├── ingestion.module.ts
│   │   │   │   │   ├── ingestion.service.ts
│   │   │   │   │   ├── ingestion.service.spec.ts
│   │   │   │   │   ├── slack-client.service.ts
│   │   │   │   │   ├── slack-client.service.spec.ts
│   │   │   │   │   └── jobs/
│   │   │   │   │       ├── polling.job.ts       # Scheduled batch polling
│   │   │   │   │       └── backfill.job.ts      # Historical backfill
│   │   │   │   ├── pipeline/                    # FR5-9: Knowledge transformation
│   │   │   │   │   ├── pipeline.module.ts
│   │   │   │   │   ├── pipeline.service.ts
│   │   │   │   │   ├── pipeline.service.spec.ts
│   │   │   │   │   ├── llm/
│   │   │   │   │   │   ├── llm.module.ts
│   │   │   │   │   │   ├── llm.service.ts       # Provider-agnostic interface
│   │   │   │   │   │   ├── llm.service.spec.ts
│   │   │   │   │   │   ├── providers/
│   │   │   │   │   │   │   ├── cpu-model.provider.ts
│   │   │   │   │   │   │   └── gemini.provider.ts
│   │   │   │   │   │   └── llm-provider.interface.ts
│   │   │   │   │   ├── processors/
│   │   │   │   │   │   ├── classifier.processor.ts
│   │   │   │   │   │   ├── summarizer.processor.ts
│   │   │   │   │   │   ├── embedder.processor.ts
│   │   │   │   │   │   └── correlator.processor.ts
│   │   │   │   │   └── anonymization/           # FR22-28: Three-layer gate
│   │   │   │   │       ├── anonymization.service.ts
│   │   │   │   │       ├── anonymization.service.spec.ts
│   │   │   │   │       ├── blocklist.filter.ts
│   │   │   │   │       ├── llm-entity.filter.ts
│   │   │   │   │       └── staging-queue.service.ts
│   │   │   │   ├── briefings/                   # FR10-14: Daily briefings
│   │   │   │   │   ├── briefings.module.ts
│   │   │   │   │   ├── briefings.controller.ts
│   │   │   │   │   ├── briefings.service.ts
│   │   │   │   │   ├── briefings.service.spec.ts
│   │   │   │   │   ├── briefings.controller.spec.ts
│   │   │   │   │   ├── generators/
│   │   │   │   │   │   ├── executive-scan.generator.ts
│   │   │   │   │   │   ├── filtered-brief.generator.ts
│   │   │   │   │   │   └── intelligence-report.generator.ts
│   │   │   │   │   └── jobs/
│   │   │   │   │       └── briefing-generation.job.ts
│   │   │   │   ├── search/                      # FR15-17: Search & discovery
│   │   │   │   │   ├── search.module.ts
│   │   │   │   │   ├── search.controller.ts
│   │   │   │   │   ├── search.service.ts
│   │   │   │   │   ├── search.service.spec.ts
│   │   │   │   │   ├── fts.service.ts           # PostgreSQL tsvector
│   │   │   │   │   └── vector-search.service.ts # pgvector semantic
│   │   │   │   ├── silence/                     # FR18-21: Gone-quiet detection
│   │   │   │   │   ├── silence.module.ts
│   │   │   │   │   ├── silence.service.ts
│   │   │   │   │   ├── silence.service.spec.ts
│   │   │   │   │   └── jobs/
│   │   │   │   │       └── silence-check.job.ts
│   │   │   │   ├── admin/                       # FR29-40: Admin surfaces
│   │   │   │   │   ├── admin.module.ts
│   │   │   │   │   ├── roster/
│   │   │   │   │   │   ├── roster.controller.ts
│   │   │   │   │   │   ├── roster.service.ts
│   │   │   │   │   │   └── roster.service.spec.ts
│   │   │   │   │   ├── channels/
│   │   │   │   │   │   ├── channels.controller.ts
│   │   │   │   │   │   └── channels.service.ts
│   │   │   │   │   ├── staging/
│   │   │   │   │   │   ├── staging.controller.ts
│   │   │   │   │   │   └── staging.service.ts
│   │   │   │   │   └── system/
│   │   │   │   │       ├── system.controller.ts  # Health, pipeline status
│   │   │   │   │       └── system.service.ts
│   │   │   │   └── enrichment/                   # AI enrichment side panel
│   │   │   │       ├── enrichment.module.ts
│   │   │   │       ├── enrichment.controller.ts
│   │   │   │       ├── enrichment.service.ts
│   │   │   │       └── sources/
│   │   │   │           ├── notebooklm.source.ts
│   │   │   │           └── openshift-docs.source.ts
│   │   │   ├── common/
│   │   │   │   ├── filters/
│   │   │   │   │   └── http-exception.filter.ts
│   │   │   │   ├── interceptors/
│   │   │   │   │   ├── response-transform.interceptor.ts
│   │   │   │   │   └── logging.interceptor.ts
│   │   │   │   ├── pipes/
│   │   │   │   │   └── zod-validation.pipe.ts
│   │   │   │   └── decorators/
│   │   │   │       └── api-paginated.decorator.ts
│   │   │   ├── config/
│   │   │   │   ├── app.config.ts
│   │   │   │   ├── database.config.ts
│   │   │   │   ├── keycloak.config.ts
│   │   │   │   ├── slack.config.ts
│   │   │   │   └── llm.config.ts
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── vitest.config.ts
│   │   └── package.json
│   └── web/                           # React SPA frontend
│       ├── src/
│       │   ├── routes/                # TanStack Router file-based
│       │   │   ├── __root.tsx         # Root layout (nav, auth check)
│       │   │   ├── index.tsx          # Redirect to /briefings
│       │   │   ├── briefings/
│       │   │   │   ├── index.tsx      # Adaptive layout (Dashboard/Feed/Split)
│       │   │   │   └── $briefingId.tsx
│       │   │   ├── search/
│       │   │   │   └── index.tsx      # Natural language search
│       │   │   └── admin/
│       │   │       ├── index.tsx      # Admin dashboard
│       │   │       ├── roster.tsx
│       │   │       ├── channels.tsx
│       │   │       ├── staging.tsx     # Anonymization review
│       │   │       └── system.tsx      # Pipeline status
│       │   ├── components/
│       │   │   ├── ui/                # Shadcn/ui (auto-generated)
│       │   │   │   ├── button.tsx
│       │   │   │   ├── card.tsx
│       │   │   │   ├── input.tsx
│       │   │   │   ├── skeleton.tsx
│       │   │   │   ├── sonner.tsx
│       │   │   │   └── ...            # Added via npx shadcn-ui add
│       │   │   ├── layout/
│       │   │   │   ├── app-header.tsx
│       │   │   │   ├── app-header.test.tsx
│       │   │   │   ├── nav-bar.tsx
│       │   │   │   ├── dashboard-layout.tsx    # Executive Scan variant
│       │   │   │   ├── feed-layout.tsx         # Filtered Brief variant
│       │   │   │   └── split-layout.tsx        # Intelligence Report variant
│       │   │   ├── briefing-card/
│       │   │   │   ├── briefing-card.tsx
│       │   │   │   └── briefing-card.test.tsx
│       │   │   ├── stats-bar/
│       │   │   │   ├── stats-bar.tsx
│       │   │   │   └── stats-bar.test.tsx
│       │   │   ├── enrichment-panel/
│       │   │   │   ├── enrichment-panel.tsx
│       │   │   │   └── enrichment-panel.test.tsx
│       │   │   ├── silence-monitor/
│       │   │   │   ├── silence-monitor.tsx
│       │   │   │   └── silence-monitor.test.tsx
│       │   │   ├── staging-review-item/
│       │   │   │   ├── staging-review-item.tsx
│       │   │   │   └── staging-review-item.test.tsx
│       │   │   └── workstream-filter/
│       │   │       ├── workstream-filter.tsx
│       │   │       └── workstream-filter.test.tsx
│       │   ├── hooks/
│       │   │   ├── use-briefings.ts
│       │   │   ├── use-search.ts
│       │   │   ├── use-enrichment.ts
│       │   │   ├── use-silence.ts
│       │   │   ├── use-auth.ts
│       │   │   └── use-admin.ts
│       │   ├── stores/
│       │   │   └── ui-store.ts
│       │   ├── lib/
│       │   │   ├── api-client.ts      # Fetch wrapper with auth headers
│       │   │   ├── query-client.ts    # TanStack Query config
│       │   │   ├── date-format.ts     # Intl.DateTimeFormat helpers
│       │   │   └── role-layout.ts     # Role → layout variant mapping
│       │   ├── styles/
│       │   │   ├── globals.css        # Tailwind directives + Red Hat tokens
│       │   │   └── fonts/             # Self-hosted Red Hat fonts
│       │   │       ├── RedHatDisplay-*.woff2
│       │   │       ├── RedHatText-*.woff2
│       │   │       └── RedHatMono-*.woff2
│       │   ├── app.tsx
│       │   └── main.tsx
│       ├── public/
│       │   └── favicon.svg
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── components.json            # Shadcn/ui config
│       └── package.json
├── packages/
│   ├── db/                            # Drizzle ORM + PostgreSQL
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── users.ts           # users, user_roles
│   │   │   │   ├── workstreams.ts     # workstreams, user_workstreams
│   │   │   │   ├── channels.ts        # slack_channels
│   │   │   │   ├── threads.ts         # slack_threads, thread_messages
│   │   │   │   ├── topics.ts          # classified_topics, topic_correlations
│   │   │   │   ├── briefings.ts       # briefings, briefing_items
│   │   │   │   ├── staging.ts         # staging_queue, staging_reviews
│   │   │   │   ├── silence.ts         # silence_alerts, silence_thresholds
│   │   │   │   ├── embeddings.ts      # thread_embeddings (pgvector)
│   │   │   │   └── index.ts           # Re-exports all schemas
│   │   │   ├── migrations/            # Drizzle Kit generated SQL
│   │   │   ├── seed.ts                # Development seed data
│   │   │   ├── client.ts              # Drizzle client factory
│   │   │   └── index.ts               # Package entry point
│   │   ├── drizzle.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── shared/                        # Shared types + Zod schemas
│   │   ├── src/
│   │   │   ├── schemas/
│   │   │   │   ├── user.schema.ts
│   │   │   │   ├── briefing.schema.ts
│   │   │   │   ├── search.schema.ts
│   │   │   │   ├── admin.schema.ts
│   │   │   │   ├── pipeline.schema.ts
│   │   │   │   └── index.ts
│   │   │   ├── types/
│   │   │   │   ├── user-role.type.ts
│   │   │   │   ├── briefing-shape.type.ts
│   │   │   │   ├── layout-variant.type.ts
│   │   │   │   └── index.ts
│   │   │   ├── constants/
│   │   │   │   ├── roles.ts           # Role → layout mapping
│   │   │   │   ├── pipeline.ts        # Batch config constants
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── config/                        # Shared tooling configs
│       ├── eslint/
│       │   └── base.js
│       ├── typescript/
│       │   └── base.json
│       └── package.json
├── docker/
│   ├── Dockerfile                     # Multi-stage production build
│   ├── Dockerfile.dev                 # Development with hot reload
│   └── nginx.conf                     # SPA fallback (optional)
├── .env.example                       # Template for all env vars
├── docker-compose.yml                 # Local dev: PostgreSQL + pgvector
├── turbo.json                         # Turborepo pipeline config
├── pnpm-workspace.yaml                # Workspace definitions
├── package.json                       # Root scripts
├── tsconfig.json                      # Root TypeScript config
├── .gitignore
├── .prettierrc
├── .eslintrc.js
└── README.md
```

### Architectural Boundaries

**API Boundaries (NestJS modules):**

| Boundary | Exposed To | Isolation Rule |
|----------|-----------|----------------|
| `auth` | All modules | Provides guards and decorators; no module imports auth internals |
| `ingestion` | `pipeline` (via events) | Emits `thread.ingested` event; pipeline subscribes |
| `pipeline` | `briefings`, `search` (via DB) | Writes processed data to DB; consumers read from DB |
| `pipeline/anonymization` | `briefings`, `search`, `admin/staging` | All content must pass through staging before delivery |
| `briefings` | Frontend via REST | Read-only API; generation happens in background jobs |
| `search` | Frontend via REST | Queries FTS + pgvector; returns ranked results |
| `enrichment` | Frontend via REST | On-demand LLM enrichment; external source queries |
| `admin` | Frontend via REST (admin role only) | RBAC-gated; full CRUD for roster, channels, staging |

**Data Flow (batch pipeline):**

```
Slack API → [ingestion] → slack_threads table
                              ↓ (event: thread.ingested)
                         [pipeline/processors] → classified_topics + embeddings
                              ↓
                         [pipeline/anonymization] → staging_queue
                              ↓ (admin approval)
                         [briefings/generators] → briefings table
                              ↓
                         [briefings API] → Frontend SPA
```

**Frontend ↔ Backend boundary:** All communication via REST. Frontend never accesses DB directly. The `api-client.ts` handles auth headers, response unwrapping, and error normalization.

### Requirements to Structure Mapping

| FR Category | Backend Module | Frontend Route/Component | DB Schema |
|-------------|---------------|-------------------------|-----------|
| Slack Ingestion (FR1-4) | `modules/ingestion/` | — (background jobs) | `threads.ts`, `channels.ts` |
| Knowledge Transform (FR5-9) | `modules/pipeline/` | — (background jobs) | `topics.ts`, `embeddings.ts` |
| Briefings (FR10-14) | `modules/briefings/` | `routes/briefings/`, `briefing-card/`, layout components | `briefings.ts` |
| Search (FR15-17) | `modules/search/` | `routes/search/`, `enrichment-panel/` | `embeddings.ts`, `threads.ts` (FTS) |
| Silence Detection (FR18-21) | `modules/silence/` | `silence-monitor/` component | `silence.ts` |
| Anonymization (FR22-28) | `modules/pipeline/anonymization/` | `routes/admin/staging.tsx`, `staging-review-item/` | `staging.ts` |
| Admin (FR29-40) | `modules/admin/` | `routes/admin/*` | `users.ts`, `workstreams.ts`, `channels.ts` |
| Auth (cross-cutting) | `modules/auth/` | `hooks/use-auth.ts`, `__root.tsx` | `users.ts` |
| AI Enrichment (UX spec) | `modules/enrichment/` | `enrichment-panel/`, `hooks/use-enrichment.ts` | — (on-demand) |

### External Integration Points

| Integration | Module | Connection Method |
|------------|--------|-------------------|
| Slack API | `ingestion/slack-client.service.ts` | REST API with bot token, rate-limited polling |
| Keycloak / Red Hat SSO | `auth/strategies/oidc.strategy.ts` | OIDC protocol, JWT validation |
| CPU LLM model | `pipeline/llm/providers/cpu-model.provider.ts` | Local inference via API |
| Gemini Pro (fallback) | `pipeline/llm/providers/gemini.provider.ts` | Google AI API, company license |
| NotebookLM | `enrichment/sources/notebooklm.source.ts` | API integration |
| OpenShift docs | `enrichment/sources/openshift-docs.source.ts` | Public URL scraping/indexing |

## LLM Failure Modes & Operational Safeguards

**Model Version Pinning:**
- `llm.config.ts` stores model ID + version as environment variables, not hardcoded
- Prompt templates versioned alongside code in `pipeline/llm/prompts/` directory
- Every LLM output stored with `model_version` and `prompt_version` in the DB for traceability

**Confidence & Quality Safeguards:**
- Classification outputs include a `confidence` field; below threshold → flagged for manual review in staging queue (reuses anonymization review UI)
- Summarization outputs validated against Zod schema; malformed LLM responses logged at `error` level and retried once, then queued as `failed` — never silently dropped
- Confidence threshold values and per-label calibration are implementation-story-level decisions, documented in the relevant story specs

**Idempotent Reprocessing:**
- Any batch step can be re-run without duplicating output — keyed on `slack_thread_ts` + `processing_date` (UTC, explicit)
- Admin endpoint `POST /api/admin/pipeline/reprocess` allows triggering reprocessing of a date range (admin role required, body/response schema defined in story)
- Failed items tracked in `pipeline_failures` table with error context for debugging

**Fallback Behavior:**
- CPU model timeout (configurable, default 30s) → retry once → fallback to Gemini Pro
- Gemini Pro failure → item marked `pending_retry`, retried on next batch cycle
- If both fail twice → item enters `manual_review` state, surfaced in admin dashboard
- **Alerting:** if fallback rate exceeds configurable threshold (e.g., >50% of batch), pipeline logs `warn` with `llm.fallback_rate` metric for operational visibility — "always in fallback" must be detectable, not silent

**Prompt Management (new directory):**

```
apps/api/src/modules/pipeline/llm/
├── prompts/
│   ├── classify.prompt.ts        # Classification prompt template
│   ├── summarize.prompt.ts       # Summarization prompt template
│   ├── detect-entities.prompt.ts # Anonymization entity detection
│   └── enrich.prompt.ts          # Enrichment query prompt
├── fixtures/
│   ├── classify.golden.json      # Golden output fixtures for testing
│   ├── summarize.golden.json
│   └── detect-entities.golden.json
```

Golden fixtures serve as CI regression gates via Vitest snapshot-style tests. Runtime quality is monitored via `failed_schema_rate`, `manual_review_growth`, and `latency_p99` metrics logged per batch run.

## Worker Identity & Idempotency Patterns

**Service Identity:**
- Keycloak **client credentials grant** for service-to-service auth — a dedicated `slack-thread-manager-worker` client in Keycloak
- Worker token stored in-memory, refreshed automatically via `@nestjs/passport` client credentials strategy
- Workers authenticate to internal APIs with service token, not user tokens
- OpenShift Secret holds `KEYCLOAK_CLIENT_ID` + `KEYCLOAK_CLIENT_SECRET` for the worker client
- Scopes and audience constraints defined during Keycloak setup story

**Ingestion Idempotency:**
- Natural dedup key: `slack_team_id` + `channel_id` + `thread_ts` — unique constraint in `slack_threads` table
- Upsert strategy: `ON CONFLICT (slack_team_id, channel_id, thread_ts) DO UPDATE SET updated_at = NOW(), message_count = EXCLUDED.message_count`
- Cursor/watermark: `last_polled_ts` per channel stored in `slack_channels` table — batch polling resumes from watermark
- Single-writer assumption: one ingestion job instance at a time, enforced by `@nestjs/schedule` (single-process NestJS deployment on OpenShift)
- Partial batch failure: each thread processed individually within a transaction; failed threads logged and skipped, not blocking the batch

**Pipeline State Machine:**
- Processing keyed on `thread_id` + `processing_date` (UTC) — prevents double-processing on same day
- State transitions per thread: `ingested` → `classified` → `summarized` → `embedded` → `staged` → `approved` → `delivered`
- State transitions are atomic (single DB transaction per step)
- Failed state transitions logged with error context; item stays at current state for retry
- Detailed FSM transition matrix (allowed transitions, terminal states, retry/reopen rules) defined in the pipeline implementation story

**Transactional Boundaries:**

| Operation | Boundary | Rationale |
|-----------|----------|-----------|
| Thread ingestion (single thread) | One transaction | Upsert thread + messages atomically |
| Classification + summarization | One transaction per thread | Write classification + summary together |
| Embedding generation | Separate transaction | Can be re-run independently |
| Anonymization staging | One transaction | Write to staging_queue + update thread state |
| Staging approval/rejection | One transaction | Update staging_queue + thread state |
| Briefing generation | One transaction per briefing | Write briefing + items atomically |

**Concurrency safeguard:** Single-process deployment means no concurrent worker races in MVP. Post-MVP horizontal scaling would require optimistic locking (`version` column) or `SELECT FOR UPDATE` on thread rows.

**New DB schema file:**

```
packages/db/src/schema/
├── pipeline-state.ts    # pipeline_runs, pipeline_failures tables
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology choices verified compatible — NestJS + Drizzle, React 19 + Vite + TanStack, PostgreSQL + pgvector, Keycloak OIDC + NestJS Passport, Turborepo + pnpm. No contradictory decisions found.

**Pattern Consistency:** Naming conventions (snake_case DB → camelCase TypeScript) handled by Drizzle mapping. NestJS module pattern uniform across all backend modules. REST for frontend ↔ backend; NestJS events for internal module communication.

**Structure Alignment:** Project structure reflects every architectural decision. Module boundaries match NestJS dependency injection. `packages/shared` and `packages/db` prevent type drift.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:** All 40 FRs mapped to specific backend modules, frontend routes/components, and DB schemas. Every FR has a concrete implementation location in the project structure.

**Non-Functional Requirements Coverage:** Performance (batch scheduling, search indexing, SPA bundle optimization), Security (global auth guard, TLS termination, secrets management, anonymization enforcement), Integration (rate-limited Slack client, LLM provider abstraction with fallback), Reliability (catch-up logic, idempotent ingestion, crash-safe persistence) — all architecturally supported.

### Implementation Readiness Validation ✅

**Decision Completeness:** 10 critical/important decisions documented with technology choices and versions. 4 deferred decisions documented with rationale. LLM failure modes and worker identity patterns added based on Party Mode review.

**Structure Completeness:** 100+ files/directories defined. Every FR category mapped to specific backend modules, frontend routes, and DB schemas. 6 external integration points specified.

**Pattern Completeness:** Naming, structure, format, communication, and process patterns defined with examples. Anti-patterns documented. Enforcement guidelines specified.

### Gap Analysis Results

**Critical Gaps:** None.

**Important Gaps (resolved or deferred to implementation stories):**
- FR9 orphaned action detection → implementation-story decision (separate processor or part of classifier)
- FR26 blocklist management → dedicated admin sub-module, API contract defined in story
- pgvector custom type in Drizzle → `customType` from `drizzle-orm/pg-core`, documented approach
- LLM failure modes → new architecture section added (confidence thresholds, fallback chain, reprocessing)
- Worker identity → new architecture section added (Keycloak client credentials, idempotency keys, state machine)

**Party Mode Review Findings (addressed or explicitly deferred):**
- LLM failure modes & operational safeguards — **addressed** in new section
- Worker identity & idempotency — **addressed** in new section
- Anonymization property-based testing — **deferred to test design story** (curated evil fixture set, invariant assertions)
- Slack API payload versioning — **deferred to ingestion implementation story** (consumer-shaped fixtures)
- FSM transition matrix detail — **deferred to pipeline implementation story**
- Confidence threshold calibration — **deferred to LLM pipeline story**

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — all 16 checklist items verified, no critical gaps, all 40 FRs mapped, LLM and worker identity gaps addressed via Party Mode review.

**Key Strengths:**
- Single-language TypeScript monorepo minimizes context switching for AI agents
- NestJS's opinionated structure prevents architectural drift across agents
- PostgreSQL as single data store (relational + JSONB + pgvector) eliminates operational complexity
- Every FR has a specific home in the project structure
- Batch pipeline architecture cleanly separated from API surface
- LLM failure modes explicitly handled with fallback chain and manual review escape hatch
- Worker identity and idempotency patterns prevent data corruption in background processing

**Areas for Future Enhancement:**
- Redis caching layer if concurrent user load increases
- E2E testing with Playwright after UI stabilizes
- OpenAPI-generated TypeScript client for frontend
- Horizontal scaling with optimistic locking (post single-pod)
- Database backup automation and disaster recovery runbook
- Anonymization property-based test suite (curated evil fixture set)
- Consumer-driven contract tests for Slack API payload shapes

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions
- When implementation-story-level detail is marked as "deferred to story," define it in the story spec before coding

**First Implementation Priority:**

```bash
pnpm dlx create-turbo@latest slack-thread-manager --package-manager pnpm
```

Then configure the monorepo with NestJS (`apps/api`), React + Vite (`apps/web`), and shared packages (`packages/db`, `packages/shared`, `packages/config`).
