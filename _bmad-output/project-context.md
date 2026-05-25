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
| Runtime | Node.js | >=24.0.0 |
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
- **`pipelineState` is a `pgEnum`** (`pipeline_state`) with values: `ingested`, `classified`, `summarized`, `embedded`, `staged`, `approved`, `delivered`, `failed`, `pending_retry`. Converted from `text` in migration 0006 (Story 3.2).

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

**Current active branch**: `feature/epic-3-knowledge-pipeline` (branched from `feature/epic-2-slack-ingestion` at Story 3.1 completion)

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

## End-to-End Validation (mandatory per story)

Every story MUST include a validation step using real or representative data before marking `review`. This is NOT optional — green unit tests alone are insufficient.

### Validation Process

1. **Import test data**: use the text-paste import (`POST /api/admin/channels/:id/import` or CLI `pnpm --filter @slack-thread-manager/db import-text`) to load representative Slack conversations into the local database.
2. **Exercise the feature end-to-end**: invoke the feature built in this story against the imported data (e.g. trigger polling, run backfill, call search, generate briefing).
3. **Verify observable output**: check that the data flows through the pipeline correctly — query the database, check logs, or view the frontend.
4. **Document the result**: in the story's `### Completion Notes List`, add an `E2E validation` entry describing what was tested, how, and the outcome.

### Text-Paste Import as Primary Ingestion Mode

The text-paste import (`ImportService` / `ImportController`) is NOT just a workaround — it is a **primary ingestion mode** for environments where direct Slack API connectivity is unavailable. Treat it with the same quality standards as Slack API ingestion:
- It shares the same idempotent upsert path as live ingestion
- It supports copy-paste from Slack desktop/web (name + timestamp + body format)
- It is available via both the REST API (`POST /api/admin/channels/:id/import`) and CLI script
- Future epics should ensure ALL pipeline features work identically regardless of whether data entered via Slack API polling or text-paste import

### Gap Identification

After E2E validation, explicitly list any gaps discovered:
- Missing data transformations
- UI elements that don't render the imported data
- Pipeline stages that are not yet connected
- Error paths hit with real data that unit tests didn't cover

Add gaps to the story's `### Completion Notes List` and, if they affect future stories, to `deferred-work.md`.

---

## Documentation Standards

### Per-Story Documentation (mandatory)

The story file (`_bmad-output/implementation-artifacts/<story-key>.md`) IS the documentation record. After implementation:
- All tasks must be checked off (`[x]`)
- `### Completion Notes List` must summarize key decisions and deviations
- `### E2E Validation` entry must describe what was tested, how, and the outcome
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

All environment variables are validated on startup via Zod in `apps/api/src/config/app.config.ts` (base schema + `llmConfigSchema` merged from `llm.config.ts`). Required variables:

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `KEYCLOAK_REALM_URL` | — | OIDC realm URL (required) |
| `KEYCLOAK_CLIENT_ID` | — | OIDC client ID (required) |
| `SLACK_BOT_TOKEN` | — | Optional (starts with `xoxb-`) — Slack disabled if absent |
| `SLACK_TEAM_ID` | — | Optional — ingestion skipped if absent |
| `INGESTION_CRON_SCHEDULE` | `0 */4 * * *` | Cron expression for polling interval |
| `CPU_MODEL_URL` | — | Optional — Ollama / OpenAI-compatible endpoint URL |
| `CPU_MODEL_NAME` | `phi3:mini` | Completion model name for local inference |
| `CPU_EMBED_MODEL_NAME` | `nomic-embed-text` | Embedding model name (decoupled from completion) |
| `GEMINI_API_KEY` | — | Optional — Google Gemini API key; fallback disabled if absent |
| `GEMINI_MODEL_NAME` | `gemini-2.5-flash` | Gemini model for completion fallback |
| `LLM_TIMEOUT_MS` | `60000` | Per-call timeout for both providers |
| `LLM_FALLBACK_RATE_THRESHOLD` | `0.5` | Warn when batch fallback rate exceeds this |

**NEVER** add new required env vars without updating `envSchema` in `app.config.ts`.

---

## Known Deferred Work (Forward Dependencies)

> Full triaged inventory: `_bmad-output/implementation-artifacts/deferred-work.md` (last triaged: 2026-05-12)

| Item | Deferred to | Status |
|------|-------------|--------|
| ~~`pipelineState` → pgEnum~~ | ~~Story 3.2~~ | done (migration 0006) |
| ~~`pipeline_runs` table for persistent batch tracking~~ | ~~Story 3.2~~ | done (migration 0006) |
| ~~Gemini Pro fallback~~ | ~~Story 3.1~~ | done (v0.5.0) |
| ~~PII logged in roster service~~ | ~~Deferred triage~~ | done (2026-05-12) |
| ~~`createDb('')` silent crash~~ | ~~Deferred triage~~ | done (2026-05-12) |
| ~~Pipeline endpoint no timeout~~ | ~~Deferred triage~~ | done (2026-05-12, stage envelopes + 240s timeout) |
| ~~`tsx` in devDependencies~~ | ~~Deferred triage~~ | done (2026-05-12) |
| ~~Missing role claim silent default~~ | ~~Deferred triage~~ | done (2026-05-12, console.warn) |
| ~~`startRun()` no error guard~~ | ~~Deferred triage~~ | done (2026-05-12) |
| ~~`useWorkstreams()` error swallowed~~ | ~~Deferred triage~~ | done (2026-05-12) |
| E2E / integration tests | After stable UI | deprioritized |
| Swagger / OpenAPI decorators | When API is externally consumed | deprioritized |
| ~~pgvector HNSW index~~ | ~~Story 6.2~~ | done (verified in Story 6.2) |
| LLM prompt injection hardening | Dedicated story | pending (CREATE STORY) |
| Route-level tests for briefing layouts | Dedicated story | pending (CREATE STORY) |
| `embed()` fallback to Gemini (primary-only by design) | When embedding pipeline is production-critical | deprioritized |
| Batch fallback counter concurrency safety | When horizontal scaling is needed | deprioritized |
| CPU model auth header (`CPU_MODEL_API_KEY`) | When Ollama is exposed to non-localhost | deprioritized |
| Gemini safety block distinction (blocked vs. failed) | When prompt safety monitoring is added | deprioritized |

Do NOT implement deprioritized items early — they have deliberate ordering and documented trigger conditions in `deferred-work.md`.

---

## Epic Completion Gate (A15)

No `dev-story` implementation on the next epic may begin until ALL of the following gates are green for the current epic:

1. All stories are `done` (code reviewed, tests green, E2E validated)
2. `deploy/test-pipeline.sh` updated with steps covering new endpoints/features from the epic
3. `deploy.sh` runs successfully on OpenShift with no failures
4. `deploy/test-pipeline.sh` passes on the deployed version — full chain green
5. Epic retrospective completed — retro document produced, action items assigned
6. Sprint status updated — epic status set to `done`, retrospective set to `done`
7. Critical-path prep items from retro completed

Story files for the next epic may be created as planning artifacts, but no code implementation begins until gates are green.

## Deploy Quality Gates (A16, A17)

### Pre-Deploy Check (A17)

`deploy/pre-deploy-check.sh` must pass before `deploy.sh` runs:
- `pnpm install --frozen-lockfile` — lockfile integrity
- `pnpm test` — full unit test suite green
- `pnpm build` — TypeScript compilation succeeds for API and web

### Smoke Test Coverage (A16)

Every new API endpoint added by a story must have a corresponding verification step in `deploy/test-pipeline.sh`. This is part of the story implementation, not follow-up work. The smoke test must cover features from **every** completed epic.
