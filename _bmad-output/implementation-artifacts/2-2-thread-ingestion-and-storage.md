# Story 2.2: Thread Ingestion & Storage

Status: done

## Story

As a **system**,
I want to ingest Slack threads from configured channels and store them with idempotent upsert,
so that thread data is persisted without duplicates regardless of how many times ingestion runs.

## Acceptance Criteria

1. **Given** active channels are configured in the `slack_channels` table, **When** the ingestion service polls a channel, **Then** it retrieves thread-starting messages using the existing `SlackClientService.fetchChannelHistory()` and their replies using `SlackClientService.fetchThreadReplies()`.

2. **Given** a thread is fetched from Slack, **When** it is stored, **Then** it is persisted in a `slack_threads` table with columns: `id` (uuid PK), `slack_team_id` (text, NOT NULL), `channel_id` (uuid FK → `slack_channels.id`), `thread_ts` (text, NOT NULL), `latest_reply_ts` (text, nullable), `message_count` (integer), `raw_messages` (jsonb), `participant_handles` (text array), `created_at` (timestamptz), `updated_at` (timestamptz).

3. **Given** a thread is fetched, **When** its individual messages are stored, **Then** they are persisted in a `thread_messages` table with columns: `id` (uuid PK), `thread_id` (uuid FK → `slack_threads.id`), `message_ts` (text, NOT NULL), `user_handle` (text), `text` (text), `raw_payload` (jsonb).

4. **Given** a thread already exists in the database, **When** the same thread is ingested again, **Then** the upsert uses `ON CONFLICT (slack_team_id, channel_id, thread_ts) DO UPDATE SET updated_at = NOW(), message_count = EXCLUDED.message_count, latest_reply_ts = EXCLUDED.latest_reply_ts, raw_messages = EXCLUDED.raw_messages, participant_handles = EXCLUDED.participant_handles` — no duplicates, no data corruption.

5. **Given** re-running ingestion on the same data, **Then** it produces no duplicates and no data corruption.

6. **Given** a batch of threads being ingested, **When** one thread fails to process, **Then** it does not block processing of other threads — each thread is processed in its own transaction.

## Tasks / Subtasks

