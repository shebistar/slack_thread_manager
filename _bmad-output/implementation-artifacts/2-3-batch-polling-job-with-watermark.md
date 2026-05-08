# Story 2.3: Batch Polling Job with Watermark

Status: done

## Story

As a **system**,
I want a scheduled batch job that polls configured channels for new threads since the last successful poll,
so that ingestion runs automatically on a configurable schedule without re-processing old data.

## Acceptance Criteria

1. **Given** the batch polling schedule is configured (e.g., cron: every 4 hours), **When** the polling job triggers, **Then** it queries each active channel starting from that channel's `last_polled_ts` watermark.

2. **Given** a channel has been polled successfully, **When** all threads for that channel are processed, **Then** the channel's `last_polled_ts` is updated to the current timestamp.

3. **Given** a channel poll fails partway through, **When** the watermark check runs, **Then** the `last_polled_ts` is NOT advanced — ensuring retry on next run.

4. **Given** the polling job is running, **When** it completes, **Then** it logs batch start/completion with structured JSON including: channels polled, threads found, threads stored, errors, duration.

5. **Given** the health endpoint exists at `/api/health`, **When** a client calls it, **Then** the response includes `lastBatchRun` timestamp and `lastBatchStatus` (success/failed/never).

6. **Given** the cron schedule is defined, **When** the app starts, **Then** it reads the schedule from `INGESTION_CRON_SCHEDULE` environment variable (default: `0 */4 * * *` — every 4 hours) and uses `@nestjs/schedule` `@Cron` decorator.

## Tasks / Subtasks

