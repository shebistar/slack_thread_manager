---
project_name: 'slack_thread_manager'
user_name: 'Shebi'
date: '2026-05-08'
sections_completed:
  - technology_stack
  - critical_implementation_rules
  - git_governance
  - documentation_standards
  - testing_standards
  - module_patterns
---

# Project Context for AI Agents

_Critical rules and patterns that AI agents MUST follow when implementing code in this project. Every dev-story implementation begins by loading this file._

---

## Technology Stack & Versions

| Layer | Technology | Version |
|-------|-----------|---------|
| Monorepo | Turborepo + pnpm | pnpm 10.33.4, turbo ^2.8 |
| Runtime | Node.js | >=22.0.0 |
| Backend framework | NestJS | ^11.0.0 |
| Language | TypeScript | ^5.7.0 |
| Backend test runner | Vitest + @nestjs/testing | ^3.2.0 |
| Frontend | React 19 + Vite | React ^19.0.0 |
| Frontend routing | TanStack Router | ^1.169.2 |
| Frontend server state | TanStack Query | ^5.100.9 |
| UI components | Shadcn/ui + Radix UI | radix-ui ^1.4.3 |
| Styling | Tailwind CSS 4 | @tailwindcss/vite ^4.1.0 |
| Database | PostgreSQL 17 + pgvector | - |
| ORM | Drizzle ORM | ^0.41.0 |
| Migrations | drizzle-kit | ^0.31.0 |
| Slack API | @slack/web-api | ^7.15.2 |
| Auth | Keycloak OIDC + passport-jwt | keycloak-js ^26.2.4 |
| Validation | Zod | ^3.24.0 |
| Build compiler (API) | SWC via unplugin-swc | - |

---

## Critical Implementation Rules

### Imports & Modules

- **ALWAYS use `.js` extension on relative imports** — this project uses ESM/NodeNext. `import { X } from './service.js'` not `'./service'`. This applies to all files in `apps/api` and `packages/`.
- **Workspace package imports have no extension**: `import { X } from '@slack-thread-manager/db'` (correct), not `'@slack-thread-manager/db/index.js'`.
- **`node:` prefix for built-in modules**: use `import { randomUUID } from 'node:crypto'` not `'crypto'`.

### NestJS Patterns

- **Database injection**: always `@Inject(DATABASE_TOKEN) private readonly db: Database` — never instantiate Drizzle client directly.
- **Logger**: use `private readonly logger = new Logger(ClassName.name)` — **never `console.log`**.
- **Admin endpoints**: always decorate both class and method with `@Roles('ADMIN')` (or class-level covers all methods).
- **Request body validation**: always use `@Body(new ZodValidationPipe(schema)) body: Type` — never raw `@Body()`.
- **Response shape**: all API responses return `{ data: <payload> }` — no bare arrays or primitives.
- **HTTP status codes**: `@HttpCode(HttpStatus.CREATED)` for POST that creates, `@HttpCode(HttpStatus.NO_CONTENT)` for DELETE, `@HttpCode(HttpStatus.ACCEPTED)` for async fire-and-forget.
- **NotFoundException**: import from `@nestjs/common` — throw `new NotFoundException('message')`.

### Drizzle ORM Patterns

- **Upsert**: use `.insert().values().onConflictDoUpdate({ target: [...], set: { ... } }).returning()`.
- **`sql` template tag**: use for `now()`, `excluded.*`, and literal SQL values: `sql\`now()\``, `sql\`excluded.column_name\``, `sql\`'literal_value'\``.
- **Multi-condition where**: use `and(eq(...), eq(...))` — import `and` from `drizzle-orm` (same import as `eq` and `sql`).
- **Returning single row**: destructure: `const [row] = await tx.insert(...).returning(...)` then guard `if (!row) throw new Error(...)`.
- **Transactions**: `await this.db.transaction(async (tx) => { ... })` — keep related writes atomic.
- **Schema column names**: snake_case in DB (e.g. `pipeline_state`), camelCase in TypeScript (e.g. `pipelineState`).

### Drizzle Schema & Migrations

- **Add column**: add to schema first, then run `pnpm db:generate` from `packages/db` directory.
- **Commit migrations**: ALWAYS commit the generated SQL file in `packages/db/src/migrations/` AND the meta JSON snapshot alongside each schema change.
- **`pipelineState` is currently `text`** (not pgEnum) — Story 3.2 will convert it to a proper pgEnum. Do NOT convert it prematurely.

### Async Patterns

- **Fire-and-forget**: use `void this.asyncMethod()` — suppresses unhandled promise warning. The method must catch its own errors internally.
- **Yield to caller before state transition**: if a fire-and-forget method transitions state synchronously before its first `await`, add `await Promise.resolve()` at the start to let the caller observe the initial state.
- **Per-item error isolation**: wrap each item in a for-loop in its own try/catch — errors on one item must not abort others.

### Module & File Structure

- **Flat structure within modules**: all files for a module go directly in `apps/api/src/modules/<module-name>/`. Do NOT create subdirectories within a module (no `jobs/`, `controllers/`, etc.).
- **Spec files colocated**: `foo.service.spec.ts` lives in the same directory as `foo.service.ts`.
- **File naming**: kebab-case for all files (`backfill.service.ts`, `polling.job.ts`), PascalCase for class names.
- **Admin controllers in IngestionModule**: controllers that expose admin routes (`admin/ingestion/*`) can live inside `modules/ingestion/` — they don't need to be in `modules/admin/`. Follow the existing `ImportController` pattern.

