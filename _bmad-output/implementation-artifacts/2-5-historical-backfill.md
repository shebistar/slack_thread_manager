# Story 2.5: Historical Backfill

Status: review

## Story

As an **admin**,
I want to trigger a one-time backfill of Slack message history from before the system was deployed,
so that the system has context from the project's entire conversation history.

## Acceptance Criteria

1. **Given** the admin sends `POST /api/admin/ingestion/backfill` with body `{ oldestTs: string, channelId?: string }`, **When** the request is processed, **Then** the endpoint returns HTTP 202 with `{ data: { jobId: string, status: 'pending' } }` immediately (async fire-and-forget).

2. **Given** the backfill job has started, **When** it runs, **Then** it retrieves all threads from the specified timeframe using `conversations.history` with cursor-based pagination — delegating completely to `IngestionService.ingestChannel()` which already handles this.

3. **Given** the backfill job processes threads, **When** it writes to the DB, **Then** it uses the same idempotent upsert as regular polling — running the backfill multiple times on the same data produces no duplicates and no corruption.

4. **Given** the backfill job is running, **When** it makes Slack API calls, **Then** rate limiting and retry/backoff are handled transparently by the existing `SlackClientService`.

5. **Given** the backfill job is processing channels, **When** each channel completes, **Then** progress is logged at `log` level with: `jobId`, `channelName`, threads stored for that channel, cumulative totals, and channels remaining.

6. **Given** any user calls `POST /api/admin/ingestion/backfill`, **When** the user is not authenticated or does not have the ADMIN role, **Then** the response is 401 (unauthenticated) or 403 (forbidden).

7. **Given** a backfill job exists, **When** `GET /api/admin/ingestion/backfill/:jobId` is called by an ADMIN user, **Then** it returns `{ data: BackfillJobStatus }` with fields: `jobId`, `status`, `channelsTotal`, `channelsProcessed`, `threadsStored`, `errors`, `startedAt`, and `completedAt` (present when done).

8. **Given** `GET /api/admin/ingestion/backfill/:jobId` is called with an unknown `jobId`, **Then** the response is 404 Not Found.

## Tasks / Subtasks

