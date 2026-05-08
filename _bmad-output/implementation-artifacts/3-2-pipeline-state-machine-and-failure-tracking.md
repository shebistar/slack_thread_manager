# Story 3.2: Pipeline State Machine & Failure Tracking

Status: done

## Story

As a **developer**,
I want a pipeline state machine that tracks each thread's processing progress with atomic transitions and failure logging,
so that threads move through the pipeline reliably and failures are debuggable.

## Acceptance Criteria

1. **Given** a thread has been ingested (state: `ingested`), **When** the pipeline processes it, **Then** the thread's state transitions atomically through: `ingested` → `classified` → `summarized` → `embedded` → `staged`.

2. **Given** a state transition is requested, **When** it executes, **Then** it runs as a single database transaction that updates `pipeline_state` and `updated_at` atomically.

3. **Given** the `slack_threads` table, **When** examined, **Then** `pipeline_state` is a pgEnum column with values: `ingested`, `classified`, `summarized`, `embedded`, `staged`, `approved`, `delivered`, `failed`, `pending_retry`.

4. **Given** a pipeline batch run completes, **When** tracked, **Then** a `pipeline_runs` row records: `id`, `started_at`, `completed_at`, `threads_processed`, `threads_failed`, `fallback_count`.

5. **Given** a pipeline stage fails for a thread, **When** the failure is recorded, **Then** a `pipeline_failures` row records: `id`, `thread_id`, `pipeline_stage`, `error_message`, `error_context` (JSONB), `created_at`.

6. **Given** a state transition fails (exception thrown), **When** the error is caught, **Then** the thread remains at its current state (no partial transition) and a `pipeline_failures` record is created.

7. **Given** a thread, **When** `processing_date` (UTC date) is recorded alongside a state transition, **Then** the same thread is not double-processed on the same calendar day.

## Tasks / Subtasks