- [x] Task 1: Create `slack_threads` and `thread_messages` Drizzle schema (AC: #2, #3)
  - [x] 1.1 Create `packages/db/src/schema/threads.ts` with `slackThreads` and `threadMessages` tables
  - [x] 1.2 Add unique composite index on `(slack_team_id, channel_id, thread_ts)` for the upsert conflict target
  - [x] 1.3 Add index on `channel_id` for channel-based queries
  - [x] 1.4 Add index on `thread_ts` for temporal queries
  - [x] 1.5 Add `threadMessages` FK index on `thread_id`
  - [x] 1.6 Define Drizzle relations: `slackThreads` → `slackChannels`, `threadMessages` → `slackThreads`
  - [x] 1.7 Export from `packages/db/src/schema/index.ts`
  - [x] 1.8 Run `pnpm db:generate` to produce migration SQL, verify it

- [x] Task 2: Create Zod schemas for thread data (AC: #2, #3)
  - [x] 2.1 Create `packages/shared/src/schemas/thread.schema.ts` with `slackThreadSchema`, `threadMessageSchema`
  - [x] 2.2 Export from `packages/shared/src/schemas/index.ts`

- [x] Task 3: Create `IngestionModule` and `IngestionService` (AC: #1, #4, #5, #6)
  - [x] 3.1 Create `apps/api/src/modules/ingestion/ingestion.module.ts`
  - [x] 3.2 Create `apps/api/src/modules/ingestion/ingestion.service.ts` with `ingestChannel(channelId)` and `ingestThread(channelId, threadTs)` methods
  - [x] 3.3 Inject `SlackClientService` (from `SlackModule`) and `Database` (from `DatabaseModule`)
  - [x] 3.4 Implement idempotent upsert using Drizzle's `onConflictDoUpdate()`
  - [x] 3.5 Implement per-thread transaction isolation — each thread upsert in its own `db.transaction()`
  - [x] 3.6 Extract participant handles from messages during ingestion
  - [x] 3.7 Register `IngestionModule` in `AppModule`

- [x] Task 4: Write unit tests for `IngestionService` (AC: #1–#6)
  - [x] 4.1 Create `apps/api/src/modules/ingestion/ingestion.service.spec.ts`
  - [x] 4.2 Test: ingests threads from active channels and stores them
  - [x] 4.3 Test: upsert produces no duplicates on re-run
  - [x] 4.4 Test: single thread failure does not block other threads
  - [x] 4.5 Test: participant handles are correctly extracted from messages

### Review Findings

- [x] [Review][Decision] `participant_handles` renamed to `participant_ids` — stores Slack user IDs; column/field renamed across schema, migration, Zod, and service code.
- [x] [Review][Patch] No defensive guard on destructured upsert result [ingestion.service.ts:138] — added guard throwing on empty returning.
- [x] [Review][Patch] Participant extraction test has unreachable assertions and dead code [ingestion.service.spec.ts:242-273] — rewrote test to capture values from actual tx invocation; removed dead `txFunctions`.
- [x] [Review][Defer] Zod schema datetime strings may not match DB Date objects [thread.schema.ts] — deferred, pre-existing pattern; not consumed for DB validation yet.

## Dev Notes

### Architecture & Patterns

**Module structure:** Follow existing NestJS module convention seen in `modules/slack/` and `modules/admin/`. The ingestion module lives at `apps/api/src/modules/ingestion/`.

**Database access pattern:** Inject the Drizzle `Database` instance via the existing `DatabaseModule`. Use `@Inject('DATABASE')` token — follow the same pattern used in admin services. Import `eq`, `and`, `sql` from `drizzle-orm` for query building.

**Upsert pattern (Drizzle ORM):**

```typescript
import { sql } from 'drizzle-orm';
import { slackThreads } from '@repo/db/schema';

await db.insert(slackThreads)
  .values({
    slackTeamId,
    channelId,      // UUID FK, NOT the Slack channel ID string
    threadTs,
    latestReplyTs,
    messageCount,
    rawMessages,
    participantHandles,
  })
  .onConflictDoUpdate({
    target: [slackThreads.slackTeamId, slackThreads.channelId, slackThreads.threadTs],
    set: {
      updatedAt: sql`now()`,
      messageCount: sql`excluded.message_count`,
      latestReplyTs: sql`excluded.latest_reply_ts`,
      rawMessages: sql`excluded.raw_messages`,
      participantHandles: sql`excluded.participant_handles`,
    },
  });
```

**Thread messages strategy:** After upserting the parent thread, delete existing messages for that thread and re-insert all. This avoids complex per-message upserts and ensures message list is always in sync with the latest Slack state. Wrap the delete+insert in the same transaction as the thread upsert.

**Per-thread transaction:** Each thread must be processed in its own `db.transaction()` call. If one thread fails, catch the error, log it, and continue to the next thread. Never wrap all threads in a single transaction.

**Channel ID mapping:** The `slack_channels` table uses a UUID `id` as PK, but Slack API uses string channel IDs. When ingesting, look up the internal UUID `channel_id` from `slack_channels` by matching `slack_channel_id`. Cache this lookup per batch to avoid repeated DB queries.

**SLACK_TEAM_ID:** The `SLACK_TEAM_ID` env var is already defined in `app.config.ts` but is NOT currently used by `SlackClientService`. The ingestion service must read it from `ConfigService` and use it as part of the dedup key. This is critical for the unique constraint.

### File List — Files to Create

| File | Purpose |
|------|---------|
| `packages/db/src/schema/threads.ts` | Drizzle schema: `slackThreads`, `threadMessages` tables with relations |
| `packages/shared/src/schemas/thread.schema.ts` | Zod schemas for thread and message validation |
| `apps/api/src/modules/ingestion/ingestion.module.ts` | NestJS module: imports SlackModule, DatabaseModule |
| `apps/api/src/modules/ingestion/ingestion.service.ts` | Core ingestion logic: fetch from Slack, upsert to DB |
| `apps/api/src/modules/ingestion/ingestion.service.spec.ts` | Unit tests |

### Files to Modify

| File | Change |
|------|--------|
| `packages/db/src/schema/index.ts` | Add `export * from './threads.js';` |
| `packages/shared/src/schemas/index.ts` | Add `export * from './thread.schema.js';` |
| `apps/api/src/app.module.ts` | Add `IngestionModule` to imports array |

### Naming Conventions (MUST follow)

- DB tables: `snake_case`, plural → `slack_threads`, `thread_messages`
- DB columns: `snake_case` → `slack_team_id`, `thread_ts`, `latest_reply_ts`
- Drizzle TS props: `camelCase` → `slackTeamId`, `threadTs`, `latestReplyTs` (Drizzle maps automatically)
- Indexes: `idx_{table}_{columns}` → `idx_slack_threads_dedup`, `idx_thread_messages_thread_id`
- NestJS files: `kebab-case` → `ingestion.module.ts`, `ingestion.service.ts`
- Classes: `PascalCase` → `IngestionModule`, `IngestionService`
- Zod schemas: `camelCase` + `Schema` suffix → `slackThreadSchema`, `threadMessageSchema`

### Logging

Use NestJS `Logger` — never `console.log`. Log examples:
- `this.logger.log('Ingesting channel', { channelId, channelName })` — on batch start
- `this.logger.log('Thread ingested', { threadTs, messageCount })` — per thread success
- `this.logger.error('Thread ingestion failed', { threadTs, error: err.message })` — per thread failure
- `this.logger.warn('Slack client not configured, skipping ingestion')` — when no token

### Testing Standards

- Colocated: `*.spec.ts` next to source file
- Framework: Vitest + `@nestjs/testing`
- Mock `SlackClientService` and database calls
- Follow the pattern established in `slack-client.service.spec.ts`: use `vi.mock`, `Test.createTestingModule()`
- Test the happy path AND the per-thread error isolation

### Drizzle Schema Technical Details

**`slack_threads` columns:**

| Column | Drizzle Type | DB Type | Notes |
|--------|-------------|---------|-------|
| `id` | `uuid().primaryKey().defaultRandom()` | `uuid` | |
| `slackTeamId` | `text().notNull()` | `text` | Part of composite unique |
| `channelId` | `uuid().notNull().references(() => slackChannels.id)` | `uuid` | FK to `slack_channels.id` |
| `threadTs` | `text().notNull()` | `text` | Slack timestamp, part of composite unique |
| `latestReplyTs` | `text()` | `text` | Nullable, updated on upsert |
| `messageCount` | `integer().notNull().default(0)` | `integer` | |
| `rawMessages` | `jsonb().notNull().default([])` | `jsonb` | Full Slack API response array |
| `participantHandles` | `text().array().notNull().default([])` | `text[]` | Extracted from messages |
| `createdAt` | `timestamp({ withTimezone: true }).notNull().defaultNow()` | `timestamptz` | |
| `updatedAt` | `timestamp({ withTimezone: true }).notNull().defaultNow()` | `timestamptz` | Updated on upsert |

**Composite unique index:** `uniqueIndex('idx_slack_threads_dedup').on(table.slackTeamId, table.channelId, table.threadTs)` — this is the conflict target for upsert.

**`thread_messages` columns:**

| Column | Drizzle Type | DB Type | Notes |
|--------|-------------|---------|-------|
| `id` | `uuid().primaryKey().defaultRandom()` | `uuid` | |
| `threadId` | `uuid().notNull().references(() => slackThreads.id, { onDelete: 'cascade' })` | `uuid` | FK, cascade delete |
| `messageTs` | `text().notNull()` | `text` | Slack message timestamp |
| `userHandle` | `text()` | `text` | Nullable (bot messages may lack user) |
| `text` | `text().notNull().default('')` | `text` | |
| `rawPayload` | `jsonb().notNull()` | `jsonb` | Full Slack message object |

**Drizzle imports needed:** `pgTable`, `uuid`, `text`, `integer`, `timestamp`, `jsonb`, `index`, `uniqueIndex` from `drizzle-orm/pg-core`; `relations` from `drizzle-orm`.

### Ingestion Flow

```
1. Query `slack_channels` WHERE is_active = true
2. For each active channel:
   a. Resolve internal channel UUID from slack_channel_id
   b. Call SlackClientService.fetchChannelHistory(slackChannelId)
   c. Identify thread-starting messages (messages with reply_count > 0 OR thread_ts === ts)
   d. For each thread-starting message:
      i.  Call SlackClientService.fetchThreadReplies(slackChannelId, threadTs)
      ii. Extract participant handles from all messages
      iii. Begin DB transaction
      iv. Upsert slack_threads row
      v.  Get thread UUID (from upsert returning or separate query)
      vi. Delete existing thread_messages for this thread_id
      vii. Insert all messages into thread_messages
      viii. Commit transaction
   e. On thread failure: log error, continue to next thread
3. Return ingestion summary: { channelsPolled, threadsFound, threadsStored, errors }
```

### Anti-Patterns to Avoid

- **DO NOT** create a separate `ingestion/slack-client.service.ts` — reuse `SlackClientService` from `modules/slack/`
- **DO NOT** use `console.log` — use NestJS `Logger`
- **DO NOT** wrap all threads in a single transaction — each thread gets its own
- **DO NOT** use the Slack channel ID string as the FK in `slack_threads` — use the internal UUID from `slack_channels.id`
- **DO NOT** create types locally — use Zod schemas from `packages/shared` and Drizzle inferred types from `packages/db`
- **DO NOT** hardcode `SLACK_TEAM_ID` — read from `ConfigService`
- **DO NOT** import `SlackClientService` directly from its file — import the `SlackModule` and let NestJS DI resolve it

### Previous Story Intelligence (Story 2.1)

Story 2.1 established the `SlackClientService` in `modules/slack/`:
- Methods available: `fetchChannelHistory()`, `fetchThreadReplies()`, `fetchChannelInfo()`, `testConnection()`, `isConfigured()`
- Rate limiting handled internally by the client
- `SlackModule` exports `SlackClientService` — import the module to use the service
- The service returns `SlackMessage` objects with `{ ts, user, text, threadTs?, raw }` shape
- `raw` field on `SlackMessage` is the full Slack API payload as `Record<string, unknown>`
- Error handling: throws on unrecoverable errors after retries exhausted

### Git Intelligence

Recent commits show consistent patterns:
- Commit messages: `feat(story-X.Y): description`
- NestJS modules follow `module.ts` + `service.ts` + `controller.ts` + `service.spec.ts` pattern
- `.js` suffix on relative imports (ESM/NodeNext)
- Database operations use `@Inject('DATABASE')` token

### Project Structure Notes

- All paths align with architecture document's `modules/ingestion/` specification
- Story 2.3 (Batch Polling Job) will ADD the scheduling/cron logic on top of this service — this story focuses ONLY on the core ingestion+storage logic, not scheduling
- Story 2.4 (Thread Update Detection) will ADD update detection logic — this story's upsert already supports re-ingestion naturally

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Worker Identity & Idempotency Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: apps/api/src/modules/slack/slack-client.service.ts — existing Slack API client]
- [Source: packages/db/src/schema/channels.ts — existing channel schema with FK pattern]

## Dev Agent Record

### Agent Model Used

Opus 4.6

### Debug Log References

### Completion Notes List

- All 4 tasks and 20 subtasks completed
- Drizzle schema created for `slack_threads` (10 columns, 3 indexes including composite unique for dedup) and `thread_messages` (6 columns, 1 index, cascade delete FK)
- Migration `0002_gorgeous_starjammers.sql` generated and verified
- Zod schemas created: `slackThreadSchema`, `threadMessageSchema`, `ingestionSummarySchema` with inferred types
- `IngestionService` implements full flow: query active channels, fetch history, identify thread starters, fetch replies, upsert thread + replace messages in per-thread transactions
- Idempotent upsert via `onConflictDoUpdate` on composite unique `(slack_team_id, channel_id, thread_ts)`
- Per-thread error isolation: each thread processed in its own `db.transaction()`, failures logged and counted but do not block other threads
- Participant handle extraction: unique non-"unknown" user handles collected from all thread messages
- 8 unit tests covering: happy path ingestion, Slack-not-configured skip, team-ID-not-set skip, thread filtering, error isolation, participant extraction, upsert idempotency
- All 69 tests pass (12 test files), zero regressions
- TypeScript compilation verified across monorepo

### Change Log

- 2026-05-07: Implemented story 2.2 — Thread Ingestion & Storage

### File List

**New files:**
- `packages/db/src/schema/threads.ts`
- `packages/db/src/migrations/0002_gorgeous_starjammers.sql`
- `packages/db/src/migrations/meta/0002_snapshot.json`
- `packages/shared/src/schemas/thread.schema.ts`
- `apps/api/src/modules/ingestion/ingestion.module.ts`
- `apps/api/src/modules/ingestion/ingestion.service.ts`
- `apps/api/src/modules/ingestion/ingestion.service.spec.ts`

**Modified files:**
- `packages/db/src/schema/index.ts` — added threads export
- `packages/shared/src/schemas/index.ts` — added thread schema export
- `apps/api/src/app.module.ts` — added IngestionModule import
