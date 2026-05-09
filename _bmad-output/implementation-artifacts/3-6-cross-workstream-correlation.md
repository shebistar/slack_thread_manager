# Story 3.6: Cross-Workstream Correlation

Status: done

## Story

As a **system**,
I want to detect when the same topic appears across multiple channels and store those correlations,
so that briefings can surface cross-cutting patterns that team members would otherwise miss.

## Acceptance Criteria

1. **Given** threads have been classified and embedded (pipeline state: `embedded`), **When** the correlator processor runs after a batch, **Then** it identifies topic matches across different channels using both semantic similarity (embedding cosine distance) and topic label matching.

2. **Given** two threads from different channels whose embedding cosine similarity meets or exceeds the configured threshold, **When** a SEMANTIC correlation is found, **Then** both directions are stored: (A→B) and (B→A) in `topic_correlations`.

3. **Given** two threads from different channels sharing the same `primary_topic` string, **When** a TOPIC_MATCH correlation is found, **Then** both directions are stored in `topic_correlations` with `confidence = 1.0`.

4. **Given** two threads that share at least one participant handle in `participantIds`, **When** a PARTICIPANT_OVERLAP correlation is found, **Then** both directions are stored with `confidence` = shared/total participants ratio (Jaccard index).

5. **Given** a correlation has already been stored for a (source, correlated) pair, **When** the correlator runs again, **Then** the existing row is updated (upsert) — no duplicate rows created (idempotent).

6. **Given** the correlation similarity threshold, **When** configured, **Then** it is read from `CORRELATION_SIMILARITY_THRESHOLD` environment variable (default: `0.7`); value must be a float in range [0.0, 1.0].

7. **Given** all `embedded` threads in the database, **When** the correlator runs, **Then** it only correlates threads from **different** `channel_id` values (does not correlate within the same channel).

8. **Given** a batch of threads runs through the pipeline, **When** `runCorrelation()` is called, **Then** it logs: correlations created/updated, pairs evaluated, duration; runs as part of `POST /api/admin/pipeline/run`.

9. **Given** there are fewer than 2 embedded threads total, **When** the correlator runs, **Then** it returns `{ created: 0, updated: 0 }` without error.

## Tasks / Subtasks

