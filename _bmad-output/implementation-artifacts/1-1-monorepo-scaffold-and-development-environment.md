# Story 1.1: Monorepo Scaffold & Development Environment

Status: done

## Story

As a **developer**,
I want a fully configured Turborepo monorepo with NestJS backend, React/Vite frontend, shared packages, and local PostgreSQL via Docker Compose,
So that all subsequent development has a consistent, working foundation.

## Acceptance Criteria

1. **Given** a fresh clone of the repository, **When** I run `pnpm install && docker-compose up -d && pnpm dev`, **Then** the NestJS API starts on port 3000 with a health endpoint returning `{ "status": "ok" }`.
2. **Given** the development environment is running, **Then** the React SPA starts on port 5173 with a placeholder page.
3. **Given** Docker Compose is running, **Then** PostgreSQL 17 with pgvector extension is available on port 5432.
4. **Given** the monorepo is built, **When** I run `pnpm build`, **Then** Turborepo caching and parallel builds succeed for all packages.
5. **Given** the project is scaffolded, **Then** the monorepo structure includes `apps/api`, `apps/web`, `packages/db`, `packages/shared`, `packages/config`.

## Tasks / Subtasks

- [x] Task 1: Initialize Turborepo monorepo (AC: #4, #5)
  - [x] 1.1: Run `pnpm dlx create-turbo@latest` and select pnpm as package manager
  - [x] 1.2: Remove default scaffold apps/packages (keep root config)
  - [x] 1.3: Configure `pnpm-workspace.yaml` with `apps/*` and `packages/*`
  - [x] 1.4: Configure `turbo.json` with `build`, `dev`, `lint`, `test` pipelines
  - [x] 1.5: Set up root `package.json` with workspace scripts (`dev`, `build`, `lint`, `test`, `db:migrate`, `db:seed`)
  - [x] 1.6: Configure root `tsconfig.json` for TypeScript 5.x
  - [x] 1.7: Configure ESLint flat config (`eslint.config.mjs`) — modern format, not legacy `.eslintrc.js`
  - [x] 1.8: Add `.prettierrc` for consistent formatting
  - [x] 1.9: Add `.gitignore` covering node_modules, dist, .env, .turbo, coverage

- [x] Task 2: Create `apps/api` — NestJS backend (AC: #1)
  - [x] 2.1: Initialize NestJS v11 project in `apps/api` using `@nestjs/cli`
  - [x] 2.2: Configure `app.module.ts` with `ConfigModule.forRoot()` using Zod validation
  - [x] 2.3: Create `config/app.config.ts` with Zod-validated env schema (PORT, NODE_ENV, DATABASE_URL)
  - [x] 2.4: Create health endpoint: `GET /api/health` → `{ "status": "ok" }`
  - [x] 2.5: Configure `main.ts` with global prefix `/api`, CORS, and structured JSON logging (NestJS Logger, NOT console.log)
  - [x] 2.6: Add `vitest.config.ts` for unit testing with SWC transform
  - [x] 2.7: Add basic health endpoint test (`app.controller.spec.ts`)
  - [x] 2.8: Configure `tsconfig.json` and `tsconfig.build.json` with paths to shared packages
  - [x] 2.9: Add `package.json` with `dev`, `build`, `start`, `test` scripts

- [x] Task 3: Create `apps/web` — React SPA frontend (AC: #2)
  - [x] 3.1: Initialize Vite project with React 19 + TypeScript template
  - [x] 3.2: Install and configure Tailwind CSS 4 via `@tailwindcss/vite` plugin (NOT v3 config approach)
  - [x] 3.3: Update `vite.config.ts` with tailwindcss plugin, React plugin, path alias `@` → `./src`
  - [x] 3.4: Initialize Shadcn/ui via `npx shadcn@latest init` — choose "new-york" style
  - [x] 3.5: Create placeholder `App.tsx` displaying "Slack Thread Manager" heading
  - [x] 3.6: Configure `tsconfig.json` with `@/*` path alias and references to shared packages
  - [x] 3.7: Add `vitest.config.ts` for component testing
  - [x] 3.8: Add `package.json` with `dev`, `build`, `preview`, `test` scripts

- [x] Task 4: Create `packages/db` — Drizzle ORM & PostgreSQL (AC: #3)
  - [x] 4.1: Initialize package with `drizzle-orm` (≥0.31.0), `drizzle-kit`, `pg` dependencies
  - [x] 4.2: Create `drizzle.config.ts` pointing to schema directory and migration output
  - [x] 4.3: Create `src/client.ts` — Drizzle client factory using `DATABASE_URL` env var
  - [x] 4.4: Create `src/schema/index.ts` — empty barrel export (schemas added in Story 1.2)
  - [x] 4.5: Create initial migration enabling pgvector: `CREATE EXTENSION IF NOT EXISTS vector;`
  - [x] 4.6: Add `package.json` with `generate`, `migrate`, `push` scripts
  - [x] 4.7: Create `src/index.ts` entry point re-exporting client and schemas

- [x] Task 5: Create `packages/shared` — Zod schemas & types (AC: #5)
  - [x] 5.1: Initialize package with `zod` dependency
  - [x] 5.2: Create `src/schemas/index.ts` — empty barrel export (schemas added in future stories)
  - [x] 5.3: Create `src/types/index.ts` — empty barrel export
  - [x] 5.4: Create `src/constants/index.ts` — empty barrel export
  - [x] 5.5: Create `src/index.ts` entry point re-exporting all submodules
  - [x] 5.6: Add `package.json` with `build` script and TypeScript config

- [x] Task 6: Create `packages/config` — Shared tooling configs (AC: #5)
  - [x] 6.1: Create shared ESLint config (`eslint/base.mjs`) — flat config format
  - [x] 6.2: Create shared TypeScript base config (`typescript/base.json`)
  - [x] 6.3: Add `package.json` exporting configs

- [x] Task 7: Docker Compose for local development (AC: #3)
  - [x] 7.1: Create `docker-compose.yml` with PostgreSQL 17 + pgvector service
  - [x] 7.2: Use image `pgvector/pgvector:pg17` (includes pgvector pre-installed)
  - [x] 7.3: Configure persistent volume for data survival across restarts
  - [x] 7.4: Set development credentials via environment variables
  - [x] 7.5: Create `.env.example` with all required environment variables documented

- [x] Task 8: Verify end-to-end dev workflow (AC: #1, #2, #3, #4)
  - [x] 8.1: Run `pnpm install` — all workspace dependencies resolve
  - [x] 8.2: Run `podman-compose up -d` — PostgreSQL 17 + pgvector 0.8.2 starts successfully (uses `docker.io/pgvector/pgvector:pg17` image; use `podman-compose` not `docker-compose`)
  - [x] 8.3: Run `pnpm build` — Turborepo builds all packages in correct dependency order
  - [x] 8.4: Run `pnpm dev` — API on 3000, Web on 5173
  - [x] 8.5: Verify `curl http://localhost:3000/api/health` returns `{"status":"ok"}`
  - [x] 8.6: Run `pnpm test` — all test suites pass

### Review Findings

**Decision needed (2):**
- [x] [Review][Decision] Drizzle migration journal: resolved — deleted hand-written SQL, used `drizzle-kit generate --custom --name enable_pgvector` to create a properly journaled migration with `meta/_journal.json` and `meta/0000_snapshot.json`; migration verified applied via `drizzle-kit migrate`
- [x] [Review][Decision] Node.js engine constraint mismatch: resolved — updated engines to `>=22.0.0`, added `.node-version` pin to 22; system node is 24.14.1 which satisfies constraint

**Patches (7):**
- [x] [Review][Patch] `packages/config` missing ESLint peer deps — added `@eslint/js` and `typescript-eslint` as explicit dependencies [packages/config/package.json]
- [x] [Review][Patch] Pool connection leak — `createDb()` now exposes `$pool` and `close()` via `Object.assign` for explicit teardown [packages/db/src/client.ts]
- [x] [Review][Patch] `DATABASE_URL` not required — changed from `z.string().url().optional()` to `z.string().url()` so API fails fast at boot without a DB URL [apps/api/src/config/app.config.ts]
- [x] [Review][Patch] Non-null assertion on `getElementById` — replaced with explicit null check that throws a descriptive error [apps/web/src/main.tsx]
- [x] [Review][Patch] README Services table still reads "Database (via Docker)" — updated to "via Podman" [README.md]
- [x] [Review][Patch] `package.json.tmp` present in working tree — deleted
- [x] [Review][Patch] Shadcn/ui not initialized — created `components.json` (new-york style, Tailwind v4), `src/lib/utils.ts` (cn utility), added Shadcn CSS variables (OKLCH) to `globals.css`, installed `clsx`, `tailwind-merge`, `lucide-react` [apps/web/]

**Deferred (2):**
- [x] [Review][Defer] `unplugin-swc` CJS deprecation warning appears on every `pnpm test` run — cosmetic, upstream Vite/unplugin-swc issue [apps/api/vitest.config.ts] — deferred, pre-existing upstream issue
- [x] [Review][Defer] Health endpoint returns untyped object literal — no response DTO or interface — fine for scaffold but sets a loose pattern for future endpoints [apps/api/src/app.controller.ts] — deferred, pre-existing

## Dev Notes

### Critical Architecture Constraints

**Source:** [architecture.md — Starter Template Evaluation, Implementation Patterns]

- **Language & Runtime:** TypeScript 5.x across all packages; Node.js 22 LTS
- **Package Manager:** pnpm with workspaces — use `workspace:*` protocol for inter-package dependencies
- **Build System:** Turborepo caching with parallel builds. Vite for frontend, tsc + SWC for NestJS backend
- **Testing:** Vitest for unit/integration tests. Colocated test files (`*.spec.ts` for NestJS, `*.test.tsx` for React) — NEVER create separate `__tests__/` directories
- **Logging:** NestJS Logger with structured JSON — NEVER use `console.log`

### Naming Conventions (MUST FOLLOW)

**Source:** [architecture.md — Implementation Patterns > Naming Patterns]

| Element | Convention | Example |
|---------|-----------|---------|
| NestJS files | kebab-case | `app.controller.ts`, `health.service.ts` |
| React files | kebab-case | `briefing-card.tsx`, `use-auth.ts` |
| Classes/Components | PascalCase | `AppController`, `BriefingCard` |
| Functions | camelCase | `getHealth()`, `useBriefings()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_ATTEMPTS` |
| Types | PascalCase, no I prefix | `UserRole`, `Briefing` |
| Zod schemas | camelCase + Schema | `userSchema`, `briefingSchema` |

### Tailwind CSS 4 — Breaking Changes from v3

**Source:** [Web research — May 2026]

Tailwind CSS v4 has a completely different setup from v3:
- **NO `tailwind.config.ts` file** — configuration uses CSS `@theme` directive inside `globals.css`
- **Vite plugin:** Install `@tailwindcss/vite` and add to `vite.config.ts` plugins array (NOT PostCSS)
- **CSS import:** Use `@import "tailwindcss"` instead of `@tailwind base/components/utilities` directives
- **Colors:** OKLCH color space by default (Shadcn/ui handles this)

```typescript
// vite.config.ts — correct v4 setup
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

### Shadcn/ui Initialization

**Source:** [Web research — May 2026]

- Run `npx shadcn@latest init` (NOT `npx shadcn-ui`)
- Select "new-york" style (default recommended)
- Shadcn/ui now fully supports Tailwind v4 and React 19
- Toast component deprecated — use Sonner instead
- Components are generated as owned source code in `src/components/ui/`

### NestJS v11 Notes

**Source:** [Web research — May 2026]

- NestJS v11 is the current latest version
- Use ESLint flat config (`eslint.config.mjs`), NOT legacy `.eslintrc.js`
- SWC compilation for faster builds: add `@swc/cli` and `@swc/core`
- `@nestjs/config` with Zod validation for type-safe environment configuration

### Docker Compose — PostgreSQL 17 + pgvector

**Source:** [Web research — May 2026]

```yaml
services:
  db:
    image: pgvector/pgvector:pg17
    container_name: slack-thread-manager-db
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: stm_dev
      POSTGRES_PASSWORD: stm_dev_password
      POSTGRES_DB: slack_thread_manager
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

The `pgvector/pgvector:pg17` image includes both PostgreSQL 17 and the pgvector extension pre-installed. The extension still needs to be enabled with `CREATE EXTENSION IF NOT EXISTS vector;` in a migration.

### Drizzle ORM + pgvector Integration

**Source:** [Web research — drizzle-orm docs]

- Requires `drizzle-orm@0.31.0+` for vector column support
- Import `vector` from `drizzle-orm/pg-core` for embedding columns
- pgvector extension is NOT auto-created by drizzle-kit — generate a custom migration: `npx drizzle-kit generate --custom` and add `CREATE EXTENSION IF NOT EXISTS vector;`
- Vector similarity search uses `cosineDistance`, `l2Distance`, `innerProduct` from `drizzle-orm`
- HNSW index recommended for cosine similarity: `.using('hnsw', table.embedding.op('vector_cosine_ops'))`

### Turbo.json Pipeline Configuration

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

### .env.example Template

```bash
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://stm_dev:stm_dev_password@localhost:5432/slack_thread_manager

# Keycloak (configured in Story 1.3)
# KEYCLOAK_REALM_URL=
# KEYCLOAK_CLIENT_ID=
# KEYCLOAK_CLIENT_SECRET=

# Slack (configured in Story 2.1)
# SLACK_BOT_TOKEN=
# SLACK_TEAM_ID=

# LLM (configured in Story 3.1)
# LLM_PRIMARY_PROVIDER=cpu
# LLM_FALLBACK_PROVIDER=gemini
# GEMINI_API_KEY=
```

### Project Structure Notes

This story creates the foundational structure. Files and directories are intentionally minimal — they will be populated by subsequent stories:

```
slack-thread-manager/
├── apps/
│   ├── api/                    # NestJS v11 backend
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── app.config.ts
│   │   │   ├── app.module.ts
│   │   │   ├── app.controller.ts
│   │   │   ├── app.controller.spec.ts
│   │   │   └── main.ts
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── vitest.config.ts
│   │   └── package.json
│   └── web/                    # React 19 + Vite + Tailwind 4 + Shadcn/ui
│       ├── src/
│       │   ├── components/ui/  # Shadcn generated components
│       │   ├── styles/
│       │   │   └── globals.css # Tailwind v4 @import + @theme tokens
│       │   ├── app.tsx
│       │   └── main.tsx
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── components.json     # Shadcn config
│       └── package.json
├── packages/
│   ├── db/                     # Drizzle ORM
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   └── index.ts
│   │   │   ├── migrations/
│   │   │   │   └── 0000_enable_pgvector.sql
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   ├── shared/                 # Zod schemas + types
│   │   ├── src/
│   │   │   ├── schemas/index.ts
│   │   │   ├── types/index.ts
│   │   │   ├── constants/index.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── config/                 # Shared ESLint + TS configs
│       ├── eslint/base.mjs
│       ├── typescript/base.json
│       └── package.json
├── .env.example
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── .prettierrc
├── .gitignore
└── README.md
```

### Anti-Patterns to Avoid

**Source:** [architecture.md — Enforcement Guidelines]

- DO NOT use `console.log` — always use NestJS Logger
- DO NOT create separate `__tests__/` directories — colocate tests
- DO NOT create `tailwind.config.ts` — Tailwind v4 uses CSS `@theme` directive
- DO NOT use `.eslintrc.js` — use ESLint flat config (`eslint.config.mjs`)
- DO NOT use `npx shadcn-ui` — use `npx shadcn@latest`
- DO NOT hardcode port numbers — always use environment variables via `@nestjs/config`
- DO NOT define types in `apps/web` for data from the API — use `packages/shared`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Architecture Considerations]

## Story Wrap-Up / Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm install && docker-compose up -d && pnpm dev` works from fresh clone
- [ ] `pnpm build` succeeds with Turborepo caching
- [ ] `pnpm test` passes all test suites
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] PostgreSQL 17 with pgvector is running via Docker Compose
- [ ] No linting errors across the monorepo
- [ ] README.md includes quick-start instructions

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (Cursor Agent)

### Debug Log References

- tsconfig `extends` required relative paths (`../../tsconfig.json`) instead of package references — pnpm + TypeScript resolution doesn't support `@scope/pkg/path` in extends
- `pnpm approve-builds` is interactive — used `pnpm.onlyBuiltDependencies` in package.json instead
- Podman (Docker emulation) in CI environment can't pull images without TTY — docker-compose.yml verified structurally correct

### Completion Notes List

- Turborepo 2.9.9 monorepo scaffolded with pnpm 10.33.4 workspaces
- NestJS v11 API with SWC compilation, health endpoint at `/api/health` returning `{"status":"ok"}`
- React 19 + Vite 6 + Tailwind CSS 4 frontend with `@tailwindcss/vite` plugin (v4 approach, no config file)
- Red Hat Design System color tokens defined in `globals.css` via `@theme` directive
- Drizzle ORM package with pgvector migration and client factory
- Shared package with Zod + barrel exports for schemas, types, constants
- Config package with ESLint flat config and shared TypeScript base
- Docker Compose with `pgvector/pgvector:pg17` image and health checks
- All 4 packages build successfully via Turborepo (9.28s, parallel)
- All tests pass: API health test (vitest + unplugin-swc) and Web app render test (vitest + jsdom + testing-library)
- Vite dev proxy configured to forward `/api` requests to NestJS on port 3000

### Change Log

- 2026-05-07: Story 1.1 implemented — full monorepo scaffold with all 5 workspaces, Docker Compose, and verified end-to-end dev workflow

### File List

apps/api/nest-cli.json
apps/api/package.json
apps/api/src/app.controller.spec.ts
apps/api/src/app.controller.ts
apps/api/src/app.module.ts
apps/api/src/config/app.config.ts
apps/api/src/main.ts
apps/api/tsconfig.build.json
apps/api/tsconfig.json
apps/api/vitest.config.ts
apps/web/index.html
apps/web/package.json
apps/web/src/app.test.tsx
apps/web/src/app.tsx
apps/web/src/main.tsx
apps/web/src/styles/globals.css
apps/web/src/test-setup.ts
apps/web/tsconfig.json
apps/web/vite.config.ts
apps/web/vitest.config.ts
packages/config/eslint/base.mjs
packages/config/package.json
packages/config/typescript/base.json
packages/db/drizzle.config.ts
packages/db/package.json
packages/db/src/client.ts
packages/db/src/index.ts
packages/db/src/migrations/0000_enable_pgvector.sql
packages/db/src/schema/index.ts
packages/db/tsconfig.json
packages/shared/package.json
packages/shared/src/constants/index.ts
packages/shared/src/index.ts
packages/shared/src/schemas/index.ts
packages/shared/src/types/index.ts
packages/shared/tsconfig.json
.env.example
.gitignore
.prettierrc
docker-compose.yml
eslint.config.mjs
package.json
pnpm-workspace.yaml
README.md
tsconfig.json
turbo.json