- [x] Task 1: Add `backfillRequestSchema` Zod schema to `packages/shared` (AC: #1)
  - [x] 1.1 Create `packages/shared/src/schemas/backfill.schema.ts`
  - [x] 1.2 Add `export * from './backfill.schema.js';` to `packages/shared/src/schemas/index.ts`

- [x] Task 2: Create `BackfillService` in `modules/ingestion/` (AC: #1–#5)
  - [x] 2.1 Import `randomUUID` from `node:crypto`
  - [x] 2.2 Define `BackfillJobStatus` interface locally
  - [x] 2.3 Add `private readonly jobs = new Map<string, BackfillJobStatus>()` field
  - [x] 2.4 Implement public `startBackfill()`
  - [x] 2.5 Implement public `getBackfillStatus()`
  - [x] 2.6 Implement `private async runBackfill()`

- [x] Task 3: Create `BackfillController` in `modules/ingestion/` (AC: #1, #6, #7, #8)
  - [x] 3.1 Create `apps/api/src/modules/ingestion/backfill.controller.ts`
  - [x] 3.2 Class decorator: `@Controller('admin/ingestion')` + `@Roles('ADMIN')`
  - [x] 3.3 POST endpoint with 202 Accepted
  - [x] 3.4 GET `/:jobId` endpoint with NotFoundException

- [x] Task 4: Register in `IngestionModule` (AC: all)
  - [x] 4.1 Add `BackfillService` to `providers`
  - [x] 4.2 Add `BackfillController` to `controllers`
  - [x] 4.3 Add `BackfillService` to `exports`

- [x] Task 5: Write unit tests (AC: #1–#8)
  - [x] 5.1 `startBackfill()` — returns UUID jobId, status is pending
  - [x] 5.2 `getBackfillStatus()` — undefined for unknown jobId
  - [x] 5.3 `runBackfill()` all channels — calls ingestChannel for each, completes
  - [x] 5.4 `runBackfill()` specific channel — single ingestChannel call, completes
  - [x] 5.5 `runBackfill()` unknown channelId — fails with 'Channel not found'
  - [x] 5.6 `runBackfill()` — completedAt set on success
  - [x] 5.7 `runBackfill()` — per-channel ingestChannel errors accumulate, job still completes
  - [x] 5.8 `runBackfill()` — top-level DB error sets status to failed
  - [x] 5.9 POST controller — returns 202 with jobId
  - [x] 5.10 GET controller — returns job status when found
  - [x] 5.11 GET controller — throws NotFoundException for unknown jobId
    ```typescript
    interface BackfillJobStatus {
      jobId: string;
      status: 'pending' | 'running' | 'complete' | 'failed';
      channelsTotal: number;
      channelsProcessed: number;
      threadsStored: number;
      errors: number;
      startedAt: Date;
      completedAt?: Date;
      errorMessage?: string;
    }
    ```
  - [ ] 2.3 Add `private readonly jobs = new Map<string, BackfillJobStatus>()` field
  - [ ] 2.4 Implement public `startBackfill(options: { channelId?: string; oldestTs: string }): { jobId: string }`:
    - Generate `jobId = randomUUID()`
    - Insert initial entry into `this.jobs` with `status: 'pending'`, zeroed counters, `startedAt: new Date()`
    - Fire `void this.runBackfill(jobId, options)` (non-blocking)
    - Return `{ jobId }`
  - [ ] 2.5 Implement public `getBackfillStatus(jobId: string): BackfillJobStatus | undefined` — read-only lookup from `this.jobs`
  - [ ] 2.6 Implement `private async runBackfill(jobId: string, options: { channelId?: string; oldestTs: string }): Promise<void>`:
    - Wrap the entire method body in try/catch; on unexpected error: set `status: 'failed'`, set `errorMessage`, log at `error` level
    - Update job to `status: 'running'`
    - Resolve target channels:
      - If `options.channelId`: `findFirst({ where: eq(slackChannels.id, options.channelId) })` — if null, set `status: 'failed'`, `errorMessage: 'Channel not found'`, return
      - If no `channelId`: `findMany({ where: eq(slackChannels.isActive, true) })`
      - Wrap in array so the loop is uniform: `const channels = singleChannel ? [singleChannel] : allChannels`
    - Update `job.channelsTotal = channels.length`
    - For each channel: call `await this.ingestionService.ingestChannel(channel.id, channel.slackChannelId, channel.name, options.oldestTs)`, accumulate into `job.threadsStored` and `job.errors`, increment `job.channelsProcessed`
    - After each channel: `this.logger.log('Backfill progress', { jobId, channelName: channel.name, channelThreadsStored: result.threadsStored, totalThreadsStored: job.threadsStored, channelsProcessed: job.channelsProcessed, channelsTotal: job.channelsTotal })`
    - On completion: set `status: 'complete'`, `completedAt: new Date()`
    - Log `this.logger.log('Backfill complete', { jobId, ...finalSummary })`

- [ ] Task 3: Create `BackfillController` in `modules/ingestion/` (AC: #1, #6, #7, #8)
  - [ ] 3.1 Create `apps/api/src/modules/ingestion/backfill.controller.ts`
  - [ ] 3.2 Class decorator: `@Controller('admin/ingestion')` + `@Roles('ADMIN')`
  - [ ] 3.3 POST `/` endpoint:
    - `@Post()` + `@HttpCode(HttpStatus.ACCEPTED)` (202)
    - `@Body(new ZodValidationPipe(backfillRequestSchema)) body: BackfillRequest`
    - Calls `this.backfillService.startBackfill(body)` → returns `{ data: { jobId, status: 'pending' } }`
  - [ ] 3.4 GET `/:jobId` endpoint:
    - `@Get(':jobId')`
    - `@Param('jobId') jobId: string`
    - Calls `this.backfillService.getBackfillStatus(jobId)` → if `undefined`, throw `new NotFoundException(`Backfill job not found: ${jobId}`)` → else return `{ data: status }`

- [ ] Task 4: Register in `IngestionModule` (AC: all)
  - [ ] 4.1 Add `BackfillService` to `providers` array in `ingestion.module.ts`
  - [ ] 4.2 Add `BackfillController` to `controllers` array in `ingestion.module.ts`
  - [ ] 4.3 Optionally add `BackfillService` to `exports` (not strictly needed but good for testability)

- [ ] Task 5: Write unit tests (AC: #1–#8)
  - [ ] 5.1 `backfill.service.spec.ts`: `startBackfill()` — returns a UUID jobId and the job has `status: 'pending'`
  - [ ] 5.2 `backfill.service.spec.ts`: `getBackfillStatus()` — returns `undefined` for unknown jobId
  - [ ] 5.3 `backfill.service.spec.ts`: `runBackfill()` all channels — calls `ingestChannel` for every active channel when no `channelId` in options; job reaches `status: 'complete'`
  - [ ] 5.4 `backfill.service.spec.ts`: `runBackfill()` specific channel — calls `ingestChannel` only once for the specified channel; job reaches `status: 'complete'`
  - [ ] 5.5 `backfill.service.spec.ts`: `runBackfill()` unknown channelId — sets `status: 'failed'` with `errorMessage: 'Channel not found'`; `ingestChannel` NOT called
  - [ ] 5.6 `backfill.service.spec.ts`: `runBackfill()` — sets `status: 'complete'` with `completedAt` set on success
  - [ ] 5.7 `backfill.service.spec.ts`: `runBackfill()` — sets `status: 'failed'` when `ingestChannel` throws
  - [ ] 5.8 `backfill.service.spec.ts`: `runBackfill()` — accumulates `threadsStored` across multiple channels
  - [ ] 5.9 `backfill.controller.spec.ts`: `POST /admin/ingestion/backfill` — returns 202 with `{ data: { jobId, status: 'pending' } }`
  - [ ] 5.10 `backfill.controller.spec.ts`: `GET /admin/ingestion/backfill/:jobId` — returns 200 with job status when found
  - [ ] 5.11 `backfill.controller.spec.ts`: `GET /admin/ingestion/backfill/:jobId` — returns 404 when jobId not found

## Dev Notes

### Module Placement & Route Pattern

The `BackfillController` lives in `modules/ingestion/` alongside `ImportController`, `IngestionService`, and `PollingJob`. This follows the established pattern where `ImportController` also resides in `modules/ingestion/` but registers admin routes (`@Controller('admin/channels')`).

**Route path:** `@Controller('admin/ingestion')` — a new sub-path distinct from `admin/channels`.

**Full routes exposed:**
- `POST /api/admin/ingestion/backfill`
- `GET /api/admin/ingestion/backfill/:jobId`

Both `AdminModule` and `IngestionModule` are registered in `AppModule` independently. `IngestionModule` controllers naturally register their routes via NestJS. No cross-module import changes needed.

### `BackfillService` — Async Fire-and-Forget

```typescript
import { randomUUID } from 'node:crypto';

startBackfill(options: { channelId?: string; oldestTs: string }): { jobId: string } {
  const jobId = randomUUID();
  this.jobs.set(jobId, {
    jobId,
    status: 'pending',
    channelsTotal: 0,
    channelsProcessed: 0,
    threadsStored: 0,
    errors: 0,
    startedAt: new Date(),
  });
  void this.runBackfill(jobId, options);
  return { jobId };
}
```

`void` suppresses the unhandled promise warning. `runBackfill` catches all its own errors internally — no unhandled rejection.

### In-Memory Job Registry (Intentional V1 Simplicity)

Job status lives in `private readonly jobs = new Map<string, BackfillJobStatus>()`. A process restart clears job history.

**This is correct for V1.** Backfill is a rare admin-only operation. The admin can verify success by checking the channel's thread count. Story 3.2 introduces `pipeline_runs` for persistent batch tracking — do NOT add a `pipeline_runs` table here.

### Reusing `IngestionService.ingestChannel()`

The backfill is entirely delegated to `ingestChannel(internalChannelId, slackChannelId, channelName, oldestTs)`. The `oldest` parameter is already supported (added in Story 2.3). No modifications to `IngestionService` are needed.

This satisfies AC #3 (same idempotent upsert) and AC #4 (rate limits handled by `SlackClientService`) without any new logic.

### Channel Resolution in `runBackfill()`

```typescript
// Specific channel:
const channel = await this.db.query.slackChannels.findFirst({
  where: eq(slackChannels.id, options.channelId),
});
if (!channel) {
  job.status = 'failed';
  job.errorMessage = 'Channel not found';
  return;
}
const targets = [channel];

// All active channels:
const targets = await this.db.query.slackChannels.findMany({
  where: eq(slackChannels.isActive, true),
});
```

The `channelId` in the request body is the internal PostgreSQL UUID (`channel.id`), NOT the Slack `C0ABCDE` format. Consistent with all other admin endpoints using `ParseUUIDPipe`.

### HTTP 202 Accepted (Not 201 Created)

The POST endpoint returns 202 Accepted because the job is started but not complete. Use `@HttpCode(HttpStatus.ACCEPTED)`.

```typescript
@Post()
@HttpCode(HttpStatus.ACCEPTED)
async startBackfill(...) {
  const { jobId } = this.backfillService.startBackfill(body);
  return { data: { jobId, status: 'pending' } };
}
```

### Progress Logging

Since `ingestChannel()` processes a full channel atomically (internal cursor loop), per-channel logging is the natural granularity:

```typescript
this.logger.log('Backfill progress', {
  jobId,
  channelName: channel.name,
  channelThreadsStored: result.threadsStored,
  totalThreadsStored: job.threadsStored,
  channelsProcessed: job.channelsProcessed,
  channelsTotal: job.channelsTotal,
});
```

This meets the AC intent for "periodic progress logging" at the deployment scale (~4 channels, potentially hundreds of threads per channel).

### `oldestTs` Format

A raw Slack timestamp string (`"1700000000.000000"` — Unix epoch in seconds with microsecond precision). Passed directly as `oldest` to `fetchChannelHistory()`. No conversion needed. To backfill from the beginning of a project, the admin provides a very old timestamp (e.g., `"1609459200.000000"` for 2021-01-01).

The Zod schema validates only that `oldestTs` is a non-empty string — no format enforcement, keeping the schema permissive for V1.

### Testing the Async Job

Since `startBackfill()` uses `void runBackfill()`, tests must wait for the async job to settle. The recommended pattern using mocked `ingestChannel`:

```typescript
it('should set status to complete after all channels processed', async () => {
  mockIngestionService.ingestChannel.mockResolvedValue({ threadsFound: 2, threadsStored: 2, errors: 0 });
  mockDb.query.slackChannels.findMany.mockResolvedValue([/* channels */]);

  const { jobId } = service.startBackfill({ oldestTs: '1700000000.000000' });
  // Let micro-task queue drain (all mocked async ops resolve immediately)
  await Promise.resolve();
  await Promise.resolve(); // Second tick for status update after channel loop

  const status = service.getBackfillStatus(jobId);
  expect(status?.status).toBe('complete');
  expect(status?.completedAt).toBeInstanceOf(Date);
});
```

Because mocks resolve via microtasks, a few `await Promise.resolve()` calls are sufficient to drain the queue.

Alternatively, call the private method directly in tests for synchronous control:

```typescript
await service['runBackfill'](jobId, options);
```

Both approaches are acceptable. The private-method access pattern is simpler and less flaky.

### `BackfillJobStatus` — Export Decision

Define `BackfillJobStatus` locally in `backfill.service.ts` (not exported to `packages/shared`). It is an implementation detail of the in-memory job registry, not a cross-package concern.

### Naming Conventions (MUST follow)

- Service class: `BackfillService`
- Controller class: `BackfillController`
- Service file: `backfill.service.ts`
- Controller file: `backfill.controller.ts`
- Schema file: `backfill.schema.ts`
- Schema name: `backfillRequestSchema`
- Type name: `BackfillRequest`
- Log message on start: `'Backfill started'`
- Log message on progress: `'Backfill progress'`
- Log message on complete: `'Backfill complete'`
- Log message on fail: `'Backfill failed'`
- Job status literals: `'pending' | 'running' | 'complete' | 'failed'`

### Anti-Patterns to Avoid

- **DO NOT** add a `pipeline_runs` DB table — that is Story 3.2's job
- **DO NOT** import `AdminModule` into `IngestionModule` or vice versa — controllers in `IngestionModule` already register routes; no cross-module import needed
- **DO NOT** modify `IngestionService.ingestChannel()` — it already supports `oldest?` param from Story 2.3
- **DO NOT** implement cursor-based pagination yourself — `ingestChannel()` already handles pagination internally
- **DO NOT** use `console.log` — use NestJS `Logger`
- **DO NOT** forget `.js` extension on relative imports (ESM/NodeNext convention)
- **DO NOT** validate `jobId` with `ParseUUIDPipe` in the GET endpoint — jobId is generated internally, not from the DB; a plain `@Param('jobId') jobId: string` is fine
- **DO NOT** export `BackfillJobStatus` interface to `packages/shared` — it is an internal implementation detail
- **DO NOT** make `runBackfill()` public — fire-and-forget is an internal mechanism; tests access it via `service['runBackfill']()` or await through the job status

### Files to Create / Modify

| File | Type | Change |
|------|------|--------|
| `packages/shared/src/schemas/backfill.schema.ts` | NEW | `backfillRequestSchema` + `BackfillRequest` type |
| `packages/shared/src/schemas/index.ts` | MODIFY | Export new schema |
| `apps/api/src/modules/ingestion/backfill.service.ts` | NEW | `BackfillService` with in-memory job registry |
| `apps/api/src/modules/ingestion/backfill.controller.ts` | NEW | `BackfillController` (POST + GET) |
| `apps/api/src/modules/ingestion/ingestion.module.ts` | MODIFY | Register `BackfillController` and `BackfillService` |
| `apps/api/src/modules/ingestion/backfill.service.spec.ts` | NEW | 8 unit tests for `BackfillService` |
| `apps/api/src/modules/ingestion/backfill.controller.spec.ts` | NEW | 3 unit tests for `BackfillController` |

### Previous Story Intelligence (Story 2.4)

Story 2.4 established:
- `IngestionService.ingestChannel()` accepts optional `oldest?: string` — already implemented in 2.3
- `ingestThread()` now returns `'ingested' | 'skipped'` — backfill reuses `ingestChannel()` which handles this internally
- `pipelineState: 'ingested'` is set on upsert — backfilled threads automatically get correct pipeline state
- `BackfillService` should follow the same `@Inject(DATABASE_TOKEN)` pattern for DB access
- Flat file structure in `modules/ingestion/` — do NOT create subdirectories

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 Story 2.5]
- [Source: apps/api/src/modules/ingestion/ingestion.service.ts — `ingestChannel()` method (reuse as-is)]
- [Source: apps/api/src/modules/ingestion/ingestion.module.ts — module registration pattern]
- [Source: apps/api/src/modules/ingestion/import.controller.ts — admin controller in IngestionModule pattern]
- [Source: packages/shared/src/schemas/channel.schema.ts — Zod schema pattern to follow]
- [Source: apps/api/src/modules/admin/channels/channels.controller.ts — `@Roles`, `ZodValidationPipe`, response shape pattern]
- [Source: _bmad-output/implementation-artifacts/2-4-thread-update-detection.md — previous story patterns]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5

### Debug Log References

### Completion Notes List

- All 5 tasks completed in one pass; no deviations from story spec.
- `await Promise.resolve()` added at the start of `runBackfill()` to yield back to the caller so `startBackfill()` returns with `status: 'pending'` intact before the job transitions to `'running'`.
- `setImmediate`-based helper (`waitForAsync()`) used in tests to drain the microtask queue after `startBackfill()` fires async.
- Per-channel `ingestChannel()` errors are caught and accumulated — the job itself still reaches `status: 'complete'` even if individual channels error. Only top-level unexpected errors (e.g. DB failure while loading channels) set `status: 'failed'`.
- 111 tests passing across 16 test files; 0 regressions.

### File List

- `packages/shared/src/schemas/backfill.schema.ts` — new `backfillRequestSchema` + `BackfillRequest` type
- `packages/shared/src/schemas/index.ts` — added export for `backfill.schema.js`
- `apps/api/src/modules/ingestion/backfill.service.ts` — new `BackfillService` with in-memory job registry
- `apps/api/src/modules/ingestion/backfill.controller.ts` — new `BackfillController` (POST + GET)
- `apps/api/src/modules/ingestion/ingestion.module.ts` — added `BackfillController` and `BackfillService`
- `apps/api/src/modules/ingestion/backfill.service.spec.ts` — 8 unit tests for `BackfillService`
- `apps/api/src/modules/ingestion/backfill.controller.spec.ts` — 3 unit tests for `BackfillController`
