# Story 2.4: Thread Update Detection

Status: done

## Story

As a **system**,
I want to detect new replies or activity on previously ingested threads,
so that updated threads are flagged for re-processing and don't become stale.

## Acceptance Criteria

1. **Given** a thread was previously ingested and stored, **When** the polling job detects that `latest_reply_ts` for that thread has changed since last ingestion, **Then** the thread's messages are re-fetched and the `slack_threads` row is updated via upsert.

2. **Given** a thread is re-ingested due to new activity, **When** the upsert completes, **Then** the thread's `updated_at` timestamp reflects the re-ingestion time.

3. **Given** a thread is re-ingested due to new activity, **When** the upsert completes, **Then** the thread's `pipeline_state` is set to `'ingested'` (ready for re-classification in Epic 3).

4. **Given** the polling job scans previously ingested threads, **When** a thread's `latest_reply_ts` matches the stored value, **Then** the thread is skipped (`conversations.replies` is NOT called for it).

## Tasks / Subtasks

- [x] Task 1: Add `pipeline_state` column to `slackThreads` schema (AC: #3)
  - [x] 1.1 Add `pipelineState: text('pipeline_state').default('ingested')` (no `.notNull()`) to `slackThreads` in `packages/db/src/schema/threads.ts`
  - [x] 1.2 Run `pnpm db:generate` in `packages/db` to produce migration SQL; verify it is an `ALTER TABLE ADD COLUMN "pipeline_state" text DEFAULT 'ingested'`

- [x] Task 2: Expose `latest_reply` in `SlackMessage` interface (AC: #1, #4)
  - [x] 2.1 Add `latestReply?: string` field to the `SlackMessage` interface in `apps/api/src/modules/slack/slack-client.service.ts`
  - [x] 2.2 Update `toSlackMessage()` private method to map `raw.latest_reply as string | undefined` → `latestReply`

- [x] Task 3: Add skip-if-unchanged logic to `ingestThread()` (AC: #3, #4)
  - [x] 3.1 Change `ingestThread()` return type from `Promise<void>` to `Promise<'ingested' | 'skipped'>`
  - [x] 3.2 At the start of `ingestThread()`, before fetching replies, query DB for existing thread by `(slackTeamId, channelId, threadTs)` — select only `{ id, latestReplyTs }`
  - [x] 3.3 Compute `slackLatestReply = starterMessage.latestReply ?? starterMessage.ts`; if existing record found AND `existing.latestReplyTs === slackLatestReply` → log debug `'Thread unchanged, skipping'` and return `'skipped'`
  - [x] 3.4 In the `onConflictDoUpdate` set clause, add `pipelineState: sql\`'ingested'\`` to reset state on update
  - [x] 3.5 In the `.values()` insert block, add `pipelineState: 'ingested'` for new inserts
  - [x] 3.6 Return `'ingested'` after the upsert completes
  - [x] 3.7 Update `ingestChannel()`: increment `result.threadsStored` only when `ingestThread()` returns `'ingested'` (not `'skipped'`)

- [x] Task 4: Add `detectUpdatedThreads()` to `IngestionService` (AC: #1, #2, #4)
  - [x] 4.1 Add method `detectUpdatedThreads(internalChannelId: string, slackChannelId: string): Promise<{ threadsChecked: number; threadsUpdated: number; errors: number }>`
  - [x] 4.2 Query DB for all stored threads in this channel: `db.query.slackThreads.findMany({ where: eq(slackThreads.channelId, internalChannelId), columns: { id: true, threadTs: true, latestReplyTs: true } })`
  - [x] 4.3 For each stored thread: call `this.slackClient.fetchThreadReplies(slackChannelId, thread.threadTs, { limit: 1 })` to get the root message (the root has `latest_reply` in its raw payload)
  - [x] 4.4 Extract `currentLatestReply = rootMessage?.latestReply ?? rootMessage?.ts` from the first message in the response
  - [x] 4.5 Compute `storedLatestReply = thread.latestReplyTs ?? thread.threadTs`; if `currentLatestReply === storedLatestReply` → increment `threadsChecked`, continue (skip re-ingest — AC: #4)
  - [x] 4.6 If changed: call `this.ingestThread(internalChannelId, slackChannelId, rootMessage)` to fully re-ingest (AC: #1, #2, #3); increment both `threadsChecked` and `threadsUpdated`
  - [x] 4.7 Wrap each thread iteration in a try/catch; on error increment `errors`, log `error` level, continue with next thread (per-thread isolation)
  - [x] 4.8 Log completion: `this.logger.log('Update detection complete', { channelId: slackChannelId, threadsChecked, threadsUpdated, errors })`

- [x] Task 5: Add Phase 2 update-detection call to `PollingJob` (AC: #1)
  - [x] 5.1 After the per-channel Phase 1 loop body (after the catch block for Phase 1), add Phase 2 in its own try/catch: call `await this.ingestionService.detectUpdatedThreads(channel.id, channel.slackChannelId)`
  - [x] 5.2 Add a `threadsUpdated` counter to the batch summary object (initialize to 0)
  - [x] 5.3 Accumulate Phase 2 `threadsUpdated` into the summary
  - [x] 5.4 Phase 2 errors: log `error` level but do NOT set `hasAnyFailure` (Phase 2 errors are independent of watermark advance)
  - [x] 5.5 Add `threadsUpdated` to the `'Batch polling complete'` log payload
  - [x] 5.6 Add `detectUpdatedThreads` mock to `mockIngestionService` in `polling.job.spec.ts` (prevent test failures from missing method)

- [x] Task 6: Write unit tests (AC: #1–#4)
  - [x] 6.1 `ingestion.service.spec.ts`: `ingestThread()` — skips unchanged thread: DB returns matching `latestReplyTs`, `fetchThreadReplies` is NOT called, returns `'skipped'`
  - [x] 6.2 `ingestion.service.spec.ts`: `ingestThread()` — re-ingests changed thread: DB returns different `latestReplyTs`, `fetchAllReplies` IS called (via `fetchThreadReplies`), returns `'ingested'`
  - [x] 6.3 `ingestion.service.spec.ts`: `ingestThread()` — ingests new thread: DB returns null, full ingest proceeds, returns `'ingested'`
  - [x] 6.4 `ingestion.service.spec.ts`: `ingestThread()` — sets `pipelineState = 'ingested'` in upsert values (verify upsert call includes `pipelineState`)
  - [x] 6.5 `ingestion.service.spec.ts`: `detectUpdatedThreads()` — calls `ingestThread` for threads whose `latestReplyTs` changed
  - [x] 6.6 `ingestion.service.spec.ts`: `detectUpdatedThreads()` — skips threads with unchanged `latestReplyTs` (no `ingestThread` call)
  - [x] 6.7 `ingestion.service.spec.ts`: `detectUpdatedThreads()` — per-thread error isolation: error on one thread does not abort others; error count returned
  - [x] 6.8 `polling.job.spec.ts`: Phase 2 calls `detectUpdatedThreads()` for each active channel after Phase 1
  - [x] 6.9 `polling.job.spec.ts`: Phase 2 error does NOT set `lastBatchStatus = 'failed'` (watermark still advances)

## Dev Notes

### Architecture & Patterns

**Module boundary:** All changes stay within `modules/ingestion/` and `modules/slack/` plus the shared `packages/db` schema. No new NestJS modules or providers needed. `detectUpdatedThreads()` is a new method on the existing `IngestionService`.

**Two-phase polling cycle per channel (conceptual view):**

```
Phase 1 (existing, unchanged):
  conversations.history with oldest=last_polled_ts → new thread starters → ingestThread()
  hasAnyFailure flag governs watermark advance

Phase 2 (NEW — this story):
  detectUpdatedThreads() → stored threads → conversations.replies limit=1 → compare latestReplyTs
  Per-thread error isolation; errors do NOT affect watermark advance
```

**Why two phases?**

Slack `conversations.history` with `oldest=watermark` returns thread ROOT messages with `ts >= watermark`. New replies added to OLD threads (root posted before watermark) do NOT appear in a watermark-bounded history scan — the root's `ts` predates the watermark. Phase 2 is required to detect those updates.

### Skip-If-Unchanged Logic in `ingestThread()`

The Slack `conversations.history` response returns thread-root messages with a `latest_reply` field in the raw payload — it's the timestamp of the most recent reply. This is what we compare against stored `latestReplyTs`.

After adding `latestReply` to `SlackMessage`, the skip check:

```typescript
const threadTs = starterMessage.threadTs ?? starterMessage.ts;
const slackLatestReply = starterMessage.latestReply ?? starterMessage.ts;

const existing = await this.db.query.slackThreads.findFirst({
  where: and(
    eq(slackThreads.slackTeamId, this.slackTeamId),
    eq(slackThreads.channelId, internalChannelId),
    eq(slackThreads.threadTs, threadTs),
  ),
  columns: { id: true, latestReplyTs: true },
});

if (existing && existing.latestReplyTs === slackLatestReply) {
  this.logger.debug('Thread unchanged, skipping', { threadTs });
  return 'skipped';
}
```

Import `and` from `drizzle-orm` — it's already available alongside `eq` and `sql`.

**`pipelineState` in upsert — both paths:**

```typescript
// In .values():
.values({
  slackTeamId: this.slackTeamId,
  channelId: internalChannelId,
  threadTs,
  latestReplyTs,
  messageCount: allMessages.length,
  rawMessages: allMessages.map((m) => m.raw),
  participantIds,
  pipelineState: 'ingested',   // NEW
})
// In .onConflictDoUpdate() set:
set: {
  updatedAt: sql`now()`,
  messageCount: sql`excluded.message_count`,
  latestReplyTs: sql`excluded.latest_reply_ts`,
  rawMessages: sql`excluded.raw_messages`,
  participantIds: sql`excluded.participant_ids`,
  pipelineState: sql`'ingested'`,   // NEW: reset on update
},
```

### `detectUpdatedThreads()` Implementation

**Full method signature:**

```typescript
async detectUpdatedThreads(
  internalChannelId: string,
  slackChannelId: string,
): Promise<{ threadsChecked: number; threadsUpdated: number; errors: number }>
```

**How `conversations.replies limit=1` gives us update detection:**

`fetchThreadReplies(slackChannelId, threadTs, { limit: 1 })` returns the thread root as `messages[0]`. The root message has `raw.latest_reply` set to the timestamp of the most recent reply. Exposing this as `message.latestReply` (via the `SlackMessage` interface change in Task 2) gives us a cheap "has this thread changed?" check with just 1 API call per thread.

```typescript
const result = await this.slackClient.fetchThreadReplies(slackChannelId, thread.threadTs, { limit: 1 });
const rootMessage = result.messages[0];
if (!rootMessage) continue; // Thread may have been deleted
const currentLatestReply = rootMessage.latestReply ?? rootMessage.ts;
const storedLatestReply = thread.latestReplyTs ?? thread.threadTs;
if (currentLatestReply === storedLatestReply) {
  // No change — skip
  threadsChecked++;
  continue;
}
// Changed — full re-ingest
await this.ingestThread(internalChannelId, slackChannelId, rootMessage);
```

**Note on double-work:** When `ingestThread()` is called from `detectUpdatedThreads()`, it receives a `rootMessage` from the 1-reply scan. Inside `ingestThread()`, `fetchAllReplies()` re-fetches all replies independently. The skip-if-unchanged check at the start of `ingestThread()` will NOT skip here — since `detectUpdatedThreads()` already verified the thread HAS changed. (The DB still shows the old `latestReplyTs` at this point, and the `rootMessage.latestReply` is the new value — they won't match.)

### `PollingJob` Integration

The Phase 2 block runs AFTER the Phase 1 channel loop (after Phase 1's catch block), still within the per-channel `for` loop:

```typescript
for (const channel of activeChannels) {
  // ... Phase 1: existing watermark-based ingestion ...

  // Phase 2: update detection — independent of Phase 1 outcome
  try {
    const updateResult = await this.ingestionService.detectUpdatedThreads(
      channel.id,
      channel.slackChannelId,
    );
    summary.threadsUpdated += updateResult.threadsUpdated;
    this.logger.log('Update detection complete', {
      channelId: channel.slackChannelId,
      channelName: channel.name,
      ...updateResult,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error('Update detection failed, continuing', {
      channelId: channel.slackChannelId,
      channelName: channel.name,
      error: msg,
    });
    // NOTE: intentionally NOT setting hasAnyFailure = true here
  }
}
```

Add `threadsUpdated: 0` to the initial `summary` object and include it in the completion log.

### Schema Change

**`packages/db/src/schema/threads.ts` — add to `slackThreads`:**

```typescript
pipelineState: text('pipeline_state').default('ingested'),
```

No `.notNull()` — nullable intentionally to avoid breaking existing rows that have no state. Story 3.2 will convert this to a proper pgEnum. The `$inferSelect` type will automatically expose `pipelineState: string | null`.

**Generated migration will produce:**

```sql
ALTER TABLE "slack_threads" ADD COLUMN "pipeline_state" text DEFAULT 'ingested';
```

### `SlackMessage` Interface Update

```typescript
// BEFORE:
export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  threadTs?: string;
  raw: Record<string, unknown>;
}

// AFTER:
export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  threadTs?: string;
  latestReply?: string;   // ADD: from raw.latest_reply (present on thread root messages)
  raw: Record<string, unknown>;
}
```

**Updated `toSlackMessage()`:**

```typescript
private toSlackMessage(raw: Record<string, unknown>): SlackMessage {
  return {
    ts: raw.ts as string,
    user: (raw.user as string) ?? 'unknown',
    text: (raw.text as string) ?? '',
    threadTs: raw.thread_ts as string | undefined,
    latestReply: raw.latest_reply as string | undefined,  // ADD
    raw,
  };
}
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/db/src/schema/threads.ts` | Add `pipelineState` column |
| `apps/api/src/modules/slack/slack-client.service.ts` | Add `latestReply` to `SlackMessage` + `toSlackMessage()` |
| `apps/api/src/modules/ingestion/ingestion.service.ts` | Skip-if-unchanged in `ingestThread()`; new `detectUpdatedThreads()` method |
| `apps/api/src/modules/ingestion/polling.job.ts` | Add Phase 2 call + `threadsUpdated` to summary |
| `apps/api/src/modules/ingestion/ingestion.service.spec.ts` | New tests (Tasks 6.1–6.7) |
| `apps/api/src/modules/ingestion/polling.job.spec.ts` | New tests (Tasks 6.8–6.9) + `detectUpdatedThreads` mock |

**New file:**

| File | Purpose |
|------|---------|
| `packages/db/src/migrations/xxxx_thread_pipeline_state.sql` | Generated by `pnpm db:generate` |
| `packages/db/src/migrations/meta/xxxx_snapshot.json` | Generated alongside migration |

### Testing Standards

- Colocated specs next to source files (existing convention)
- Framework: Vitest + `@nestjs/testing` (see existing `polling.job.spec.ts` for pattern)
- Mock `db.query.slackThreads.findFirst` (or `.findMany`) for DB lookup
- Mock `SlackClientService.fetchThreadReplies` for the `limit=1` call
- Use `vi.fn()` pattern from existing spec files
- When mocking `IngestionService` in `polling.job.spec.ts`, add `detectUpdatedThreads: vi.fn().mockResolvedValue({ threadsChecked: 0, threadsUpdated: 0, errors: 0 })` to `mockIngestionService`

**Test pattern for `ingestThread()` skip:**

```typescript
// Mock DB to return existing thread with same latestReplyTs as Slack message
mockDb.query.slackThreads.findFirst.mockResolvedValue({
  id: 'existing-thread-id',
  latestReplyTs: '1703001234.000200',  // matches Slack message
});
const starterMessage: SlackMessage = {
  ts: '1703001234.000100',
  user: 'U123',
  text: 'Hello',
  threadTs: '1703001234.000100',
  latestReply: '1703001234.000200',  // same as stored
  raw: {},
};
const result = await service.ingestThread('chan-id', 'C0CHANNEL', starterMessage);
expect(result).toBe('skipped');
expect(mockSlackClient.fetchThreadReplies).not.toHaveBeenCalled();
```

### Naming Conventions (MUST follow)

- DB column: `pipeline_state` (snake_case)
- Drizzle TS prop: `pipelineState` (camelCase)
- New method: `detectUpdatedThreads` (camelCase)
- Return type literal: `'ingested'` | `'skipped'`
- Log message on skip: `'Thread unchanged, skipping'`
- Log message on re-ingest: existing `'Thread ingested'` (unchanged)
- Log message for update detection summary: `'Update detection complete'`
- Phase 2 error log: `'Update detection failed, continuing'`

### Anti-Patterns to Avoid

- **DO NOT** add `pipelineState` as `pgEnum` — that is Story 3.2's job; use `text` with a default for now
- **DO NOT** set `hasAnyFailure = true` for Phase 2 errors — Phase 2 is independent of watermark advance
- **DO NOT** skip Phase 2 when Phase 1 has errors — run Phase 2 for all channels regardless of Phase 1 outcome
- **DO NOT** call `ingestAllChannels()` from the cron job — continue using per-channel calls
- **DO NOT** place `detectUpdatedThreads()` on `PollingJob` — it is business logic; it belongs on `IngestionService`
- **DO NOT** create a `jobs/` subdirectory — the established flat structure in `modules/ingestion/` is the pattern (see 2.3 dev notes)
- **DO NOT** use `console.log` — use NestJS `Logger`
- **DO NOT** forget `.js` extension on relative imports (ESM/NodeNext convention)
- **DO NOT** import `and` from anywhere other than `drizzle-orm` — it's in the same package as `eq` and `sql`

### Previous Story Intelligence (Story 2.3)

Story 2.3 established:
- `PollingJob` is flat in `modules/ingestion/` (NOT in a `jobs/` subfolder) — this codebase uses flat module structure
- `handlePollingCron()` iterates per channel; `hasAnyFailure` governs watermark advance
- `ingestChannel()` accepts optional `oldest?: string` param — existing callers still work without it
- `SlackClientService.fetchThreadReplies()` already accepts `{ limit?: number }` in options — no change needed to support `limit=1`
- 87 tests pass across 14 test files — must maintain zero regressions
- Drizzle schema changes: run `pnpm db:generate` inside `packages/db`, commit generated SQL + meta JSON
- `@Inject(DATABASE_TOKEN)` pattern for DB access
- Per-channel error isolation is established — Phase 2 follows the same pattern

### Known Forward Dependency

AC3 mentions resetting `pipeline_state` to `'ingested'`. Story 3.2 (Epic 3) will:
- Convert `pipeline_state` from `text` to a proper `pgEnum` with full state machine values
- Add state transition logic for the full pipeline (classified → summarized → embedded → ...)
- This story only establishes the column and sets it to `'ingested'`; the pipeline processing logic is out of scope here

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 Story 2.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Worker Identity & Idempotency Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: apps/api/src/modules/ingestion/ingestion.service.ts — existing service to modify]
- [Source: apps/api/src/modules/ingestion/polling.job.ts — existing job to modify]
- [Source: apps/api/src/modules/slack/slack-client.service.ts — SlackMessage interface to extend]
- [Source: packages/db/src/schema/threads.ts — schema to extend with pipelineState]
- [Source: _bmad-output/implementation-artifacts/2-3-batch-polling-job-with-watermark.md — previous story patterns and review findings]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5

### Debug Log References

### Completion Notes List

- All 6 tasks completed in one pass; no deviations from story spec.
- Migration `0005_conscious_karma.sql` generated with the exact expected `ALTER TABLE ADD COLUMN "pipeline_state" text DEFAULT 'ingested'` statement.
- `ingestThread()` skip-if-unchanged check uses `and(eq(...slackTeamId), eq(...channelId), eq(...threadTs))` — `and` imported from `drizzle-orm` alongside existing `eq` and `sql`.
- `detectUpdatedThreads()` per-thread error isolation tested: error on thread 1 does not abort thread 2.
- Phase 2 error isolation verified: `detectUpdatedThreads` throwing does NOT set `lastBatchStatus = 'failed'`.
- Test count: 99 tests across 14 test files (was 87 tests across 14 files) — 12 net new tests added.
- Zero regressions; full suite passes clean.

### File List

- `packages/db/src/schema/threads.ts` — added `pipelineState: text('pipeline_state').default('ingested')`
- `packages/db/src/migrations/0005_conscious_karma.sql` — generated migration
- `packages/db/src/migrations/meta/_journal.json` — updated by drizzle-kit
- `packages/db/src/migrations/meta/0005_snapshot.json` — generated snapshot
- `apps/api/src/modules/slack/slack-client.service.ts` — added `latestReply?: string` to `SlackMessage`; updated `toSlackMessage()`
- `apps/api/src/modules/ingestion/ingestion.service.ts` — skip-if-unchanged in `ingestThread()`; new `detectUpdatedThreads()` method; `and` import added
- `apps/api/src/modules/ingestion/polling.job.ts` — Phase 2 try/catch block; `threadsUpdated` in summary
- `apps/api/src/modules/ingestion/ingestion.service.spec.ts` — 7 new tests (Tasks 6.1–6.7); `slackThreads.findFirst` and `findMany` added to mock DB
- `apps/api/src/modules/ingestion/polling.job.spec.ts` — 2 new tests (Tasks 6.8–6.9); `detectUpdatedThreads` mock added to `mockIngestionService`

### Review Findings

- [x] [Review][Patch] Phase 2 silently skipped when Phase 1 has partial errors [`apps/api/src/modules/ingestion/polling.job.ts`] — fixed: removed `continue` from partial-errors and watermark-failure paths; Phase 2 now runs unconditionally per channel via restructured if/else
- [x] [Review][Patch] No-reply threads always re-ingested — skip-if-unchanged logic broken [`apps/api/src/modules/ingestion/ingestion.service.ts:119`] — fixed: replaced `existing.latestReplyTs === slackLatestReply` with explicit `noReplyOnBothSides || sameReply` check
- [x] [Review][Defer] `detectUpdatedThreads` makes N Slack API calls per channel with no activity filter [`apps/api/src/modules/ingestion/ingestion.service.ts:186`] — deferred, pre-existing scale concern acceptable at current ~100s thread volume