- [x] Task 1: Create pgEnum and new tables in Drizzle schema (AC: #3, #4, #5)
  - [x] 1.1 Create `packages/db/src/schema/pipeline-state.ts`
  - [x] 1.2 Update `packages/db/src/schema/threads.ts`: pipelineState → pgEnum, add processingDate
  - [x] 1.3 Update `packages/db/src/schema/index.ts`: export pipeline-state
  - [x] 1.4 Run `pnpm generate` — migration `0006_spicy_glorian.sql` generated with text→enum USING cast + new tables + processing_date

- [x] Task 2: Create `PipelineStateService` with FSM transition logic (AC: #1, #2, #6, #7)
  - [x] 2.1 Create `apps/api/src/modules/pipeline/pipeline-state.service.ts` with VALID_TRANSITIONS map, transitionState, markFailed, markPendingRetry, getThreadsByState, isValidTransition

- [x] Task 3: Create `PipelineRunService` for batch tracking (AC: #4)
  - [x] 3.1 Create `apps/api/src/modules/pipeline/pipeline-run.service.ts` with startRun, completeRun, getLatestRuns

- [x] Task 4: Create custom error types (AC: #6)
  - [x] 4.1 Create `apps/api/src/modules/pipeline/pipeline.errors.ts` with InvalidStateTransitionError

- [x] Task 5: Update `PipelineModule` (AC: all)
  - [x] 5.1 Update `apps/api/src/modules/pipeline/pipeline.module.ts` — added PipelineStateService and PipelineRunService

- [x] Task 6: Write unit tests (AC: #1–#7)
  - [x] 6.1 valid transition: `ingested` → `classified` succeeds
  - [x] 6.2 invalid transition: `ingested` → `summarized` throws InvalidStateTransitionError
  - [x] 6.3 `markFailed`: pipeline_failures row inserted
  - [x] 6.4 `markPendingRetry`: thread set to pending_retry + failure row
  - [x] 6.5 `getThreadsByState` with processingDate filter
  - [x] 6.6 `transitionState` with processingDate sets column
  - [x] 6.7 `pending_retry` → `ingested` for retry re-entry
  - [x] 6.8 `startRun` creates row with startedAt
  - [x] 6.9 `completeRun` sets completedAt and stats
  - [x] 6.10 `getLatestRuns` ordered by startedAt desc

## Dev Notes

### FSM Transition Matrix (defined in this story per architecture deferral)

```
ingested       → classified, failed, pending_retry
classified     → summarized, failed, pending_retry
summarized     → embedded, failed, pending_retry
embedded       → staged, failed, pending_retry
staged         → approved, failed, pending_retry
approved       → delivered, failed, pending_retry
failed         → ingested (retry re-entry)
pending_retry  → ingested (retry re-entry)
delivered      → (terminal — no transitions out)
```

`failed` and `pending_retry` are reachable from any processing state. `failed` → `ingested` and `pending_retry` → `ingested` enable retry by resetting to the beginning of the pipeline.

### Module Placement

All new files live flat inside `apps/api/src/modules/pipeline/` (no subdirectory). The `providers/` subdirectory exception only applies to LLM providers from Story 3.1.

```
apps/api/src/modules/pipeline/
├── pipeline.module.ts              ← MODIFY: add new services
├── pipeline.errors.ts              ← NEW
├── pipeline-state.service.ts       ← NEW
├── pipeline-state.service.spec.ts  ← NEW
├── pipeline-run.service.ts         ← NEW
├── pipeline-run.service.spec.ts    ← NEW
└── llm/                            ← unchanged from 3.1
```

### Schema Migration: text → pgEnum

The current `pipeline_state` column is `text` with default `'ingested'`. This migration must:
1. Create the `pipeline_state` enum type
2. Alter the column from `text` to `pipeline_state` enum using `USING pipeline_state::pipeline_state`
3. Add the `processing_date` column (nullable `date` type, no timezone)
4. Create the `pipeline_runs` and `pipeline_failures` tables

Drizzle ORM will generate the migration SQL via `pnpm db:generate`. If Drizzle cannot generate a clean text→enum migration, write a manual SQL migration in `packages/db/src/migrations/`.

**Drizzle pgEnum import**: `import { pgEnum } from 'drizzle-orm/pg-core'`

**pgEnum definition pattern**:
```typescript
export const pipelineStateEnum = pgEnum('pipeline_state', [
  'ingested', 'classified', 'summarized', 'embedded',
  'staged', 'approved', 'delivered', 'failed', 'pending_retry',
]);
```

**Usage in threads.ts**: Replace `text('pipeline_state')` with `pipelineStateEnum('pipeline_state')` — the column name stays the same, Drizzle handles the type.

### Database Access Pattern

Both services inject `DATABASE_TOKEN` via `@Inject(DATABASE_TOKEN) private readonly db: Database`. The `Database` type comes from `@slack-thread-manager/db` (the `createDb` return type).

### Transaction Pattern for State Transitions

```typescript
async transitionState(threadId: string, targetState: PipelineStateValue): Promise<SlackThread> {
  return this.db.transaction(async (tx) => {
    const [thread] = await tx.select().from(slackThreads).where(eq(slackThreads.id, threadId));
    if (!thread) throw new NotFoundException(`Thread ${threadId} not found`);
    
    const currentState = thread.pipelineState;
    if (!this.isValidTransition(currentState, targetState)) {
      throw new InvalidStateTransitionError(threadId, currentState, targetState);
    }
    
    const [updated] = await tx.update(slackThreads)
      .set({ pipelineState: targetState, updatedAt: sql`now()` })
      .where(eq(slackThreads.id, threadId))
      .returning();
    return updated!;
  });
}
```

### Processing Date Semantics

`processing_date` is a `date` column (no timezone) storing the UTC calendar date when a thread was last processed. Used for idempotent batch processing:
- Before processing, `getThreadsByState('ingested')` can filter `WHERE processing_date IS NULL OR processing_date < CURRENT_DATE`
- After transitioning state, `processing_date` is set to `CURRENT_DATE` (UTC)
- This prevents the same thread from being reprocessed in the same batch run day

### PipelineRunService ↔ LlmService Integration

Story 3.1's `LlmService` has `resetBatchCounters()` and `logBatchSummary()` methods plus internal `batchFallback` counter. In Story 3.2, `PipelineRunService.completeRun()` receives `fallbackCount` from the caller. The caller (future `PipelineService` in 3.3+) will read `LlmService` batch counters and pass them to `completeRun()`. Story 3.2 only builds the persistence layer — the orchestration wiring happens in later stories.

### PipelineStateValue Type

Extract the enum values as a TypeScript type for use throughout the pipeline module:

```typescript
export type PipelineStateValue = (typeof pipelineStateEnum.enumValues)[number];
```

### Testing Patterns

Mock the database following existing patterns:
```typescript
const mockDb = {
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  query: {
    slackThreads: { findMany: vi.fn(), findFirst: vi.fn() },
  },
};
```

For transaction tests, `mockDb.transaction` should call the callback with a mock `tx` that has the same shape. Use `vi.fn().mockImplementation(async (cb) => cb(mockTx))`.

### Anti-Patterns to Avoid

- **DO NOT** use `SELECT FOR UPDATE` — single-process architecture, no concurrent workers
- **DO NOT** add a `version` column for optimistic locking — deferred to horizontal scaling
- **DO NOT** create `pipeline.service.ts` (the orchestrator) — that is Story 3.3+
- **DO NOT** create `processors/` directory — processors are Stories 3.3–3.7
- **DO NOT** make `processing_date` required/not-null — existing threads have no processing date yet
- **DO NOT** forget `.js` extension on relative imports
- **DO NOT** use `console.log` — use `new Logger(ClassName.name)`

### Files to Create / Modify

| File | Type | Change |
|------|------|--------|
| `packages/db/src/schema/pipeline-state.ts` | NEW | pgEnum, `pipeline_runs`, `pipeline_failures` tables |
| `packages/db/src/schema/threads.ts` | MODIFY | Use pgEnum for `pipelineState`, add `processingDate` |
| `packages/db/src/schema/index.ts` | MODIFY | Export `pipeline-state.ts` |
| `packages/db/src/migrations/XXXX_*.sql` | NEW | Generated migration (text→enum + new tables + processing_date) |
| `packages/db/src/migrations/meta/_journal.json` | MODIFY | Auto-updated by drizzle-kit |
| `apps/api/src/modules/pipeline/pipeline.errors.ts` | NEW | `InvalidStateTransitionError` |
| `apps/api/src/modules/pipeline/pipeline-state.service.ts` | NEW | FSM transition logic |
| `apps/api/src/modules/pipeline/pipeline-state.service.spec.ts` | NEW | 7 unit tests |
| `apps/api/src/modules/pipeline/pipeline-run.service.ts` | NEW | Batch run tracking |
| `apps/api/src/modules/pipeline/pipeline-run.service.spec.ts` | NEW | 3 unit tests |
| `apps/api/src/modules/pipeline/pipeline.module.ts` | MODIFY | Register new services |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Pipeline State Machine (lines 962–993)]
- [Source: _bmad-output/planning-artifacts/architecture.md#LLM Failure Modes & Operational Safeguards (lines 913–974)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure (lines 614–630)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Transactional Boundaries]
- [Source: _bmad-output/project-context.md#Known Deferred Work — pipelineState→pgEnum, pipeline_runs]
- [Source: _bmad-output/implementation-artifacts/3-1-llm-abstraction-layer-and-provider-interface.md#Module Registration Chain]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md — BackfillService in-memory → pipeline_runs]

## Senior Developer Review (AI)

**Review Date:** 2026-05-08
**Review Outcome:** Changes Requested
**Layers Run:** Blind Hunter ✅ · Edge Case Hunter ✅ · Acceptance Auditor ✅

### Action Items

**Patches (must fix before `done`):**

- [x] [Review][Patch] P1: `markPendingRetry` bypasses FSM validation — can move a `delivered` (terminal) thread to `pending_retry`, violating the FSM matrix which says `delivered` has no outgoing transitions [`pipeline-state.service.ts:105-117`]
- [x] [Review][Patch] P2: No index on `pipeline_failures.thread_id` FK column — failure lookup queries will degrade as table grows [`packages/db/src/schema/pipeline-state.ts:29`]
- [x] [Review][Patch] P3: `markFailed` runs outside any transaction — if caller is already in a transaction, the failure insert commits independently; should be documented or accept optional `tx` parameter [`pipeline-state.service.ts:85-98`]

**Deferred:**

- [x] [Review][Defer] Circular import between `pipeline-state.ts` and `threads.ts` — works due to ESM lazy FK pattern but adds fragility; refactor if schema files grow
- [x] [Review][Defer] `pipeline_runs` has no index on `started_at` — sequential scan for `getLatestRuns`; fine at MVP volume (~100s runs)
- [x] [Review][Defer] `pipeline_failures.thread_id` FK has no `ON DELETE CASCADE` — FK constraint prevents thread deletion while failures exist; add cascade when thread lifecycle management is implemented
- [x] [Review][Defer] Unicode `→` in `InvalidStateTransitionError` message — may cause encoding issues in some log aggregators

### Review Follow-ups (AI)

*(populated by dev agent when addressing review findings)*

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-20250514

### Debug Log References

### Completion Notes List

- Drizzle-kit successfully generated migration `0006_spicy_glorian.sql` that converts `pipeline_state` from `text` to `pgEnum` using `USING "pipeline_state"::"public"."pipeline_state"` cast — no manual migration needed
- `pipeline-state.ts` creates a circular import with `threads.ts` (enum defined in pipeline-state, used in threads; FK in pipeline-state references slackThreads from threads). This works correctly because the FK reference uses Drizzle's lazy function pattern `() => slackThreads.id`, and ESM live bindings resolve the cycle
- `PipelineStateService.markFailed` only inserts a `pipeline_failures` row without modifying thread state — the thread stays at its current state for retry. `markPendingRetry` does both: transitions state AND records failure
- `VALID_TRANSITIONS` is a const map, not a method — keeps the FSM matrix readable and testable via `isValidTransition()` public method
- `delivered` is a terminal state with no outgoing transitions; `failed` and `pending_retry` can only transition back to `ingested` (re-entry)
- Did NOT re-export `LlmPendingRetryError` from `pipeline.errors.ts` — callers can import it directly from `./llm/llm-provider.interface.js` as needed; adding a re-export would create an unnecessary coupling
- 142 total tests pass (19 new: 15 pipeline-state + 4 pipeline-run), 0 regressions

### File List

- `packages/db/src/schema/pipeline-state.ts` — NEW: pgEnum, pipeline_runs table, pipeline_failures table, type exports
- `packages/db/src/schema/threads.ts` — MODIFIED: pipelineState text→pgEnum, added processingDate column
- `packages/db/src/schema/index.ts` — MODIFIED: added pipeline-state export
- `packages/db/src/migrations/0006_spicy_glorian.sql` — NEW: migration (enum type, 2 tables, column conversion)
- `packages/db/src/migrations/meta/_journal.json` — MODIFIED: auto-updated by drizzle-kit
- `apps/api/src/modules/pipeline/pipeline.errors.ts` — NEW: InvalidStateTransitionError
- `apps/api/src/modules/pipeline/pipeline-state.service.ts` — NEW: FSM transition logic
- `apps/api/src/modules/pipeline/pipeline-state.service.spec.ts` — NEW: 15 tests
- `apps/api/src/modules/pipeline/pipeline-run.service.ts` — NEW: batch run tracking
- `apps/api/src/modules/pipeline/pipeline-run.service.spec.ts` — NEW: 4 tests
- `apps/api/src/modules/pipeline/pipeline.module.ts` — MODIFIED: added new services