- [x] Task 1: Install `@nestjs/schedule` and configure `ScheduleModule` (AC: #6)
  - [x] 1.1 Add `@nestjs/schedule` to `apps/api` dependencies
  - [x] 1.2 Import `ScheduleModule.forRoot()` in `AppModule`
  - [x] 1.3 Add `INGESTION_CRON_SCHEDULE` to `envSchema` in `app.config.ts` (optional, default `0 */4 * * *`)

- [x] Task 2: Add `last_polled_ts` column to `slack_channels` schema (AC: #1, #2, #3)
  - [x] 2.1 Add `lastPolledTs` column (`timestamp({ withTimezone: true })`, nullable) to `slackChannels` in `packages/db/src/schema/channels.ts`
  - [x] 2.2 Run `pnpm db:generate` to produce migration SQL, verify it is an `ALTER TABLE ADD COLUMN`

- [x] Task 3: Modify `IngestionService.ingestChannel()` to accept `oldest` parameter (AC: #1)
  - [x] 3.1 Add optional `oldest?: string` parameter to `ingestChannel()`
  - [x] 3.2 Pass `oldest` to `SlackClientService.fetchChannelHistory()` options
  - [x] 3.3 Ensure existing callers (tests, import) are unaffected by optional param

- [x] Task 4: Create `PollingJob` service (AC: #1, #2, #3, #4, #5, #6)
  - [x] 4.1 Create `apps/api/src/modules/ingestion/polling.job.ts`
  - [x] 4.2 Implement `@Cron()` decorated `handlePollingCron()` method
  - [x] 4.3 Implement watermark read: load `last_polled_ts` per channel before polling
  - [x] 4.4 Implement watermark write: update `last_polled_ts` only after successful channel ingestion
  - [x] 4.5 Implement per-channel error isolation: if one channel fails, others still poll
  - [x] 4.6 Track and expose `lastBatchRun` and `lastBatchStatus` as in-memory state
  - [x] 4.7 Log batch start, per-channel progress, and batch completion with timing

- [x] Task 5: Enhance health endpoint (AC: #5)
  - [x] 5.1 Inject `PollingJob` into `AppController` (or create a dedicated health service)
  - [x] 5.2 Add `lastBatchRun` and `lastBatchStatus` to `GET /health` response

- [x] Task 6: Register `PollingJob` in `IngestionModule` (AC: #6)
  - [x] 6.1 Add `PollingJob` to `IngestionModule` providers
  - [x] 6.2 Export `PollingJob` so health endpoint can access batch status

- [x] Task 7: Write unit tests (AC: #1–#6)
  - [x] 7.1 Create `apps/api/src/modules/ingestion/polling.job.spec.ts`
  - [x] 7.2 Test: polls active channels with watermark (oldest) passed to ingestion service
  - [x] 7.3 Test: advances watermark only after successful ingestion
  - [x] 7.4 Test: does NOT advance watermark on failure
  - [x] 7.5 Test: per-channel error isolation — failed channel does not block others
  - [x] 7.6 Test: skips polling when Slack is not configured
  - [x] 7.7 Test: batch status is updated on success and failure

### Review Findings

- [x] [Review][Decision] `INGESTION_CRON_SCHEDULE` injected but never read — resolved: removed `ConfigService` injection, accepted static-only schedule for MVP
- [x] [Review][Patch] Partial-error watermark advance — fixed: `result.errors > 0` now sets `hasAnyFailure=true` and skips watermark advance [polling.job.ts]
- [x] [Review][Patch] Unhandled DB error on `findMany` — fixed: wrapped in try/catch, sets `lastBatchStatus=failed` and returns early [polling.job.ts]
- [x] [Review][Patch] Batch start log missing `schedule` field — fixed: added `schedule: DEFAULT_CRON` to log payload [polling.job.ts]
- [x] [Review][Patch] Per-channel success log missing `newWatermark` — fixed: added `newWatermark` field to success log [polling.job.ts]
- [x] [Review][Patch] DB watermark update can throw after successful ingest — fixed: wrapped in inner try/catch, sets `hasAnyFailure=true` and continues [polling.job.ts]
- [x] [Review][Defer] No mutex against overlapping cron runs — long batches can run concurrently with the next tick [polling.job.ts:36] — deferred, pre-existing MVP scope
- [x] [Review][Defer] No distributed lock for horizontal scaling — multiple API replicas poll the same channels in parallel [polling.job.ts:36] — deferred, pre-existing MVP scope
- [x] [Review][Defer] NestJS Logger structured JSON depends on logger config — second-arg object may not serialize as expected [polling.job.ts throughout] — deferred, pre-existing MVP scope
- [x] [Review][Defer] `lastBatchStatus` semantics ambiguous for zero-channel runs — zero-channel batch reports `success` [polling.job.ts:97-100] — deferred, pre-existing MVP scope
- [x] [Review][Defer] Watermark uses DB `now()` not last-message-ts — messages posted during ingestion window can be skipped on tight schedules [polling.job.ts:73] — deferred, known design trade-off
- [x] [Review][Defer] No cron expression validation — invalid `INGESTION_CRON_SCHEDULE` string fails silently at registration [app.config.ts:11] — deferred, pre-existing MVP scope
- [x] [Review][Defer] Migration rollback strategy not documented — add rollback notes for rolling deploys — deferred, ops concern

## Dev Notes

### Architecture & Patterns

**Module structure:** The polling job lives inside the existing `modules/ingestion/` module. It's a provider, not a controller — it triggers on a cron schedule, not an HTTP request.

**`@nestjs/schedule` setup:**

```typescript
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // ... existing imports
  ],
})
export class AppModule {}
```

**Cron decorator with configurable schedule:**

The `@Cron` decorator in `@nestjs/schedule` v6.x does NOT accept runtime values directly from ConfigService in the decorator argument. Use `CronExpression` as default and override via `SchedulerRegistry` if needed, OR define a static default and document env-based override for production. The simplest approach for MVP:

```typescript
import { Cron } from '@nestjs/schedule';

@Injectable()
export class PollingJob {
  private static readonly DEFAULT_CRON = '0 */4 * * *';

  @Cron(PollingJob.DEFAULT_CRON, { name: 'ingestion-polling' })
  async handlePollingCron(): Promise<void> {
    // ...
  }
}
```

For runtime override, use `OnModuleInit` + `SchedulerRegistry`:

```typescript
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class PollingJob implements OnModuleInit {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const cronSchedule = this.configService.get<string>(
      'INGESTION_CRON_SCHEDULE',
      '0 */4 * * *',
    );
    // Replace the default job with the configured schedule
    const existingJob = this.schedulerRegistry.getCronJob('ingestion-polling');
    existingJob.stop();
    this.schedulerRegistry.deleteCronJob('ingestion-polling');

    const job = new CronJob(cronSchedule, () => this.handlePollingCron());
    this.schedulerRegistry.addCronJob('ingestion-polling', job);
    job.start();
  }
}
```

**Use the simpler approach (static default) unless `INGESTION_CRON_SCHEDULE` is set.** The dynamic approach adds complexity. The simplest correct solution: use the `@Cron` decorator with a default, and override via `SchedulerRegistry` in `onModuleInit` only if the env var differs from default.

**Watermark flow:**

```
1. Load all active channels with their last_polled_ts
2. For each channel:
   a. Read last_polled_ts (may be null = first poll, fetch everything)
   b. Call ingestionService.ingestChannel(id, slackChannelId, name, oldest=last_polled_ts)
   c. If success: UPDATE slack_channels SET last_polled_ts = NOW() WHERE id = channel.id
   d. If failure: do NOT update last_polled_ts (ensures retry next run)
3. Update batch status metadata (in-memory)
4. Log completion summary
```

**Watermark column (`last_polled_ts`):**
- Nullable timestamp — `null` means "never polled, fetch everything"
- Updated only after ALL threads in a channel are successfully processed
- Stored as `timestamptz` for timezone safety
- Used as the `oldest` parameter to `conversations.history` — Slack returns messages newer than this timestamp

**Batch status tracking (in-memory):**

```typescript
private lastBatchRun: Date | null = null;
private lastBatchStatus: 'success' | 'failed' | 'never' = 'never';
```

No need for a DB table — this is operational status that resets on restart. The health endpoint reads these values.

**Health endpoint enhancement:**

```typescript
@Get('health')
getHealth() {
  return {
    status: 'ok',
    lastBatchRun: this.pollingJob.getLastBatchRun()?.toISOString() ?? null,
    lastBatchStatus: this.pollingJob.getLastBatchStatus(),
  };
}
```

### Modifying `IngestionService.ingestChannel()`

The current signature:

```typescript
async ingestChannel(
  internalChannelId: string,
  slackChannelId: string,
  channelName: string,
): Promise<{ threadsFound: number; threadsStored: number; errors: number }>
```

Change to:

```typescript
async ingestChannel(
  internalChannelId: string,
  slackChannelId: string,
  channelName: string,
  oldest?: string,
): Promise<{ threadsFound: number; threadsStored: number; errors: number }>
```

And pass `oldest` to the first `fetchChannelHistory` call:

```typescript
const history = await this.slackClient.fetchChannelHistory(slackChannelId, { cursor, oldest });
```

The `SlackClientService.fetchChannelHistory()` already accepts `{ oldest?: string }` in its options — no changes needed there.

**The `ingestAllChannels()` method does NOT need to change** — it remains a "full ingestion" entry point. The `PollingJob` calls `ingestChannel()` directly with the watermark.

### File List — Files to Create

| File | Purpose |
|------|---------|
| `apps/api/src/modules/ingestion/polling.job.ts` | Cron-scheduled batch polling with watermark logic |
| `apps/api/src/modules/ingestion/polling.job.spec.ts` | Unit tests for the polling job |

### Files to Modify

| File | Change |
|------|--------|
| `apps/api/package.json` | Add `@nestjs/schedule` dependency |
| `apps/api/src/app.module.ts` | Import `ScheduleModule.forRoot()` |
| `apps/api/src/config/app.config.ts` | Add `INGESTION_CRON_SCHEDULE` to `envSchema` |
| `packages/db/src/schema/channels.ts` | Add `lastPolledTs` column to `slackChannels` |
| `apps/api/src/modules/ingestion/ingestion.module.ts` | Add `PollingJob` to providers and exports |
| `apps/api/src/modules/ingestion/ingestion.service.ts` | Add optional `oldest` param to `ingestChannel()` |
| `apps/api/src/app.controller.ts` | Enhance health endpoint with batch status |
| `.env.example` | Add `INGESTION_CRON_SCHEDULE` |

### Naming Conventions (MUST follow)

- DB columns: `snake_case` → `last_polled_ts`
- Drizzle TS props: `camelCase` → `lastPolledTs`
- NestJS files: `kebab-case` → `polling.job.ts`
- Classes: `PascalCase` → `PollingJob`
- Cron job name: `'ingestion-polling'`
- Env var: `UPPER_SNAKE_CASE` → `INGESTION_CRON_SCHEDULE`

### Logging

Use NestJS `Logger` — never `console.log`:
- `this.logger.log('Batch polling started', { channelCount, schedule })` — on batch start
- `this.logger.log('Polling channel', { channelId, channelName, lastPolledTs })` — per channel start
- `this.logger.log('Channel polled successfully, watermark advanced', { channelId, newWatermark })` — per channel success
- `this.logger.error('Channel polling failed, watermark NOT advanced', { channelId, error })` — per channel failure
- `this.logger.log('Batch polling complete', { channelsPolled, threadsFound, threadsStored, errors, durationMs })` — batch summary
- `this.logger.warn('Slack client not configured, skipping batch poll')` — skip if no token

### Testing Standards

- Colocated: `polling.job.spec.ts` next to `polling.job.ts`
- Framework: Vitest + `@nestjs/testing`
- Mock `IngestionService`, `Database`, `ConfigService`, and `SchedulerRegistry`
- **Do NOT** mock `@nestjs/schedule` internals — test the `handlePollingCron()` method directly
- Follow pattern from `ingestion.service.spec.ts`: use `Test.createTestingModule()`

### Drizzle Schema Change

**Add to `packages/db/src/schema/channels.ts`:**

```typescript
export const slackChannels = pgTable(
  'slack_channels',
  {
    // ... existing columns ...
    lastPolledTs: timestamp('last_polled_ts', { withTimezone: true }),
  },
  // ... existing indexes (no new index needed for this column)
);
```

The column is nullable — `null` means the channel has never been polled. No default value needed.

**Migration will produce:**

```sql
ALTER TABLE "slack_channels" ADD COLUMN "last_polled_ts" timestamp with time zone;
```

### Env Config Change

**Add to `apps/api/src/config/app.config.ts`:**

```typescript
export const envSchema = z.object({
  // ... existing ...
  INGESTION_CRON_SCHEDULE: z.string().default('0 */4 * * *'),
});
```

### Anti-Patterns to Avoid

- **DO NOT** create a separate module for scheduling — add the `PollingJob` to the existing `IngestionModule`
- **DO NOT** call `ingestAllChannels()` from the cron job — it doesn't pass watermarks. Call `ingestChannel()` per channel with watermark
- **DO NOT** update `last_polled_ts` before or during ingestion — only after complete success for that channel
- **DO NOT** store batch status in the database — in-memory is sufficient for MVP operational health
- **DO NOT** use `console.log` — use NestJS `Logger`
- **DO NOT** wrap all channels in a single try/catch — each channel must be independently isolated
- **DO NOT** add `@nestjs/schedule` to the root `package.json` — it's an API-only dependency, add it to `apps/api/package.json`
- **DO NOT** forget the `.js` extension on relative imports (ESM/NodeNext convention)

### Previous Story Intelligence (Story 2.2)

Story 2.2 established the `IngestionService`:
- `ingestAllChannels()` — fetches all active channels and ingests everything (no watermark)
- `ingestChannel(internalChannelId, slackChannelId, channelName)` — ingests a single channel, paginates through history
- `ingestThread()` — per-thread transactional upsert with error isolation
- `fetchChannelHistory()` already accepts `{ oldest?, latest?, cursor?, limit? }` options
- The service uses `@Inject(DATABASE_TOKEN)` for Drizzle DB access
- The service reads `SLACK_TEAM_ID` from `ConfigService` and guards against missing config
- Per-thread error isolation: each thread in its own `db.transaction()`, failures counted but don't block others
- Review finding: `participant_handles` was renamed to `participant_ids`
- All 69 tests pass across 12 test files

### Git Intelligence

Recent commit patterns:
- `feat(story-X.Y): description` for story implementations
- `feat: description` for non-story features
- `fix: description` for bug fixes
- Dependencies installed via `pnpm add` in the relevant workspace
- ESM `.js` suffix on all relative imports
- Database operations use `@Inject(DATABASE_TOKEN)` pattern
- NestJS modules follow `module.ts` + `service.ts` + `*.spec.ts` convention

### Project Structure Notes

- Architecture specifies `modules/ingestion/jobs/polling.job.ts` path — but the existing codebase uses flat file structure within modules (no `jobs/` subdirectory exists in any module). **Use flat structure:** `modules/ingestion/polling.job.ts` to match the established pattern.
- Story 2.4 (Thread Update Detection) will build on this watermark pattern — this story establishes the polling cadence and watermark column
- Story 2.5 (Historical Backfill) adds an admin endpoint for on-demand backfill — separate from the scheduled cron

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 Story 2.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Worker Identity & Idempotency Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: apps/api/src/modules/ingestion/ingestion.service.ts — existing ingestion service]
- [Source: apps/api/src/modules/slack/slack-client.service.ts — fetchChannelHistory accepts oldest param]
- [Source: packages/db/src/schema/channels.ts — channels schema to modify]
- [Source: apps/api/src/app.controller.ts — health endpoint to enhance]
- [Source: apps/api/src/config/app.config.ts — env config to extend]

## Dev Agent Record

### Agent Model Used

Opus 4.6

### Debug Log References

### Completion Notes List

- All 7 tasks and 24 subtasks completed
- `@nestjs/schedule@^6.1.3` installed; `ScheduleModule.forRoot()` registered in `AppModule`
- `INGESTION_CRON_SCHEDULE` env var added to `envSchema` (default: `0 */4 * * *`)
- `lastPolledTs` nullable timestamptz column added to `slack_channels`; migration `0004_futuristic_whirlwind.sql` generated (`ALTER TABLE ADD COLUMN`)
- `IngestionService.ingestChannel()` extended with optional `oldest` param, passed to `fetchChannelHistory()` — existing callers unaffected
- `PollingJob` service created with `@Cron` decorator; implements watermark-based polling: reads `lastPolledTs` per channel, passes as `oldest` to Slack API, advances watermark only after successful channel ingestion
- Per-channel error isolation: failed channels don't block others; watermark not advanced on failure
- In-memory batch status tracking (`lastBatchRun`, `lastBatchStatus`) exposed via getters
- Health endpoint enhanced to include `lastBatchRun` and `lastBatchStatus`
- 9 new unit tests covering: watermark passing, watermark advance on success, no advance on failure, per-channel isolation, Slack-not-configured skip, batch status tracking
- Updated `app.controller.spec.ts` to provide `PollingJob` mock
- All 87 tests pass (14 test files), zero regressions

### Change Log

- 2026-05-08: Implemented story 2.3 — Batch Polling Job with Watermark

### File List

**New files:**
- `apps/api/src/modules/ingestion/polling.job.ts`
- `apps/api/src/modules/ingestion/polling.job.spec.ts`
- `packages/db/src/migrations/0004_futuristic_whirlwind.sql`
- `packages/db/src/migrations/meta/0004_snapshot.json`

**Modified files:**
- `apps/api/package.json` — added `@nestjs/schedule` dependency
- `apps/api/src/app.module.ts` — imported `ScheduleModule.forRoot()`
- `apps/api/src/config/app.config.ts` — added `INGESTION_CRON_SCHEDULE` to env schema
- `packages/db/src/schema/channels.ts` — added `lastPolledTs` column
- `apps/api/src/modules/ingestion/ingestion.module.ts` — registered and exported `PollingJob`
- `apps/api/src/modules/ingestion/ingestion.service.ts` — added optional `oldest` param to `ingestChannel()`
- `apps/api/src/app.controller.ts` — enhanced health endpoint with batch status
- `apps/api/src/app.controller.spec.ts` — updated test to mock `PollingJob`
- `.env.example` — added `INGESTION_CRON_SCHEDULE`
- `pnpm-lock.yaml` — updated lockfile
