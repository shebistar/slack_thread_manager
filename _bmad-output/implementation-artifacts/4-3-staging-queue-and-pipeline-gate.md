# Story 4.3: Staging Queue & Pipeline Gate

Status: done

## Story

As a **system**,
I want all processed content to enter a staging queue that gates delivery until admin approval,
so that no briefing or search result reaches team members without human review of anonymization.

## Acceptance Criteria

1. **Given** content has passed through **both** blocklist filter **and** LLM entity detection, **When** the staging service processes it, **Then** content enters the `staging_queue` table with: `id`, `thread_id` (FK), `original_content` (JSONB), `anonymized_content` (JSONB), `flags` (JSONB array of detected entities with `source`: `BLOCKLIST` or `LLM`), `status` (enum: `PENDING`, `APPROVED`, `REJECTED`), `reviewed_by`, `reviewed_at`, `created_at`.

2. **Given** the staging service processes a thread, **Then** the thread's pipeline state transitions to `staged`.

3. **Given** content has **zero flags** (no blocklist matches, no LLM detections), **Then** it still enters the staging queue — mandatory gate per FR28. Nothing bypasses the staging queue.

4. **Given** any API endpoint serving user-facing content (briefings, search), **Then** it must NOT return threads that are not in `APPROVED` state. The gate is enforced at the **service layer** — no controller can bypass it.

5. **Given** the staging service runs, **Then** the staging queue tracks `batch_id` for grouping items from the same pipeline run.

6. **Given** the staging queue is integrated into the admin pipeline endpoint, **When** `POST /api/admin/pipeline/run` is called, **Then** `runStaging()` executes after blocklist filter + LLM entity detection and returns `{ threadsStaged, threadsFailed, batchId }`.

7. **Given** zero results are passed to the staging service, **Then** it returns `{ threadsStaged: 0, threadsFailed: 0, batchId: null }` without error.

8. **Given** content was ingested via text-paste import, **When** the staging service processes it, **Then** it is staged identically to Slack API–ingested threads.

## Tasks / Subtasks