### Zod Schemas

- **Location**: `packages/shared/src/schemas/<feature>.schema.ts` — one schema file per feature domain.
- **Export chain**: always export from `packages/shared/src/schemas/index.ts` via `export * from './<name>.schema.js'` (with `.js` extension), then it's available from `@slack-thread-manager/shared`.
- **Type export**: always `export type X = z.infer<typeof xSchema>` alongside the schema.

### Testing Patterns

- **Framework**: Vitest + `@nestjs/testing` — all mocks use `vi.fn()`, not `jest.fn()`.
- **Async mock**: `vi.fn().mockResolvedValue(...)` for async functions, `vi.fn().mockReturnValue(...)` for sync.
- **DB mock structure**: mock both `query.slackChannels.findMany/findFirst` and `query.slackThreads.findMany/findFirst` — new tests that add DB queries will fail if the mock is missing those properties.
- **Fire-and-forget testing**: use `await new Promise<void>((resolve) => setImmediate(resolve))` (twice if needed) to drain the microtask queue after calling a method that fires async.
- **PollingJob mock**: `mockIngestionService` in `polling.job.spec.ts` must include `detectUpdatedThreads: vi.fn().mockResolvedValue(...)` — add new methods there when IngestionService grows.
- **No test doubles for private methods**: access private methods via `service['methodName']()` in tests when necessary — don't make private methods public just for testing.

---

## Git Governance

### Branch Strategy

```
main          ← production; only merges from develop via PR
develop       ← integration; receives completed epics via PR
feature/epic-X-<name>  ← one branch per epic (e.g. feature/epic-2-slack-ingestion)
```

**Current active branch**: `feature/epic-2-slack-ingestion`

### Commit Convention

Conventional Commits format: `<type>(<scope>): <description>`

| Type | When to use |
|------|-------------|
| `feat` | New feature / new story implementation |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Tooling, dependencies, config |

**Scope**: use the story number or module name (e.g. `feat(2.4): add thread update detection`, `feat(2.5): add historical backfill endpoint`).

**After each story**: commit all story-related files with a `feat(story-id):` message.

### PR Process

- **Story → branch**: commit to the current epic feature branch after each story is marked `review`.
- **Epic → develop**: when all stories in an epic are `done` (or `review`), create a PR from the feature branch to `develop`. Use `gh pr create --base develop`.
- **PR title**: `Epic N: <epic name>` (e.g. `Epic 2: Slack Data Ingestion`).
- **PR body**: include a summary of all stories completed, what was implemented, migration notes if any.
- **develop → main**: separate PR after integration testing in develop.

### What to commit per story

1. All source files modified or created
2. All spec files
3. Drizzle migration SQL + meta snapshot (if schema changed)
4. Story file updated to `review` status (`_bmad-output/implementation-artifacts/<story-key>.md`)
5. Sprint status file (`_bmad-output/implementation-artifacts/sprint-status.yaml`)

---

## Documentation Standards

### Per-Story Documentation (mandatory)

The story file (`_bmad-output/implementation-artifacts/<story-key>.md`) IS the documentation record. After implementation:
- All tasks must be checked off (`[x]`)
- `### Completion Notes List` must summarize key decisions and deviations
- `### File List` must enumerate every created/modified file

### API Documentation

- New admin endpoints do not require Swagger annotations until Epic 3+ — document via story completion notes for now.
- If an endpoint is added that a frontend developer will call, add a comment block above the controller method describing parameters and response shape.

### Architecture Decisions

If a story deviates from the planned architecture (different approach, new pattern, deferred work), document it in the `### Completion Notes List` of the story file AND note it in the `### Previous Story Intelligence` of the next story.

### Migration Notes

Any `pnpm db:generate` run must be mentioned in the commit message: `feat(2.4): add pipeline_state column, update ingestion service`.

---

## Environment Variables

All environment variables are validated on startup via Zod in `apps/api/src/config/app.config.ts`. Required variables:

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | PostgreSQL connection string |
| `KEYCLOAK_REALM_URL` | OIDC realm URL |
| `KEYCLOAK_CLIENT_ID` | OIDC client ID |
| `SLACK_BOT_TOKEN` | Optional (starts with `xoxb-`) — Slack disabled if absent |
| `SLACK_TEAM_ID` | Optional — ingestion skipped if absent |
| `INGESTION_CRON_SCHEDULE` | Default: `'0 */4 * * *'` |

**NEVER** add new required env vars without updating `envSchema` in `app.config.ts`.

---

## Known Deferred Work (Forward Dependencies)

| Item | Deferred to |
|------|-------------|
| `pipelineState` → pgEnum | Story 3.2 |
| `pipeline_runs` table for persistent batch tracking | Story 3.2 |
| E2E / integration tests | After stable UI |
| Swagger / OpenAPI decorators | Epic 3+ |
| Gemini Pro fallback | Story 3.1 |
| pgvector HNSW index | Story 3.5 |

Do NOT implement these early even if they seem like obvious improvements — they have deliberate ordering.