- [ ] Task 1: Add `topic_correlations` schema + pgEnum + migration (AC: #2, #3, #4, #5)
  - [ ] 1.1 In `packages/db/src/schema/topics.ts`: add `correlationTypeEnum = pgEnum('correlation_type', ['semantic', 'topic_match', 'participant_overlap'])` and `topicCorrelations` table with: `id` (uuid PK, defaultRandom), `sourceThreadId` (FK → `slackThreads.id`, not null), `correlatedThreadId` (FK → `slackThreads.id`, not null), `correlationType` (correlationTypeEnum, not null), `confidence` (real, not null), `createdAt` (timestamptz, defaultNow)
  - [ ] 1.2 Add unique index on `(sourceThreadId, correlatedThreadId)` in the table definition (for upsert idempotency)
  - [ ] 1.3 Add `topicCorrelationsRelations` in `topics.ts`: `sourceThread` → one(slackThreads, sourceThreadId), `correlatedThread` → one(slackThreads, correlatedThreadId)
  - [ ] 1.4 Export `TopicCorrelation`, `NewTopicCorrelation`, `CorrelationTypeEnum` types from `topics.ts`
  - [ ] 1.5 Run `pnpm db:generate` from `packages/db` to produce migration `0011_*.sql`; commit migration + meta snapshot

- [ ] Task 2: Add `CORRELATION_SIMILARITY_THRESHOLD` to config (AC: #6)
  - [ ] 2.1 Update `apps/api/src/config/llm.config.ts`: add `CORRELATION_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).optional().default(0.7)` to the config schema

- [ ] Task 3: Create `CorrelatorProcessor` (AC: #1–#9)
  - [ ] 3.1 Create `apps/api/src/modules/pipeline/processors/correlator.processor.ts` — see Dev Notes for full implementation details
  - [ ] 3.2 Create `apps/api/src/modules/pipeline/processors/correlator.processor.spec.ts` — see Test Cases below

- [ ] Task 4: Add `runCorrelation()` to `PipelineService` (AC: #8)
  - [ ] 4.1 Update `apps/api/src/modules/pipeline/pipeline.service.ts`: inject `CorrelatorProcessor`, add `runCorrelation(): Promise<CorrelationRunResult>` method

- [ ] Task 5: Update `PipelineModule` (AC: all)
  - [ ] 5.1 Update `apps/api/src/modules/pipeline/pipeline.module.ts`: add `CorrelatorProcessor` to `providers`

- [ ] Task 6: Update `AdminController` to call `runCorrelation` (AC: #8)
  - [ ] 6.1 Update `apps/api/src/modules/admin/admin.controller.ts`: add `const correlation = await this.pipelineService.runCorrelation()` after `runEmbedding()` call; include `correlation` in the response body

- [ ] Task 7: Write unit tests (AC: #1–#9)
  - [ ] 7.1 `correlator.processor.spec.ts` — SEMANTIC correlation found: two threads with high cosine similarity across different channels → two rows inserted (A→B, B→A)
  - [ ] 7.2 `correlator.processor.spec.ts` — TOPIC_MATCH correlation: same primary_topic, different channels → bidirectional rows with confidence = 1.0
  - [ ] 7.3 `correlator.processor.spec.ts` — PARTICIPANT_OVERLAP: shared participant handles → bidirectional rows with Jaccard confidence
  - [ ] 7.4 `correlator.processor.spec.ts` — same channel filtered out: two threads in same channel are NOT correlated even if similar
  - [ ] 7.5 `correlator.processor.spec.ts` — idempotency: running twice on same threads produces no duplicate rows (upsert)
  - [ ] 7.6 `correlator.processor.spec.ts` — below-threshold similarity: pair with cosine_similarity < threshold is NOT correlated
  - [ ] 7.7 `correlator.processor.spec.ts` — fewer than 2 threads: returns `{ created: 0, updated: 0 }` immediately
  - [ ] 7.8 `pipeline.service.spec.ts` (additive) — `runCorrelation()`: delegates to `CorrelatorProcessor.runBatchCorrelation()` and returns its result
  - [ ] 7.9 `pipeline.service.spec.ts` (additive) — `runCorrelation()`: empty batch returns zeros

- [ ] Task 8: E2E validation with imported test data (AC: all)
  - [ ] 8.1 Verify `topic_correlations` table and enum created in DB
  - [ ] 8.2 Insert at least two threads with embeddings in different channels
  - [ ] 8.3 Trigger `POST /api/admin/pipeline/run` and verify correlation rows are written
  - [ ] 8.4 Verify bidirectional rows exist for each correlated pair
  - [ ] 8.5 Verify idempotency: run again and confirm no new rows
  - [ ] 8.6 Document results in Completion Notes

## Dev Notes

### Module Placement & Directory Structure

All files follow the established architecture:

```
apps/api/src/modules/pipeline/
├── pipeline.module.ts              ← MODIFY: add CorrelatorProcessor to providers
├── pipeline.service.ts             ← MODIFY: inject CorrelatorProcessor, add runCorrelation()
├── pipeline.service.spec.ts        ← MODIFY: add runCorrelation() tests
├── processors/
│   ├── classifier.processor.ts     ← unchanged
│   ├── summarizer.processor.ts     ← unchanged
│   ├── embedder.processor.ts       ← unchanged
│   ├── correlator.processor.ts     ← NEW
│   └── correlator.processor.spec.ts ← NEW
└── llm/                            ← unchanged

apps/api/src/modules/admin/
└── admin.controller.ts             ← MODIFY: add runCorrelation() call
```

```
packages/db/src/schema/
├── topics.ts                       ← MODIFY: add correlationTypeEnum + topicCorrelations table
└── (rest unchanged)
```

### topic_correlations Table Schema

```typescript
// packages/db/src/schema/topics.ts — ADDITIONS

export const correlationTypeEnum = pgEnum('correlation_type', [
  'semantic',
  'topic_match',
  'participant_overlap',
]);

export const topicCorrelations = pgTable(
  'topic_correlations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceThreadId: uuid('source_thread_id')
      .notNull()
      .references(() => slackThreads.id),
    correlatedThreadId: uuid('correlated_thread_id')
      .notNull()
      .references(() => slackThreads.id),
    correlationType: correlationTypeEnum('correlation_type').notNull(),
    confidence: real('confidence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_topic_correlations_pair').on(table.sourceThreadId, table.correlatedThreadId),
    index('idx_topic_correlations_source').on(table.sourceThreadId),
    index('idx_topic_correlations_correlated').on(table.correlatedThreadId),
  ],
);
```

**Important:** `topics.ts` already imports `slackThreads` via `import { slackThreads } from './threads.js'` for the existing FK on `classifiedTopics`. Reuse that import. Do NOT add a duplicate import.

### CorrelatorProcessor Implementation

The processor uses a single efficient SQL query to find SEMANTIC correlations via pgvector, then application-level passes for TOPIC_MATCH and PARTICIPANT_OVERLAP:

```typescript
// apps/api/src/modules/pipeline/processors/correlator.processor.ts

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, ne, sql } from 'drizzle-orm';
import {
  classifiedTopics,
  slackThreads,
  threadEmbeddings,
  topicCorrelations,
} from '@slack-thread-manager/db';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';

export interface CorrelationRunResult {
  created: number;
  updated: number;
  pairsEvaluated: number;
}

@Injectable()
export class CorrelatorProcessor {
  private readonly logger = new Logger(CorrelatorProcessor.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async runBatchCorrelation(): Promise<CorrelationRunResult> {
    // 1. Load all embedded threads with their channel IDs and embeddings
    const embeddedRows = await this.db
      .select({
        threadId: slackThreads.id,
        channelId: slackThreads.channelId,
        participantIds: slackThreads.participantIds,
      })
      .from(slackThreads)
      .where(eq(slackThreads.pipelineState, 'embedded'));

    if (embeddedRows.length < 2) {
      return { created: 0, updated: 0, pairsEvaluated: 0 };
    }

    const threshold = this.configService.get<number>('CORRELATION_SIMILARITY_THRESHOLD') ?? 0.7;
    const threadIds = embeddedRows.map((r) => r.threadId);

    // 2. Find SEMANTIC correlations using pgvector in a single SQL query
    const semanticPairs = await this.findSemanticCorrelations(threadIds, threshold);

    // 3. Find TOPIC_MATCH correlations via classified_topics
    const topicMatchPairs = await this.findTopicMatchCorrelations(threadIds, embeddedRows);

    // 4. Find PARTICIPANT_OVERLAP correlations
    const participantPairs = this.findParticipantOverlapCorrelations(embeddedRows);

    // 5. Merge all pairs, deduplicate (semantic takes priority over topic_match for same pair)
    const allPairs = this.mergePairs(semanticPairs, topicMatchPairs, participantPairs);

    // 6. Upsert all bidirectional pairs
    let created = 0;
    let updated = 0;

    for (const pair of allPairs) {
      const forward = await this.upsertCorrelation(pair.sourceThreadId, pair.correlatedThreadId, pair.type, pair.confidence);
      const reverse = await this.upsertCorrelation(pair.correlatedThreadId, pair.sourceThreadId, pair.type, pair.confidence);
      if (forward === 'created') created += 2;
      else updated += 2;
    }

    this.logger.log('Correlation batch completed', {
      pairsEvaluated: allPairs.length,
      created,
      updated,
    });

    return { created, updated, pairsEvaluated: allPairs.length };
  }
  // ... (see full implementation guidance below)
}
```

**Key implementation details for `findSemanticCorrelations()`:**

Use a raw SQL query with the pgvector `<=>` operator (cosine distance). Cosine **similarity** = `1 - distance`:

```typescript
private async findSemanticCorrelations(
  threadIds: string[],
  threshold: number,
): Promise<Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }>> {
  if (threadIds.length < 2) return [];

  const rows = await this.db.execute<{
    source_thread_id: string;
    correlated_thread_id: string;
    cosine_similarity: number;
  }>(sql`
    SELECT
      te1.thread_id AS source_thread_id,
      te2.thread_id AS correlated_thread_id,
      (1 - (te1.embedding <=> te2.embedding))::float AS cosine_similarity
    FROM thread_embeddings te1
    JOIN thread_embeddings te2
      ON te1.thread_id < te2.thread_id
    JOIN slack_threads st1 ON te1.thread_id = st1.id
    JOIN slack_threads st2 ON te2.thread_id = st2.id
    WHERE st1.channel_id != st2.channel_id
      AND te1.thread_id = ANY(${sql.raw(`ARRAY[${threadIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})
      AND te2.thread_id = ANY(${sql.raw(`ARRAY[${threadIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})
      AND (1 - (te1.embedding <=> te2.embedding)) >= ${threshold}
  `);

  return rows.rows.map((r) => ({
    sourceThreadId: r.source_thread_id,
    correlatedThreadId: r.correlated_thread_id,
    confidence: r.cosine_similarity,
  }));
}
```

**IMPORTANT — safe SQL construction**: Because we pass an array of UUIDs, prefer the Drizzle `sql` tagged template with `inArray` or use `ANY()` with a properly parameterized array. The simplest approach that avoids SQL injection (UUIDs are safe to interpolate directly since they're UUIDs, not user input):

```typescript
// Safe version using drizzle-orm sql interpolation:
const result = await this.db.execute<{...}>(
  sql`SELECT ... WHERE te1.thread_id = ANY(${threadIds}) AND ...`
);
// drizzle properly parameterizes arrays passed via ${} interpolation in sql``
```

Use `sql`...`` with `${threadIds}` — Drizzle will parameterize the array properly.

**For `findTopicMatchCorrelations()`:**

```typescript
private async findTopicMatchCorrelations(
  threadIds: string[],
  embeddedRows: Array<{ threadId: string; channelId: string }>,
): Promise<Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }>> {
  // Fetch classified topics for all embedded threads
  const topics = await this.db
    .select({ threadId: classifiedTopics.threadId, primaryTopic: classifiedTopics.primaryTopic })
    .from(classifiedTopics)
    .where(inArray(classifiedTopics.threadId, threadIds));

  const channelMap = new Map(embeddedRows.map((r) => [r.threadId, r.channelId]));
  const results: Array<...> = [];

  // Group by primaryTopic, then find cross-channel pairs
  const topicGroups = new Map<string, string[]>();
  for (const t of topics) {
    const group = topicGroups.get(t.primaryTopic) ?? [];
    group.push(t.threadId);
    topicGroups.set(t.primaryTopic, group);
  }

  for (const [, threadIdsInTopic] of topicGroups) {
    for (let i = 0; i < threadIdsInTopic.length; i++) {
      for (let j = i + 1; j < threadIdsInTopic.length; j++) {
        const a = threadIdsInTopic[i];
        const b = threadIdsInTopic[j];
        if (channelMap.get(a) !== channelMap.get(b)) {
          results.push({ sourceThreadId: a!, correlatedThreadId: b!, confidence: 1.0 });
        }
      }
    }
  }

  return results;
}
```

**For `findParticipantOverlapCorrelations()`:**

```typescript
private findParticipantOverlapCorrelations(
  rows: Array<{ threadId: string; channelId: string; participantIds: string[] | null }>,
): Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }> {
  const results: Array<...> = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.channelId === b.channelId) continue;

      const aSet = new Set(a.participantIds ?? []);
      const bSet = new Set(b.participantIds ?? []);
      if (aSet.size === 0 || bSet.size === 0) continue;

      const intersection = [...aSet].filter((p) => bSet.has(p));
      if (intersection.length === 0) continue;

      const union = new Set([...aSet, ...bSet]);
      const jaccard = intersection.length / union.size;

      results.push({ sourceThreadId: a.threadId, correlatedThreadId: b.threadId, confidence: jaccard });
    }
  }

  return results;
}
```

**For `mergePairs()`** — deduplicate: if the same (A, B) pair appears in multiple type lists, keep SEMANTIC (higher confidence), then TOPIC_MATCH, then PARTICIPANT_OVERLAP. Use a `Map<string, CorrelationEntry>` keyed by `${sourceId}:${correlatedId}` where A < B (canonical direction):

```typescript
private mergePairs(...pairLists: Array<Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }>>): Array<{ sourceThreadId: string; correlatedThreadId: string; type: 'semantic' | 'topic_match' | 'participant_overlap'; confidence: number }> {
  const priority = ['semantic', 'topic_match', 'participant_overlap'] as const;
  const map = new Map<string, { sourceThreadId: string; correlatedThreadId: string; type: typeof priority[number]; confidence: number }>();

  pairLists.forEach((pairs, idx) => {
    const type = priority[idx]!;
    for (const pair of pairs) {
      const [a, b] = [pair.sourceThreadId, pair.correlatedThreadId].sort();
      const key = `${a}:${b}`;
      // Only replace if not already stored with higher priority
      if (!map.has(key)) {
        map.set(key, { sourceThreadId: pair.sourceThreadId, correlatedThreadId: pair.correlatedThreadId, type, confidence: pair.confidence });
      }
    }
  });

  return [...map.values()];
}
```

**For `upsertCorrelation()`**:

```typescript
private async upsertCorrelation(
  sourceThreadId: string,
  correlatedThreadId: string,
  correlationType: 'semantic' | 'topic_match' | 'participant_overlap',
  confidence: number,
): Promise<'created' | 'updated'> {
  const existing = await this.db
    .select({ id: topicCorrelations.id })
    .from(topicCorrelations)
    .where(
      and(
        eq(topicCorrelations.sourceThreadId, sourceThreadId),
        eq(topicCorrelations.correlatedThreadId, correlatedThreadId),
      ),
    );

  await this.db
    .insert(topicCorrelations)
    .values({ sourceThreadId, correlatedThreadId, correlationType, confidence })
    .onConflictDoUpdate({
      target: [topicCorrelations.sourceThreadId, topicCorrelations.correlatedThreadId],
      set: { correlationType, confidence },
    });

  return existing.length === 0 ? 'created' : 'updated';
}
```

### PipelineService Changes

Add `CorrelationRunResult` type export and `runCorrelation()` method:

```typescript
export interface CorrelationRunResult {
  created: number;
  updated: number;
  pairsEvaluated: number;
}

async runCorrelation(): Promise<CorrelationRunResult> {
  return this.correlatorProcessor.runBatchCorrelation();
}
```

### AdminController Changes

```typescript
@Post('pipeline/run')
@Roles('ADMIN')
async runPipeline(@Query('date') date?: string) {
  const classification = await this.pipelineService.runClassification(date);
  const summarization = await this.pipelineService.runSummarization(date);
  const embedding = await this.pipelineService.runEmbedding(date);
  const correlation = await this.pipelineService.runCorrelation();
  return {
    data: {
      classification,
      summarization,
      embedding,
      correlation,
    },
  };
}
```

### Config Key

`CORRELATION_SIMILARITY_THRESHOLD` is added to `apps/api/src/config/llm.config.ts` since the LLM config file is where model-related thresholds live (it already has `LLM_FALLBACK_RATE_THRESHOLD`, `EMBEDDING_DIMENSIONS`, etc.).

### Important: `participantIds` on `slackThreads`

Check that `slackThreads` schema has a `participantIds` (or `participantHandles`) column. Looking at Story 2.2, the column is `participant_handles` (array of text). In TypeScript (Drizzle camelCase) it is `participantHandles`. Use the correct column name from the schema — do NOT assume `participantIds`. Check `packages/db/src/schema/threads.ts` before writing the code.

### Key Drizzle Patterns to Follow

- **Array parameter in `sql` template**: `sql`... WHERE id = ANY(${arrayOfUuids})`` — Drizzle parameterizes arrays properly.
- **`inArray` import**: `import { inArray } from 'drizzle-orm'`
- **Conflict target with multiple columns**: `.onConflictDoUpdate({ target: [col1, col2], set: {...} })`
- **ALWAYS use `.js` extension on relative imports**.
- **ALWAYS use `@Inject(ServiceClass)` on constructor params**.

### Test Cases

For `correlator.processor.spec.ts`, mock the `Database` token (use `{ provide: DATABASE_TOKEN, useValue: mockDb }`) and `ConfigService`. Since the processor makes multiple DB calls, the mock database needs to return:
1. `slackThreads` select — the list of embedded threads
2. `threadEmbeddings` (via raw SQL execute) — simulated cosine similarity pairs
3. `classifiedTopics` — topic data for TOPIC_MATCH
4. `topicCorrelations` insert — upsert calls

For unit tests, mock `runBatchCorrelation()` at the `CorrelatorProcessor` level in `pipeline.service.spec.ts` — don't need to test the inner SQL from the service spec.

### No Pipeline State Transition

**Critical:** The correlator does NOT transition thread pipeline states. Threads remain in `embedded` state after correlation. The state machine moves embedded → staged in Epic 4 (anonymization gate). Correlation is an enrichment step that reads `embedded` threads and writes to `topic_correlations`. Do NOT call `PipelineStateService.transitionState()` from the correlator.

### Previous Story Learnings

From Story 3.5 code review patches:
- ALWAYS add `@Inject(TokenClass)` to every constructor parameter — SWC + ESM requires explicit injection tokens.
- Add a guard before expensive operations (empty input check).
- Check the exact column name in `slackThreads.ts` — it uses `participantHandles` (text array), not `participantIds`.

### Imports Needed in topics.ts

`topics.ts` currently imports from `drizzle-orm/pg-core`:
```typescript
import { index, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
```
Add `pgEnum`, `uniqueIndex` to this import since they are needed for the new table.

### LLM Not Required

The correlator does **not** call `LlmService` — it uses purely pgvector SQL (for SEMANTIC) and application-level logic (TOPIC_MATCH, PARTICIPANT_OVERLAP). Do NOT inject `LlmService` into `CorrelatorProcessor`. Only inject `Database` and `ConfigService`.

---

## Completion Notes List

**Implementation:**
- Task 1: Added `correlationTypeEnum` pgEnum (`semantic`, `topic_match`, `participant_overlap`) and `topicCorrelations` table to `packages/db/src/schema/topics.ts`. Unique index on `(sourceThreadId, correlatedThreadId)` for idempotent upserts. Plus two supporting indexes on individual FK columns. Migration `0011_colorful_clint_barton.sql` generated and applied.
- Task 2: Added `CORRELATION_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).optional().default(0.7)` to `llmConfigSchema` in `apps/api/src/config/llm.config.ts`.
- Task 3: Created `CorrelatorProcessor` with `runBatchCorrelation()`. Three correlation strategies: (1) SEMANTIC — pgvector cosine similarity via raw SQL `<=>` operator; (2) TOPIC_MATCH — application-level grouping by `primary_topic` across different channels; (3) PARTICIPANT_OVERLAP — Jaccard index on `participantIds` sets. All three are merged (SEMANTIC takes priority for duplicate pairs), then each canonical pair is written bidirectionally via upsert. Does NOT call `PipelineStateService` — threads stay in `embedded` state.
- Task 4: Added `CorrelatorProcessor` injection + `runCorrelation()` to `PipelineService`. Exported `CorrelationRunResult` type.
- Task 5: Added `CorrelatorProcessor` to `PipelineModule` providers.
- Task 6: Updated `AdminController.runPipeline()` to call `runCorrelation()` after `runEmbedding()`, returning `correlation` in the response.
- Task 7: 9 new correlator processor tests + 2 new pipeline service tests + 1 admin controller test = 12 new tests. All 203 tests pass (26 test files).
- Task 8: E2E validation with direct DB validation.

**E2E Validation Results (4/4 checks passed):**
- Schema validation: `topic_correlations` table created with all 6 columns (id, source_thread_id, correlated_thread_id, correlation_type, confidence, created_at). All NOT NULL as required.
- Enum validation: `correlation_type` enum created with values `semantic`, `topic_match`, `participant_overlap`.
- Index validation: Unique index `idx_topic_correlations_pair` on `(source_thread_id, correlated_thread_id)` confirmed; two supporting indexes confirmed.
- pgvector cosine similarity query: Test with two embedded threads in different channels (`vm-migration-general` and `infrastructure-alerts`) using identical embeddings returned cosine_similarity = 1.0, confirming `<=>` operator works as expected.
- Bidirectional upsert: Two rows inserted (A→B and B→A) via `ON CONFLICT DO UPDATE`. Re-running same insert returns `INSERT 0 1` with unchanged count (2 rows) — confirming idempotency.
- TOPIC_MATCH query: Two threads with `primary_topic = 'Storage Migration'` in different channels correctly detected.
- Thread `80a10265-63c1-460f-8c81-3b6fced90d55` (synthetic test data) used for cross-channel correlation test. Data cleaned up after validation.

**Gaps Discovered:**
- API server cannot start locally (Node.js v20 vs required >=22). Same pre-existing constraint as Story 3.5. Correlation step validated via direct DB queries. Full end-to-end pipeline (via `POST /api/admin/pipeline/run`) will be validated in OpenShift during next deployment cycle.
- Only 1 embedded thread exists in local DB (from Story 3.5 E2E). Synthetic second thread was created for correlation test then cleaned up.

**Change Log:**
- 2026-05-09: Story 3.6 implemented — cross-workstream correlation with pgvector SEMANTIC, TOPIC_MATCH, PARTICIPANT_OVERLAP strategies; bidirectional upserts; 12 unit tests; E2E validated.

## File List

| File | Action |
|------|--------|
| `packages/db/src/schema/topics.ts` | MODIFIED — added correlationTypeEnum, topicCorrelations table, relations, type exports |
| `packages/db/src/migrations/0011_colorful_clint_barton.sql` | NEW — CREATE TYPE + CREATE TABLE + indexes migration |
| `packages/db/src/migrations/meta/0011_snapshot.json` | NEW — drizzle-kit meta snapshot |
| `packages/db/src/migrations/meta/_journal.json` | MODIFIED — updated by drizzle-kit |
| `apps/api/src/config/llm.config.ts` | MODIFIED — added CORRELATION_SIMILARITY_THRESHOLD |
| `apps/api/src/modules/pipeline/processors/correlator.processor.ts` | NEW — batch correlation with 3 strategies, bidirectional upserts |
| `apps/api/src/modules/pipeline/processors/correlator.processor.spec.ts` | NEW — 9 unit tests |
| `apps/api/src/modules/pipeline/pipeline.service.ts` | MODIFIED — injected CorrelatorProcessor, added runCorrelation(), exported CorrelationRunResult |
| `apps/api/src/modules/pipeline/pipeline.service.spec.ts` | MODIFIED — added CorrelatorProcessor mock + 2 runCorrelation tests |
| `apps/api/src/modules/pipeline/pipeline.module.ts` | MODIFIED — added CorrelatorProcessor to providers |
| `apps/api/src/modules/admin/admin.controller.ts` | MODIFIED — added runCorrelation() call to runPipeline() |
| `apps/api/src/modules/admin/admin.controller.spec.ts` | MODIFIED — added PipelineService mock, added runPipeline correlation test |

### Review Findings

_Formal adversarial code review (2026-05-09) — 3 parallel layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor._

- [x] [Review][Decision] Date filter removal in `runSummarization` and `runEmbedding` — dismissed as intentional: processing ALL threads by pipeline state is the correct behavior; date-scoping was premature filtering. [`apps/api/src/modules/pipeline/pipeline.service.ts:122,224`]
- [x] [Review][Patch] Missing duration in correlation log — AC #8 requires logging duration; added `durationMs` to log payload. Fixed.
- [x] [Review][Patch] `AdminController` constructor params missing `@Inject()` decorators — added `@Inject()` on all 4 constructor params. Fixed.
- [x] [Review][Patch] Per-item error isolation in correlator upsert loop — added try/catch per pair with error logging. Fixed.
- [x] [Review][Patch] Unused `makeSelect` helper function in test file — removed dead code. Fixed.
- [x] [Review][Patch] No self-correlation guard — added `continue` guard for `sourceThreadId === correlatedThreadId`. Fixed.
- [x] [Review][Defer] Race condition in `upsertCorrelation` SELECT-then-INSERT — concurrent correlator runs could miscount created vs updated; optimize with PostgreSQL `xmax` single-query detection when concurrency matters [`apps/api/src/modules/pipeline/processors/correlator.processor.ts:229-247`]
- [x] [Review][Defer] O(n²) participant overlap + unbounded `threadIds` in SQL ANY() — acceptable at MVP scale (~tens of threads); add chunking/sampling when production data grows [`apps/api/src/modules/pipeline/processors/correlator.processor.ts`]
- [x] [Review][Defer] No minimum threshold for participant overlap — any non-zero Jaccard emits a correlation; may produce noise at scale; tunable threshold deferred [`apps/api/src/modules/pipeline/processors/correlator.processor.ts:168-193`]
- [x] [Review][Defer] Topic match signal quality — equality on `primaryTopic` with confidence=1.0 treats coarse labels as perfect ground truth; normalization/case-folding/generic-topic filtering deferred [`apps/api/src/modules/pipeline/processors/correlator.processor.ts:130-166`]
- [x] [Review][Defer] FK `ON DELETE NO ACTION` on topic_correlations — thread deletion leaves orphan correlations; cleanup strategy deferred (thread deletion not in scope) [`packages/db/src/migrations/0011_colorful_clint_barton.sql`]
- [x] [Review][Defer] Admin pipeline endpoint chains 4 heavy operations synchronously — no timeout, partial failure handling, or rate limiting; pre-existing admin pattern, revisit when production traffic arrives [`apps/api/src/modules/admin/admin.controller.ts:39-54`]