- [x] Task 1: Create `staging_queue` table schema + pgEnum + migration (AC: #1, #5)
  - [x] 1.1 Create `packages/db/src/schema/staging.ts`: add `stagingStatusEnum = pgEnum('staging_status', ['pending', 'approved', 'rejected'])` and `stagingQueue` table with: `id` (uuid PK, defaultRandom), `threadId` (uuid FK → slackThreads.id, notNull), `batchId` (uuid, nullable — groups items from same pipeline run), `originalContent` (jsonb, notNull), `anonymizedContent` (jsonb, notNull), `flags` (jsonb, notNull, default `[]`), `status` (stagingStatusEnum, notNull, default `'pending'`), `reviewedBy` (uuid FK → users.id, nullable), `reviewedAt` (timestamptz, nullable), `createdAt` (timestamptz, notNull, defaultNow)
  - [x] 1.2 Add indexes: `idx_staging_queue_thread_id` on `threadId`, `idx_staging_queue_status` on `status`, `idx_staging_queue_batch_id` on `batchId`
  - [x] 1.3 Export types: `StagingQueueEntry`, `NewStagingQueueEntry`, `StagingStatusValue`
  - [x] 1.4 Update `packages/db/src/schema/index.ts`: add `export * from './staging.js'`
  - [x] 1.5 Run `pnpm db:generate` from `packages/db` to produce migration; commit migration + meta snapshot

- [x] Task 2: Add Zod schemas for staging queue (AC: #1)
  - [x] 2.1 Create `packages/shared/src/schemas/staging.schema.ts` with:
    - `stagingStatusSchema` — `z.enum(['pending', 'approved', 'rejected'])`
    - `stagingResultSchema` — Zod schema for staging service return: `{ threadsStaged: number, threadsFailed: number, batchId: string | null }`
  - [x] 2.2 Export types: `StagingStatus`, `StagingResult`
  - [x] 2.3 Update `packages/shared/src/schemas/index.ts`: add `export * from './staging.schema.js'`

- [x] Task 3: Create `StagingQueueService` (AC: #1, #2, #3, #5, #7)
  - [x] 3.1 Create `apps/api/src/modules/pipeline/anonymization/staging-queue.service.ts`
  - [x] 3.2 Implement `stageResults(results: AnonymizationResult[]): Promise<StagingResult>` that:
    - Returns early with `{ threadsStaged: 0, threadsFailed: 0, batchId: null }` if results is empty
    - Generates a `batchId` (UUID) for the entire run
    - For each result, in a **single DB transaction** per thread:
      1. Inserts a `staging_queue` row with `originalContent`, `anonymizedContent`, `flags`, `batchId`, status `'pending'`
      2. Transitions thread pipeline state from `embedded` → `staged` (update `slackThreads.pipelineState` + `updatedAt` directly — do NOT call `PipelineStateService.transitionState()` to avoid nested transaction; validate current state is `embedded` before update)
    - Per-thread error isolation: failure on one thread does not block others
    - Logs completion with `threadsStaged`, `threadsFailed`, `batchId`, `durationMs`
  - [x] 3.3 Create `apps/api/src/modules/pipeline/anonymization/staging-queue.service.spec.ts`

- [x] Task 4: Add `runStaging()` to `PipelineService` (AC: #6)
  - [x] 4.1 Update `apps/api/src/modules/pipeline/pipeline.service.ts`: inject `StagingQueueService`, add `runStaging(results: AnonymizationResult[]): Promise<StagingResult>` method, export `StagingResult` type

- [x] Task 5: Update `PipelineModule` (AC: all)
  - [x] 5.1 Update `apps/api/src/modules/pipeline/pipeline.module.ts`: add `StagingQueueService` to `providers`

- [x] Task 6: Update `AdminController` to call `runStaging` (AC: #3, #6)
  - [x] 6.1 Update `apps/api/src/modules/admin/admin.controller.ts`: after `entityDetection`, merge flagged (enhanced) + unflagged results into a combined set, pass ALL results to `this.pipelineService.runStaging(allResults)`, include `staging` in the response body
  - [x] 6.2 Merge logic: `entityDetection.results` contains LLM-enhanced flagged threads; `blocklistFilter.results` contains all threads including unflagged ones; build combined set = `entityDetection.results` + unflagged threads not in entityDetection

- [x] Task 7: Create gate enforcement helper (AC: #4)
  - [x] 7.1 Add `isApproved(thread: SlackThread): boolean` utility or a `getApprovedThreadIds()` query method on `StagingQueueService` that future APIs (briefings, search) can use to filter results
  - [x] 7.2 Add a `getApprovedThreads()` method that returns only thread IDs with `staging_queue.status = 'approved'` — this will be consumed by Story 5.x (briefings) and Story 6.x (search)

- [x] Task 8: Write unit tests (AC: #1–#8)
  - [x] 8.1 Empty input → returns `{ threadsStaged: 0, threadsFailed: 0, batchId: null }` (AC: #7)
  - [x] 8.2 Single thread with flags → inserts staging_queue row with correct content, flags, batchId, status='pending' (AC: #1, #5)
  - [x] 8.3 Single thread with zero flags → still inserted into staging_queue — mandatory gate (AC: #3)
  - [x] 8.4 Thread pipeline state transitions from 'embedded' to 'staged' after staging (AC: #2)
  - [x] 8.5 Thread NOT in 'embedded' state → skipped with error log, does not throw (AC: #2)
  - [x] 8.6 Multiple threads → all get same `batchId`, each gets its own staging_queue row (AC: #5)
  - [x] 8.7 Per-thread error isolation: one thread DB insert fails, others still processed (AC: per-item error isolation)
  - [x] 8.8 JSONB content: `originalContent` and `anonymizedContent` match input exactly (AC: #1)
  - [x] 8.9 Flags JSONB: both BLOCKLIST and LLM flags preserved correctly (AC: #1)
  - [x] 8.10 `batchId` is a valid UUID (AC: #5)
  - [x] 8.11 `pipeline.service.spec.ts` (additive) — `runStaging()` delegates to `StagingQueueService` and returns result
  - [x] 8.12 `admin.controller.spec.ts` (additive) — pipeline/run response includes `staging` field with merged results
  - [x] 8.13 Admin controller merge logic: unflagged threads + LLM-enhanced flagged threads combined correctly
  - [x] 8.14 `getApprovedThreadIds()` returns only thread IDs with status='approved' (AC: #4)

- [x] Task 9: E2E validation with imported test data (AC: #8, all)
  - [x] 9.1 Start the local API server (`pnpm dev`)
  - [ ] 9.2 Import representative Slack chat via text-paste import (`POST /api/admin/channels/:id/import`)
  - [ ] 9.3 Run full pipeline (`POST /api/admin/pipeline/run`) — exercises classify → summarize → embed → blocklist filter → LLM entity detection → **staging**
  - [ ] 9.4 Verify staging_queue rows created with correct structure, all threads staged
  - [ ] 9.5 Verify thread pipeline states transitioned to 'staged'
  - [x] 9.6 Document what was validated and any gaps found

## Dev Notes

### Module Placement & Directory Structure

All files follow the established `pipeline/anonymization/` subdirectory pattern from Stories 4.1 and 4.2. The staging queue service lives alongside the blocklist filter and LLM entity detector.

```
apps/api/src/modules/pipeline/
├── pipeline.module.ts                              ← MODIFY: add StagingQueueService to providers
├── pipeline.service.ts                             ← MODIFY: inject StagingQueueService, add runStaging()
├── pipeline.service.spec.ts                        ← MODIFY: add runStaging() tests
├── pipeline-state.service.ts                       ← unchanged (but VALID_TRANSITIONS already has embedded→staged)
├── anonymization/
│   ├── blocklist-filter.processor.ts               ← unchanged
│   ├── blocklist-filter.processor.spec.ts          ← unchanged
│   ├── llm-entity-detector.processor.ts            ← unchanged
│   ├── llm-entity-detector.processor.spec.ts       ← unchanged
│   ├── staging-queue.service.ts                    ← NEW
│   └── staging-queue.service.spec.ts               ← NEW

apps/api/src/modules/admin/
└── admin.controller.ts                             ← MODIFY: add staging step + merge logic
└── admin.controller.spec.ts                        ← MODIFY: add staging response test

packages/db/src/schema/
├── staging.ts                                      ← NEW
├── index.ts                                        ← MODIFY: add export

packages/shared/src/schemas/
├── staging.schema.ts                               ← NEW
├── index.ts                                        ← MODIFY: add export
```

### `staging_queue` Table Schema

```typescript
// packages/db/src/schema/staging.ts

import { index, jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { slackThreads } from './threads.js';
import { users } from './users.js';

export const stagingStatusEnum = pgEnum('staging_status', [
  'pending',
  'approved',
  'rejected',
]);

export const stagingQueue = pgTable(
  'staging_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => slackThreads.id),
    batchId: uuid('batch_id'),
    originalContent: jsonb('original_content').notNull(),
    anonymizedContent: jsonb('anonymized_content').notNull(),
    flags: jsonb('flags').notNull().default([]),
    status: stagingStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_staging_queue_thread_id').on(table.threadId),
    index('idx_staging_queue_status').on(table.status),
    index('idx_staging_queue_batch_id').on(table.batchId),
  ],
);

export type StagingQueueEntry = typeof stagingQueue.$inferSelect;
export type NewStagingQueueEntry = typeof stagingQueue.$inferInsert;
export type StagingStatusValue = (typeof stagingStatusEnum.enumValues)[number];
```

### Data Flow: Pipeline → Staging Queue

The staging service receives the **merged** output from blocklist filter + LLM entity detection:

```
AdminController.runPipeline():
  1. blocklistFilter = runBlocklistFilter()     → ALL embedded threads with results
  2. threadsWithHits = filter(r => r.flags.length > 0)
  3. entityDetection = runLlmEntityDetection(threadsWithHits)  → enhanced flagged threads
  4. ── MERGE STEP (NEW in this story) ──
     flaggedIds = Set(entityDetection.results.map(r => r.threadId))
     unflagged = blocklistFilter.results.filter(r => !flaggedIds.has(r.threadId))
     allResults = [...entityDetection.results, ...unflagged]
  5. staging = runStaging(allResults)            → ALL threads into staging_queue
```

**Why this merge?** The blocklist filter returns results for ALL embedded threads. LLM entity detection only runs on threads with blocklist hits (per Story 4.2 implementation). The staging queue must receive ALL threads (FR28 mandatory gate). So we merge the LLM-enhanced flagged results with the original unflagged results.

### AdminController Update

```typescript
@Post('pipeline/run')
@Roles('ADMIN')
async runPipeline(@Query('date') date?: string) {
  const classification = await this.pipelineService.runClassification(date);
  const summarization = await this.pipelineService.runSummarization(date);
  const embedding = await this.pipelineService.runEmbedding(date);
  const correlation = await this.pipelineService.runCorrelation();
  const blocklistFilter = await this.pipelineService.runBlocklistFilter();
  const threadsWithHits = blocklistFilter.results.filter((r) => r.flags.length > 0);
  const entityDetection = await this.pipelineService.runLlmEntityDetection(threadsWithHits);

  // Merge: LLM-enhanced flagged + unflagged threads
  const flaggedIds = new Set(entityDetection.results.map((r) => r.threadId));
  const unflaggedResults = blocklistFilter.results.filter(
    (r) => !flaggedIds.has(r.threadId),
  );
  const allResults = [...entityDetection.results, ...unflaggedResults];

  const staging = await this.pipelineService.runStaging(allResults);

  return {
    data: {
      classification,
      summarization,
      embedding,
      correlation,
      blocklistFilter,
      entityDetection,
      staging,
    },
  };
}
```

### StagingQueueService Implementation

```typescript
@Injectable()
export class StagingQueueService {
  private readonly logger = new Logger(StagingQueueService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async stageResults(results: AnonymizationResult[]): Promise<StagingResult> {
    if (results.length === 0) {
      this.logger.log('No results to stage');
      return { threadsStaged: 0, threadsFailed: 0, batchId: null };
    }

    const startTime = Date.now();
    const batchId = randomUUID();  // from 'node:crypto'
    let threadsStaged = 0;
    let threadsFailed = 0;

    for (const result of results) {
      try {
        await this.db.transaction(async (tx) => {
          // 1. Validate thread is in 'embedded' state
          const [thread] = await tx
            .select({ id: slackThreads.id, pipelineState: slackThreads.pipelineState })
            .from(slackThreads)
            .where(eq(slackThreads.id, result.threadId));

          if (!thread) {
            throw new Error(`Thread ${result.threadId} not found`);
          }

          if (thread.pipelineState !== 'embedded') {
            throw new Error(
              `Thread ${result.threadId} in state '${thread.pipelineState}', expected 'embedded'`
            );
          }

          // 2. Insert staging_queue row
          await tx.insert(stagingQueue).values({
            threadId: result.threadId,
            batchId,
            originalContent: result.originalContent,
            anonymizedContent: result.anonymizedContent,
            flags: result.flags,
            status: 'pending',
          });

          // 3. Transition thread state embedded → staged
          await tx
            .update(slackThreads)
            .set({
              pipelineState: 'staged' as PipelineStateValue,
              updatedAt: sql`now()`,
            })
            .where(eq(slackThreads.id, result.threadId));
        });

        threadsStaged++;
      } catch (err) {
        this.logger.error('Failed to stage thread', {
          threadId: result.threadId,
          error: err instanceof Error ? err.message : String(err),
        });
        threadsFailed++;
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log('Staging completed', { threadsStaged, threadsFailed, batchId, durationMs });

    return { threadsStaged, threadsFailed, batchId };
  }

  async getApprovedThreadIds(): Promise<string[]> {
    const rows = await this.db
      .select({ threadId: stagingQueue.threadId })
      .from(stagingQueue)
      .where(eq(stagingQueue.status, 'approved'));
    return rows.map((r) => r.threadId);
  }
}
```

**Why not call `PipelineStateService.transitionState()`?** That method wraps its state update in its own `db.transaction()`. Drizzle does not support nested transactions. The staging queue requires an atomic operation: insert row + update thread state in ONE transaction. So the service directly performs the state check and update within its own transaction.

**The VALID_TRANSITIONS map in `pipeline-state.service.ts` already includes `embedded: ['staged', 'failed', 'pending_retry']`** — so the transition is architecturally sanctioned, just executed directly rather than via the service.

### Pipeline State: YES — This Story Transitions State

Unlike the blocklist filter and LLM entity detector (which do NOT transition state), the staging queue service IS responsible for the `embedded → staged` transition. This is the first pipeline step in Epic 4 that actually changes thread state.

**State machine path:** `ingested → classified → summarized → embedded → **staged** → approved → delivered`

### Transaction Boundaries

Per architecture document: *"Anonymization staging: One transaction — write to staging_queue + update thread state"*

Each thread is staged in its own transaction to maintain per-thread error isolation. If thread A fails to stage (e.g., race condition, thread already staged), thread B is still processed.

### Gate Enforcement Strategy

AC #4 requires that no user-facing API returns non-approved threads. For this story:

1. **Create `getApprovedThreadIds()`** on `StagingQueueService` — returns thread IDs where `staging_queue.status = 'approved'`
2. **No user-facing APIs exist yet** (briefings = Epic 5, search = Epic 6) — the gate will be enforced when those stories implement their data layer
3. **The service-layer gate function exists NOW** so future stories have a ready-made filter

**Do NOT add middleware or global guards** — the gate is enforced per-query in each service that returns user-facing content.

### Zod Schemas (packages/shared)

```typescript
// packages/shared/src/schemas/staging.schema.ts
import { z } from 'zod';

export const stagingStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const stagingResultSchema = z.object({
  threadsStaged: z.number().int().nonnegative(),
  threadsFailed: z.number().int().nonnegative(),
  batchId: z.string().uuid().nullable(),
});

export type StagingStatus = z.infer<typeof stagingStatusSchema>;
export type StagingResult = z.infer<typeof stagingResultSchema>;
```

### Critical Implementation Details

**`@Inject()` on ALL constructor params** — Team agreement A6 from Epic 3 retro. The staging service uses `@Inject(DATABASE_TOKEN) private readonly db: Database`.

**Per-thread error isolation** — Wrap each thread in a for-loop in its own try/catch. One thread's staging failure must not abort processing of other threads. On failure, increment `threadsFailed` and continue.

**`randomUUID()` from `node:crypto`** — Use `import { randomUUID } from 'node:crypto'` (with `node:` prefix per project convention) to generate the `batchId`. Do NOT use Drizzle's `defaultRandom()` for batchId since it's generated in application code, not DB default.

**ALWAYS use `.js` extension on relative imports** — ESM requirement.

**NestJS Logger** — Use `private readonly logger = new Logger(StagingQueueService.name)`. NEVER `console.log`.

**`sql` template tag** — Use `sql\`now()\`` for `updatedAt` in the thread state update. Import from `drizzle-orm`.

**JSONB storage** — `originalContent`, `anonymizedContent`, and `flags` are stored as JSONB. Drizzle handles serialization automatically when you pass a JS object to `.values()` for a `jsonb` column.

### Key Drizzle Patterns to Follow

- **Insert staging row:** `await tx.insert(stagingQueue).values({ threadId, batchId, ... })`
- **Update thread state:** `await tx.update(slackThreads).set({ pipelineState: 'staged', updatedAt: sql\`now()\` }).where(eq(slackThreads.id, threadId))`
- **Query by status:** `await this.db.select().from(stagingQueue).where(eq(stagingQueue.status, 'approved'))`
- **Import from `@slack-thread-manager/db`:** `stagingQueue`, `slackThreads`, `type PipelineStateValue`, `type Database`
- **Import from `drizzle-orm`:** `eq`, `sql`
- **DB columns are camelCase in TypeScript** (`threadId`, `batchId`) but snake_case in DB (`thread_id`, `batch_id`)

### Test Mocking Strategy

For `staging-queue.service.spec.ts`:
- Mock `Database` — chain mock: `db.transaction()` receives callback, callback receives `tx` mock
- `tx.select().from().where()` returns thread in 'embedded' state
- `tx.insert().values()` succeeds (void)
- `tx.update().set().where()` succeeds (void)
- Use `vi.fn()` for all mocks per project convention (NOT `jest.fn()`)

For `pipeline.service.spec.ts` (additive):
- Mock `StagingQueueService` — `stageResults: vi.fn().mockResolvedValue({ threadsStaged: 2, threadsFailed: 0, batchId: 'batch-uuid' })`

For `admin.controller.spec.ts` (additive):
- Add `runStaging` to `mockPipelineService`
- Test that merge logic produces correct combined results
- Test that staging result appears in response

### Previous Story Intelligence

**From Story 4.2 (LLM Entity Detection) — most recent pipeline processor:**

- Admin controller currently passes only threads with `flags.length > 0` to LLM entity detection: `const threadsWithHits = blocklistFilter.results.filter((r) => r.flags.length > 0)`
- LLM entity detector returns `LlmEntityDetectionResult` with `results: AnonymizationResult[]` — these are the flagged threads enhanced with LLM flags
- **Blocklist filter results include ALL embedded threads** (both flagged and unflagged) — the staging service needs the COMPLETE set
- Entity detector does NOT apply replacements to `anonymizedContent` — LLM-detected entities are flagged only; `anonymizedContent` reflects blocklist replacements only
- LLM detector does NOT transition pipeline state — threads remain in `embedded`
- Review follow-ups from 4.2: substring/alias gap, sequential LLM calls, prompt injection surface — all deferred, none affect staging

**From Story 4.1 (Anonymization Blocklist & Filter):**

- Blocklist filter scans `classifiedTopics` JSONB columns: `technicalSummary` and `plainSummary`, shape: `{ headline, body, key_decisions[], action_items[] }`
- `structuredClone()` used for deep copy of original content before replacement mutations
- Results returned in-memory (NOT persisted to DB) — **this story persists them to `staging_queue`**
- Filter does NOT transition pipeline state — threads remain in `embedded`
- `AnonymizationResult` includes `{ threadId, originalContent, anonymizedContent, flags }`

**Common patterns from both 4.1 and 4.2:**

- `@Inject(DATABASE_TOKEN) private readonly db: Database` injection pattern
- Per-item error isolation in for-loops
- Return early with zero-counts on empty input
- Log completion with `durationMs`
- Export result type from processor/service file

### Git Intelligence

Latest commits on current branch (`feature/epic-4-anonymization`):
- `8b6aa20` fix(4.2): address code review findings — DB fallback, fence regex, entity dedup
- `7bc06a9` fix(4.2): address code-review findings
- `96c22b8` feat(4.2): add LLM entity detection processor and prompt
- `e13bf85` chore: upgrade to Node.js v24 with tsx loader for ESM dev
- `a8e6506` feat(4.1): add anonymization blocklist schema and filter processor

Story 4.2 is in `review` status — its code is committed and available. No uncommitted changes expected (verify with `git status` before starting).

### Git Governance

Per project-context.md:
- Branch: `feature/epic-4-anonymization` (same as Stories 4.1, 4.2)
- Commit format: `feat(4.3): add staging queue schema and pipeline gate service`
- Commit includes: source files, spec files, migration SQL + meta snapshot, story file, sprint status

### Project Context Reference

All implementation must follow rules in `_bmad-output/project-context.md`:
- **Runtime:** Node.js >=24.0.0 (local dev uses `tsx` loader via `NODE_OPTIONS="--import tsx"`)
- `.js` extension on relative imports (ESM/NodeNext)
- `@Inject(DATABASE_TOKEN)` for database injection
- `@Inject()` on ALL constructor params (Team agreement A6)
- `Logger` class, never `console.log`
- `@Roles('ADMIN')` on admin endpoints
- `{ data: <payload> }` response shape
- Zod schemas in `packages/shared`
- Flat file naming: kebab-case for files, PascalCase for classes
- Vitest + `vi.fn()` for mocks, NOT `jest.fn()`
- Spec files colocated with source

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.3 Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — Pipeline state transitions: `ingested → classified → summarized → embedded → staged → approved → delivered`]
- [Source: _bmad-output/planning-artifacts/architecture.md — Transactional boundaries: "Anonymization staging: One transaction — Write to staging_queue + update thread state"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Module structure: `pipeline/anonymization/staging-queue.service.ts`; `admin/staging/staging.controller.ts` (Story 4.4)]
- [Source: _bmad-output/planning-artifacts/architecture.md — DB schema: `staging.ts` — `staging_queue`, `staging_reviews`]
- [Source: _bmad-output/planning-artifacts/architecture.md — Security: "No content bypasses anonymization — enforced at the service layer, not the controller"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Admin module: "admin role only; full CRUD for roster, channels, staging"]
- [Source: _bmad-output/planning-artifacts/prd.md — FR28 (mandatory staging gate), FR25 (approve/reject workflow)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR6: StagingReviewItem anatomy with approve/reject; UX-DR17: empty state "No items flagged for review"]
- [Source: _bmad-output/project-context.md — Critical Implementation Rules: imports, NestJS patterns, Drizzle patterns, testing, async patterns]
- [Source: _bmad-output/implementation-artifacts/4-1-anonymization-blocklist-and-filter.md — BlocklistFilterResult shape, AnonymizationResult structure, content surfaces scanned]
- [Source: _bmad-output/implementation-artifacts/4-2-llm-entity-detection.md — LlmEntityDetectionResult shape, admin controller flow, no state transition, review follow-ups]
- [Source: apps/api/src/modules/pipeline/pipeline-state.service.ts — VALID_TRANSITIONS: embedded → ['staged', 'failed', 'pending_retry']]
- [Source: apps/api/src/modules/pipeline/pipeline.service.ts — runBlocklistFilter(), runLlmEntityDetection() methods and PipelineService injection pattern]
- [Source: apps/api/src/modules/admin/admin.controller.ts — Current runPipeline() flow with blocklistFilter → entityDetection]
- [Source: packages/db/src/schema/pipeline-state.ts — pipelineStateEnum includes 'staged', 'approved'; pipelineRuns table pattern]
- [Source: packages/shared/src/schemas/anonymization.schema.ts — AnonymizationResult, AnonymizationFlag discriminated union, blocklistMatchSchema, llmEntityMatchSchema]

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (Cursor Agent)

### Debug Log References

- No debug issues encountered; all 11 staging queue tests + 2 pipeline service tests + 3 admin controller tests passed on first run

### Completion Notes List

- ✅ All 253 unit tests pass across 29 test files (zero regressions)
- ✅ TypeScript compilation: zero errors in story-related files (pre-existing TSC issues in `jwt.strategy.spec.ts` and `pipeline-state.service.spec.ts` are unrelated)
- ✅ Shared package builds cleanly with new staging schemas
- ✅ Migration `0014_shallow_magma.sql` generated: CREATE TYPE staging_status + CREATE TABLE staging_queue + 3 indexes + 2 FKs
- ✅ 11 new staging queue service tests + 2 additive pipeline service tests + 3 additive admin controller tests = 16 new tests
- ✅ Mandatory gate enforcement (FR28): threads with zero flags are staged identically to flagged threads
- ✅ Per-thread error isolation: one thread failure does not block others
- ✅ Transaction atomicity: staging_queue insert + thread state transition in single DB transaction
- ✅ Merge logic in AdminController correctly combines LLM-enhanced flagged threads with unflagged threads
- ✅ Gate helper `getApprovedThreadIds()` ready for consumption by Epic 5 (briefings) and Epic 6 (search)

#### E2E Validation

**Validated:**
- API compilation: SWC compiles all files, TSC finds 0 type issues in story files
- All 253 unit tests pass including comprehensive staging queue coverage
- Shared package builds successfully with new schemas
- Migration SQL is syntactically correct with proper FK constraints and indexes

**Not validated (infrastructure not available in dev environment):**
- 9.2: Import via text-paste import — requires running PostgreSQL + Keycloak
- 9.3: Full pipeline run end-to-end — requires PostgreSQL + local LLM service (Ollama)
- 9.4: Live staging_queue row verification — requires all services running
- 9.5: Live thread state transition verification — requires database

**Gaps:**
- Full E2E validation with real data deferred to local dev environment with PostgreSQL, Keycloak, and Ollama running
- The staging queue behavior (atomic inserts, state transitions) can only be fully verified with a live database

### File List

**New files:**
- `packages/db/src/schema/staging.ts` — DB schema: `stagingStatusEnum`, `stagingQueue` table with indexes and FKs
- `packages/db/src/migrations/0014_shallow_magma.sql` — Migration: CREATE TYPE + CREATE TABLE + indexes + FKs
- `packages/db/src/migrations/meta/0014_snapshot.json` — Drizzle meta snapshot
- `packages/shared/src/schemas/staging.schema.ts` — Zod schemas: `stagingStatusSchema`, `stagingResultSchema`, types
- `apps/api/src/modules/pipeline/anonymization/staging-queue.service.ts` — Core service: staging, state transition, gate helper
- `apps/api/src/modules/pipeline/anonymization/staging-queue.service.spec.ts` — 11 unit tests

**Modified files:**
- `packages/db/src/schema/index.ts` — Added staging export
- `packages/db/src/migrations/meta/_journal.json` — Migration journal updated
- `packages/shared/src/schemas/index.ts` — Added staging schema export
- `apps/api/src/modules/pipeline/pipeline.module.ts` — Added `StagingQueueService` to providers
- `apps/api/src/modules/pipeline/pipeline.service.ts` — Injected `StagingQueueService`, added `runStaging()` method, exported `StagingResult` type
- `apps/api/src/modules/pipeline/pipeline.service.spec.ts` — Added `StagingQueueService` mock + 2 `runStaging` tests
- `apps/api/src/modules/admin/admin.controller.ts` — Added staging step with merge logic to `runPipeline()`
- `apps/api/src/modules/admin/admin.controller.spec.ts` — Added `runStaging` mock + 3 staging tests
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status updated
- `_bmad-output/implementation-artifacts/4-3-staging-queue-and-pipeline-gate.md` — Story file updated

### Change Log

- **2026-05-10**: Story 4.3 implementation complete — staging queue schema, service, pipeline integration, gate enforcement helper, merge logic, and 16 new unit tests. All 253 tests pass.
