# Story 3.4: Thread Summarization

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **system**,
I want to generate plain-language and technical summaries of thread discussions,
so that briefings can serve both technical and non-technical personas with appropriate depth.

## Acceptance Criteria

1. **Given** a thread is in state `classified`, **When** the summarizer processor runs, **Then** it generates two summaries: a technical summary (preserving jargon, cross-references) and a plain-language summary (translating jargon for non-technical readers).

2. **Given** a summarization result, **When** stored, **Then** summaries are persisted as two new JSONB columns on the `classified_topics` table: `technical_summary` and `plain_summary`.

3. **Given** each summary, **When** the LLM returns the result, **Then** each summary includes: `headline` (one sentence), `body` (2-3 paragraphs max), `key_decisions` (string array), `action_items` (string array).

4. **Given** the summarization prompt, **When** constructed, **Then** it identifies participant roles using the team roster data (matching `participantIds` from the thread against `slack_handle` and `slack_nicknames` in the `users` table).

5. **Given** a successful summarization, **When** the result is stored, **Then** the thread's `pipeline_state` transitions to `summarized` via `PipelineStateService.transitionState()`.

6. **Given** the LLM returns malformed JSON or Zod validation fails, **When** the summarizer handles the error, **Then** it logs at `error` level, retries the LLM call once, and on second failure marks the thread `FAILED` via `PipelineStateService.markFailed()`.

7. **Given** a batch of `classified` threads, **When** the pipeline orchestrator runs summarization, **Then** it processes each thread with per-item error isolation (one failure does not abort the batch), tracks the batch via `PipelineRunService`, and calls `LlmService.logBatchSummary()` on completion.

8. **Given** golden fixture tests, **When** the summarizer output is validated, **Then** the output shape matches `summarize.golden.json` using Vitest assertion against the Zod schema.

## Tasks / Subtasks

- [x] Task 1: Add summary columns to `classified_topics` and generate migration (AC: #2)
  - [x] 1.1 Update `packages/db/src/schema/topics.ts`: add `technicalSummary` (jsonb, nullable) and `plainSummary` (jsonb, nullable) columns to `classifiedTopics` table
  - [x] 1.2 Run `pnpm db:generate` from `packages/db` to produce migration SQL; commit migration + meta snapshot
  - [x] 1.3 Verify migration is `ALTER TABLE "classified_topics" ADD COLUMN "technical_summary" jsonb; ALTER TABLE "classified_topics" ADD COLUMN "plain_summary" jsonb;` — columns MUST be nullable (existing classified rows have no summaries yet)

- [x] Task 2: Create summarization Zod schemas in shared package (AC: #3, #8)
  - [x] 2.1 Update `packages/shared/src/schemas/pipeline.schema.ts`: add `summarySchema` (object with `headline: z.string().min(1)`, `body: z.string().min(1)`, `key_decisions: z.array(z.string())`, `action_items: z.array(z.string())`) and `summarizationResultSchema` (object with `technical_summary: summarySchema`, `plain_summary: summarySchema`)
  - [x] 2.2 Export `SummaryShape` and `SummarizationResult` types via `z.infer<>`

- [x] Task 3: Create summarization prompt template (AC: #1, #4)
  - [x] 3.1 Create `apps/api/src/modules/pipeline/llm/prompts/summarize.prompt.ts`
    - Export `buildSummarizationPrompt(threadContent: string, classificationContext: { primaryTopic: string; secondaryTopics: string[]; workstreamName: string | null }, participantRoster: Array<{ handle: string; role: string; displayName: string }>): string`
    - Prompt instructs LLM to return JSON matching `summarizationResultSchema` shape
    - Include classification topic/workstream context so summaries are coherent with classification
    - Include participant roster mapping (handle → name + role) so LLM can attribute statements to roles
    - Technical summary: preserve jargon, cross-references, architectural decisions, technical specifics
    - Plain summary: translate jargon for PM/Sales/Training personas, focus on impact and decisions
    - Both summaries: extract `key_decisions` (commitments made) and `action_items` (tasks assigned or implied)
    - Export `SUMMARIZE_PROMPT_VERSION = 'summarize-v1'` constant

- [x] Task 4: Create golden fixture for summarization (AC: #8)
  - [x] 4.1 Create `apps/api/src/modules/pipeline/llm/fixtures/summarize.golden.json` with 2-3 representative summarization outputs matching `summarizationResultSchema`
  - [x] 4.2 Create `apps/api/src/modules/pipeline/llm/fixtures/summarize.fixture.spec.ts` that validates each fixture entry against `summarizationResultSchema` using Zod `.safeParse()`

- [x] Task 5: Create `SummarizerProcessor` (AC: #1, #2, #3, #4, #5, #6)
  - [x] 5.1 Create `apps/api/src/modules/pipeline/processors/summarizer.processor.ts`
    - `@Injectable() export class SummarizerProcessor`
    - Constructor injects: `LlmService`, `PipelineStateService`, `Database` (via `@Inject(DATABASE_TOKEN)`)
    - `async summarizeThread(thread: SlackThread, classifiedTopic: ClassifiedTopic, participantRoster: Array<{ handle: string; role: string; displayName: string }>): Promise<ClassifiedTopic>`:
      - Build prompt via `buildSummarizationPrompt(JSON.stringify(thread.rawMessages), { primaryTopic: classifiedTopic.primaryTopic, secondaryTopics: classifiedTopic.secondaryTopics, workstreamName }, participantRoster)`
      - Call `this.llmService.complete(prompt, { promptVersion: SUMMARIZE_PROMPT_VERSION, temperature: 0.3 })`
      - Parse `result.content` as JSON
      - Validate parsed JSON with `summarizationResultSchema.safeParse()`
      - On Zod validation failure or JSON parse error: log `error`, retry LLM once, then throw (caller handles via markFailed)
      - Update `classified_topics` row: set `technicalSummary` and `plainSummary` columns
      - Call `PipelineStateService.transitionState(threadId, 'summarized', processingDate)`
      - Return the updated `ClassifiedTopic` row

- [x] Task 6: Add `runSummarization()` to `PipelineService` (AC: #7)
  - [x] 6.1 Update `apps/api/src/modules/pipeline/pipeline.service.ts`:
    - Inject `SummarizerProcessor` via constructor
    - `async runSummarization(processingDate?: string): Promise<{ processed: number; failed: number; pendingRetry: number }>`:
      - Default `processingDate` to UTC today
      - Fetch classified threads: `PipelineStateService.getThreadsByState('classified', processingDate)`
      - If no threads → log info, return zeros
      - Start batch run: `PipelineRunService.startRun()`
      - Reset LLM counters: `LlmService.resetBatchCounters()`
      - Fetch team roster once: `SELECT id, display_name, slack_handle, role FROM users` (query once, reuse for batch)
      - For each thread (per-item try/catch):
        - Fetch the thread's `classified_topics` row (needed for classification context)
        - Build participant roster by matching thread's `participantIds` against users
        - Try: `SummarizerProcessor.summarizeThread(thread, classifiedTopic, participantRoster)` → increment processed
        - Catch `LlmPendingRetryError`: `PipelineStateService.markPendingRetry()` → increment pendingRetry
        - Catch other errors: `PipelineStateService.markFailed()` → increment failed
      - Log batch summary: `LlmService.logBatchSummary()`
      - Complete run: `PipelineRunService.completeRun(runId, stats)`
      - Return stats

- [x] Task 7: Update `PipelineModule` (AC: all)
  - [x] 7.1 Update `apps/api/src/modules/pipeline/pipeline.module.ts`:
    - Add `SummarizerProcessor` to `providers`
    - Ensure `PipelineService` is already registered (from Story 3.3)

- [x] Task 8: Write unit tests (AC: #1–#8)
  - [x] 8.1 `summarizer.processor.spec.ts` — successful summarization: both summaries stored in `classified_topics`, state transitioned to `summarized`
  - [x] 8.2 `summarizer.processor.spec.ts` — LLM returns malformed JSON: logs error, retries once, throws on second failure
  - [x] 8.3 `summarizer.processor.spec.ts` — Zod validation failure: logs error, retries once, throws on second failure
  - [x] 8.4 `summarizer.processor.spec.ts` — prompt includes participant roles from roster matching
  - [x] 8.5 `summarizer.processor.spec.ts` — prompt includes classification context (primary_topic, workstream)
  - [x] 8.6 `summarizer.processor.spec.ts` — thread with no matching roster entries: prompt still includes participant handles without role info
  - [x] 8.7 `pipeline.service.spec.ts` — `runSummarization` batch processes classified threads with per-item error isolation
  - [x] 8.8 `pipeline.service.spec.ts` — `runSummarization` empty batch (no classified threads) returns zeros and does not start a run
  - [x] 8.9 `pipeline.service.spec.ts` — `runSummarization` one thread fails, others succeed — batch completes with correct counts
  - [x] 8.10 `pipeline.service.spec.ts` — `runSummarization` calls `resetBatchCounters` before and `logBatchSummary` after
  - [x] 8.11 `pipeline.service.spec.ts` — `runSummarization` fetches roster once (not per-thread)

- [x] Task 9: E2E validation with imported test data (AC: all)
  - [x] 9.1 Import representative Slack conversations via text-paste import (`POST /api/admin/channels/:id/import` or CLI `pnpm --filter @slack-thread-manager/db import-text`)
  - [x] 9.2 Verify imported threads are in `ingested` state; run classification pipeline first (`PipelineService.runClassification()`) to get threads to `classified` state
  - [x] 9.3 Trigger summarization pipeline (`PipelineService.runSummarization()`) against classified data
  - [x] 9.4 Verify `classified_topics` rows now have `technical_summary` and `plain_summary` populated with valid structured data
  - [x] 9.5 Verify thread states transitioned to `summarized`
  - [x] 9.6 Verify both summaries contain meaningful content: headlines are concise, bodies translate jargon (plain) vs. preserve it (technical), key_decisions and action_items are extracted where present
  - [x] 9.7 Document validation results in Completion Notes including: threads summarized, success/failure counts, sample summary quality assessment, any gaps discovered

## Dev Notes

### Dependency on Story 3.3

Story 3.4 **REQUIRES** Story 3.3 (Thread Classification) to be complete. Story 3.3 creates:
- `classified_topics` table and schema (`packages/db/src/schema/topics.ts`)
- `classificationResultSchema` in `packages/shared/src/schemas/pipeline.schema.ts`
- `ClassifierProcessor` in `processors/classifier.processor.ts`
- `PipelineService` with `runClassification()` in `pipeline.service.ts`
- Classification prompt and golden fixtures
- `CLASSIFICATION_CONFIDENCE_THRESHOLD` env var in `llm.config.ts`

All of these are prerequisites. Do NOT recreate them.

### Module Placement & Directory Structure

All new files follow the architecture's explicit directory structure. The `processors/` subdirectory is an explicit architecture exception to the flat module rule (same pattern as Story 3.1's `providers/` and Story 3.3's `processors/`):

```
apps/api/src/modules/pipeline/
├── pipeline.module.ts              ← MODIFY: add SummarizerProcessor
├── pipeline.service.ts             ← MODIFY: add runSummarization() method
├── pipeline.service.spec.ts        ← MODIFY: add summarization tests
├── pipeline-state.service.ts       ← unchanged (from 3.2)
├── pipeline-run.service.ts         ← unchanged (from 3.2)
├── pipeline.errors.ts              ← unchanged (from 3.2)
├── processors/
│   ├── classifier.processor.ts     ← unchanged (from 3.3)
│   ├── classifier.processor.spec.ts ← unchanged (from 3.3)
│   ├── summarizer.processor.ts     ← NEW
│   └── summarizer.processor.spec.ts ← NEW
└── llm/
    ├── prompts/
    │   ├── classify.prompt.ts      ← unchanged (from 3.3)
    │   └── summarize.prompt.ts     ← NEW
    ├── fixtures/
    │   ├── classify.golden.json    ← unchanged (from 3.3)
    │   ├── classify.fixture.spec.ts ← unchanged (from 3.3)
    │   ├── summarize.golden.json   ← NEW
    │   └── summarize.fixture.spec.ts ← NEW
    ├── llm.module.ts
    ├── llm.service.ts
    ├── llm.service.spec.ts
    ├── llm-provider.interface.ts
    └── providers/
        ├── cpu-model.provider.ts
        └── gemini.provider.ts
```

```
packages/db/src/schema/
├── topics.ts                       ← MODIFY: add technicalSummary + plainSummary columns
├── index.ts                        ← unchanged
├── threads.ts                      ← unchanged (read-only — query thread content)
├── users.ts                        ← unchanged (read-only — query roster for participant roles)
├── pipeline-state.ts               ← unchanged
├── workstreams.ts                  ← unchanged
└── channels.ts                     ← unchanged
```

```
packages/shared/src/schemas/
├── pipeline.schema.ts              ← MODIFY: add summarySchema + summarizationResultSchema
├── index.ts                        ← unchanged (pipeline.schema already exported)
└── ... (existing schemas unchanged)
```

### Summary Column Schema

Add two nullable JSONB columns to the existing `classifiedTopics` table in `packages/db/src/schema/topics.ts`:

```typescript
technicalSummary: jsonb('technical_summary'),
plainSummary: jsonb('plain_summary'),
```

Columns MUST be nullable (no `.notNull()`) because existing `classified_topics` rows from Story 3.3 will not have summaries. The Story 3.3 dev notes explicitly stated: "Story 3.4 will add `technicalSummary` and `plainSummary` columns to this table via migration — do NOT add them now."

After adding the columns, run `pnpm db:generate` from `packages/db`. The generated SQL should be:
```sql
ALTER TABLE "classified_topics" ADD COLUMN "technical_summary" jsonb;
ALTER TABLE "classified_topics" ADD COLUMN "plain_summary" jsonb;
```

### Summarization Zod Schemas

Add to `packages/shared/src/schemas/pipeline.schema.ts` (alongside existing `classificationResultSchema`):

```typescript
export const summarySchema = z.object({
  headline: z.string().min(1),
  body: z.string().min(1),
  key_decisions: z.array(z.string()),
  action_items: z.array(z.string()),
});

export const summarizationResultSchema = z.object({
  technical_summary: summarySchema,
  plain_summary: summarySchema,
});

export type SummaryShape = z.infer<typeof summarySchema>;
export type SummarizationResult = z.infer<typeof summarizationResultSchema>;
```

### Summarization Prompt Design

The prompt must produce valid JSON matching `summarizationResultSchema`. Key design decisions:

```typescript
// prompts/summarize.prompt.ts
export const SUMMARIZE_PROMPT_VERSION = 'summarize-v1';

export function buildSummarizationPrompt(
  threadContent: string,
  classificationContext: {
    primaryTopic: string;
    secondaryTopics: string[];
    workstreamName: string | null;
  },
  participantRoster: Array<{
    handle: string;
    role: string;
    displayName: string;
  }>,
): string {
  // Prompt structure:
  // 1. System instruction: "You are a thread summarizer..."
  // 2. Classification context: topic, workstream (so summary is coherent with classification)
  // 3. Participant roster mapping: handle → name + role (for role attribution)
  // 4. Thread content (raw messages as JSON string)
  // 5. Output format: JSON matching summarizationResultSchema
  // 6. Technical summary guidance: preserve jargon, code refs, architectural terms
  // 7. Plain summary guidance: translate for non-technical readers, focus on impact/decisions
  // 8. Both summaries: extract key_decisions (commitments) and action_items (assigned/implied tasks)
  // 9. Constraints: headline ≤ 1 sentence, body ≤ 3 paragraphs, "Respond with ONLY valid JSON"
}
```

The `threadContent` parameter receives `JSON.stringify(thread.rawMessages)` — the raw Slack messages stored as JSONB in `slack_threads.raw_messages`.

### Participant Roster Matching

The thread has `participantIds` (array of Slack handle strings). The `users` table has `slackHandle` (text) and `slackNicknames` (text array).

Build the roster match at the `PipelineService` level (once per batch), then filter per-thread:

```typescript
// In PipelineService.runSummarization():
const allUsers = await this.db.select({
  id: users.id,
  displayName: users.displayName,
  slackHandle: users.slackHandle,
  slackNicknames: users.slackNicknames,
  role: users.role,
}).from(users);

// Per-thread: match participantIds against roster
function buildParticipantRoster(
  participantIds: string[],
  allUsers: UserRow[],
): Array<{ handle: string; role: string; displayName: string }> {
  return participantIds.map((handle) => {
    const user = allUsers.find(
      (u) =>
        u.slackHandle === handle ||
        u.slackNicknames?.some((n) => n.toLowerCase() === handle.toLowerCase()),
    );
    return user
      ? { handle, role: user.role, displayName: user.displayName }
      : { handle, role: 'unknown', displayName: handle };
  });
}
```

Unmatched handles still appear in the roster with `role: 'unknown'` — the LLM can still reference them by handle.

### Fetching Classification Context per Thread

The summarizer needs the thread's `classified_topics` row to include topic/workstream context in the prompt. Query once per thread:

```typescript
// In PipelineService.runSummarization(), per-thread:
const [classifiedTopic] = await this.db
  .select()
  .from(classifiedTopics)
  .where(eq(classifiedTopics.threadId, thread.id));

if (!classifiedTopic) {
  this.logger.warn('No classification found for thread', { threadId: thread.id });
  failed++;
  continue; // skip — thread shouldn't be in 'classified' state without a row
}
```

To resolve the workstream name, if `classifiedTopic.workstreamId` is set, look it up from a workstream map (query workstreams table once at batch start, same as Story 3.3):

```typescript
const workstreamRows = await this.db.select({ id: workstreams.id, name: workstreams.name }).from(workstreams);
const workstreamMap = new Map(workstreamRows.map((r) => [r.id, r.name]));
```

### LLM Call Pattern (from Story 3.1/3.3)

```typescript
const result = await this.llmService.complete(prompt, {
  promptVersion: SUMMARIZE_PROMPT_VERSION,
  temperature: 0.3,  // slightly higher than classification (0.2) for more natural summaries
});

let parsed: unknown;
try {
  parsed = JSON.parse(result.content);
} catch {
  // Retry once on malformed JSON
}

const validated = summarizationResultSchema.safeParse(parsed);
if (!validated.success) {
  // Log Zod errors at error level, retry once, then throw
}
```

### Transaction Pattern

Update `classified_topics` and transition state in separate transactions (same pattern as Story 3.3):

```typescript
// Step 1: Update classified_topics with summaries
const [updated] = await this.db
  .update(classifiedTopics)
  .set({
    technicalSummary: validated.data.technical_summary,
    plainSummary: validated.data.plain_summary,
  })
  .where(eq(classifiedTopics.threadId, thread.id))
  .returning();

// Step 2: Transition state (PipelineStateService has its own transaction)
await this.pipelineStateService.transitionState(thread.id, 'summarized', processingDate);
```

If the update succeeds but state transition fails, the thread stays at `classified` and will be reprocessed — the next run detects existing summaries. This is acceptable (same rationale as Story 3.3's classification pattern).

### Why Two Summaries Matter (Briefing Context)

Epic 5 briefing shapes use different summaries per role:
- **Executive Scan / Filtered Brief** (PM, Sales, Training) → `plain_summary` — jargon-free, decision-focused
- **Intelligence Report** (Architect, Consultant) → `technical_summary` — preserves jargon, cross-references

Both are generated now so Epic 5 can select the appropriate one without re-running LLM calls.

### Testing Patterns

Mock the database following established Story 3.3 patterns:

```typescript
const mockDb = {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([mockClassifiedTopic]),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([updatedClassifiedTopic]),
      }),
    }),
  }),
  query: {
    slackThreads: { findMany: vi.fn(), findFirst: vi.fn() },
  },
};
```

Mock `LlmService.complete()` to return pre-built summarization JSON:

```typescript
const mockLlmService = {
  complete: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      technical_summary: {
        headline: 'Storage migration from NFS to Ceph requires VM compatibility layer',
        body: 'The team discussed migrating persistent storage from NFS v4.1...',
        key_decisions: ['Adopt Ceph RBD for block storage', 'Keep NFS for legacy VMs'],
        action_items: ['Ravi to benchmark Ceph throughput by Friday'],
      },
      plain_summary: {
        headline: 'Team is changing how files are stored to improve performance',
        body: 'The infrastructure team is moving file storage to a newer system...',
        key_decisions: ['New storage system approved', 'Old system kept for older machines'],
        action_items: ['Performance testing due by end of week'],
      },
    }),
    modelVersion: 'phi3:mini',
    latencyMs: 800,
    success: true,
    usedFallback: false,
  }),
  resetBatchCounters: vi.fn(),
  logBatchSummary: vi.fn(),
};
```

Golden fixture tests validate that the Zod schema accepts the fixture data — not that the LLM produces exact output. Use `summarizationResultSchema.safeParse()` and assert `success === true`.

### Anti-Patterns to Avoid

- **DO NOT** use `console.log` — use `new Logger(ClassName.name)`
- **DO NOT** forget `.js` extension on relative imports (ESM/NodeNext): `import { SummarizerProcessor } from './processors/summarizer.processor.js'`
- **DO NOT** create `embedder.processor.ts`, `correlator.processor.ts`, or `orphan-detector.processor.ts` — those are Stories 3.5–3.7
- **DO NOT** add `technicalSummary`/`plainSummary` as NOT NULL — they must be nullable for backward compatibility with existing classified rows
- **DO NOT** create a separate `thread_summaries` table — the architecture stores summaries ON the `classified_topics` table
- **DO NOT** flatten the `processors/` subdirectory — the architecture explicitly requires it
- **DO NOT** query the users table per-thread — query once at batch start and filter per-thread in memory
- **DO NOT** query `classified_topics` at batch start — query per-thread since each thread needs its own classification context row
- **DO NOT** add a confidence threshold for summarization — there is no confidence-based filtering for summaries (unlike classification). Quality is enforced via Zod schema validation only
- **DO NOT** use `jest.fn()` — use `vi.fn()` (Vitest)
- **DO NOT** import directly from another module's internals — use `@slack-thread-manager/db` and `@slack-thread-manager/shared` for cross-package imports
- **DO NOT** silently drop LLM errors — always log at `error` level and either retry or mark failed
- **DO NOT** pass thread content as plain text — use `JSON.stringify(thread.rawMessages)` to preserve message structure

### Files to Create / Modify

| File | Type | Change |
|------|------|--------|
| `packages/db/src/schema/topics.ts` | MODIFY | Add `technicalSummary` (jsonb, nullable) and `plainSummary` (jsonb, nullable) columns |
| `packages/db/src/migrations/XXXX_*.sql` | NEW | Generated migration for ALTER TABLE ADD COLUMN |
| `packages/db/src/migrations/meta/_journal.json` | MODIFY | Auto-updated by drizzle-kit |
| `packages/shared/src/schemas/pipeline.schema.ts` | MODIFY | Add `summarySchema`, `summarizationResultSchema`, type exports |
| `apps/api/src/modules/pipeline/llm/prompts/summarize.prompt.ts` | NEW | Prompt template + version constant |
| `apps/api/src/modules/pipeline/llm/fixtures/summarize.golden.json` | NEW | Golden summarization fixtures |
| `apps/api/src/modules/pipeline/llm/fixtures/summarize.fixture.spec.ts` | NEW | Fixture validation tests |
| `apps/api/src/modules/pipeline/processors/summarizer.processor.ts` | NEW | Summarization logic |
| `apps/api/src/modules/pipeline/processors/summarizer.processor.spec.ts` | NEW | 6 unit tests |
| `apps/api/src/modules/pipeline/pipeline.service.ts` | MODIFY | Add `runSummarization()` method + inject `SummarizerProcessor` |
| `apps/api/src/modules/pipeline/pipeline.service.spec.ts` | MODIFY | Add 5 summarization unit tests |
| `apps/api/src/modules/pipeline/pipeline.module.ts` | MODIFY | Register `SummarizerProcessor` |

### Previous Story Intelligence

**From Story 3.1 (LLM Abstraction):**
- `LlmService.complete()` returns `LlmCompleteResult` with `{ content, modelVersion, latencyMs, success, usedFallback, promptVersion }`
- `LlmPendingRetryError` thrown when all providers fail — import from `./llm/llm-provider.interface.js`
- `resetBatchCounters()` + `logBatchSummary()` for batch tracking
- Module chain: `AppModule → PipelineModule → LlmModule → { CpuModelProvider, GeminiProvider, LlmService }`

**From Story 3.2 (Pipeline State Machine):**
- `PipelineStateService` with `transitionState(threadId, targetState, processingDate?)`, `markFailed(threadId, stage, error, context?, tx?)`, `markPendingRetry(threadId, stage, error)`, `getThreadsByState(state, processingDate?)`
- `PipelineRunService` with `startRun()`, `completeRun(runId, stats)`, `getLatestRuns(limit?)`
- FSM: `classified → summarized` is valid; `classified → pending_retry` is valid; `classified → failed` is valid
- `processingDate` prevents double-processing same day
- 142 tests passing after Story 3.2

**From Story 3.3 (Thread Classification) — prerequisite, must be complete:**
- `ClassifierProcessor` in `processors/classifier.processor.ts` — follow the same injectable pattern
- `PipelineService` with `runClassification()` — add `runSummarization()` following the exact same orchestration pattern
- `classifiedTopics` table schema in `packages/db/src/schema/topics.ts` — add columns to this existing table
- `classificationResultSchema` in `packages/shared/src/schemas/pipeline.schema.ts` — add summarization schemas alongside it
- `buildClassificationPrompt` in `prompts/classify.prompt.ts` — follow the same prompt builder signature pattern
- `CLASSIFY_PROMPT_VERSION` constant — follow the same naming pattern for `SUMMARIZE_PROMPT_VERSION`
- `classify.golden.json` + `classify.fixture.spec.ts` — follow the same fixture validation pattern
- Retry-once logic for JSON parse and Zod validation failures — reuse exact same pattern
- Per-item error isolation in batch processing — reuse exact same pattern

**Git patterns from recent commits:**
- Conventional commits: `feat(3.4): <description>` format
- Branch: `feature/epic-3-knowledge-pipeline`
- All story files, spec files, and migration files committed together

### Project Structure Notes

- All paths align with the architecture document's defined project structure
- `processors/` subdirectory is explicitly defined in architecture (same as `providers/`)
- `prompts/` and `fixtures/` subdirectories under `llm/` are explicitly defined in architecture
- `topics.ts` in `packages/db/src/schema/` is the home for summary columns per architecture: "Classification + summarization: One transaction per thread" and "classified_topics, topic_correlations" in the schema listing
- Summary Zod schema goes in existing `pipeline.schema.ts` — same file as classification schema
- Spec files colocated with source files per project convention

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4 — Thread Summarization]
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries (lines 851–884)]
- [Source: _bmad-output/planning-artifacts/architecture.md#LLM Failure Modes & Operational Safeguards (lines 913–951)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Pipeline State Machine (lines 969–987)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Transactional Boundaries — Classification + summarization]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure — processors/ (lines 627–630)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping — FR5-9 → modules/pipeline/]
- [Source: _bmad-output/planning-artifacts/prd.md#FR7 — Plain-language summaries of technical discussions]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#BriefingCard anatomy — workstream label, topic headline]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2-5.4 — briefing shapes use technical vs plain summaries per role]
- [Source: _bmad-output/implementation-artifacts/3-3-thread-classification.md — dev notes, patterns, anti-patterns]
- [Source: _bmad-output/project-context.md — Critical Implementation Rules, Drizzle Patterns, Testing Patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Cursor Agent)

### Debug Log References

- File revert incident: several modified files (`pipeline.service.ts`, `pipeline.module.ts`, `pipeline.service.spec.ts`, `summarizer.processor.ts`) reverted mid-session due to file sync issue. Re-created all files and re-verified with full test suite (180/180 pass).
- Gemini code fence issue: Gemini wraps JSON responses in ````json...```` markdown code fences even when prompted with "Respond with ONLY valid JSON." Added `stripCodeFences()` helper to SummarizerProcessor to handle this robustly. This is a pre-existing issue also affecting ClassifierProcessor (Story 3.3 scope).

### Completion Notes List

**Implementation:**
- Task 1: Added `technicalSummary` (jsonb, nullable) and `plainSummary` (jsonb, nullable) columns to `classifiedTopics` table. Migration `0009_cheerful_lake.sql` generated and applied.
- Task 2: Created `summarySchema` and `summarizationResultSchema` Zod schemas with `SummaryShape` and `SummarizationResult` type exports in shared package.
- Task 3: Created `buildSummarizationPrompt()` with classification context, participant roster, and dual-summary instructions. Exports `SUMMARIZE_PROMPT_VERSION = 'summarize-v1'`.
- Task 4: Created 3 golden fixtures covering scenarios with/without action items. Fixture spec validates all against `summarizationResultSchema`.
- Task 5: Created `SummarizerProcessor` with LLM retry-once logic, Zod validation, DB update, and state transition. Added `stripCodeFences()` for Gemini compatibility.
- Task 6: Added `runSummarization()` to `PipelineService` with per-item error isolation, batch roster fetch (once per batch), per-thread classification context fetch, workstream name resolution, and full batch lifecycle.
- Task 7: Registered `SummarizerProcessor` in `PipelineModule`.
- Task 8: 6 summarizer processor tests + 5 pipeline service summarization tests = 11 new tests. All 180 tests pass.
- Task 9: E2E validation with real data via text-paste import and Gemini API.

**E2E Validation Results:**
- Threads summarized: 1 (against imported multi-participant conversation data)
- Success/failure: 7/7 checks passed
- Schema validation: `technical_summary` and `plain_summary` columns correctly stored as JSONB, both nullable
- LLM JSON parsing: Works after code fence stripping (Gemini wraps JSON in markdown blocks)
- Zod validation: Full `summarizationResultSchema` validation passed
- State transition: Thread correctly moved from `classified` → `summarized`
- Summary quality: Technical headline preserved jargon ("Q3 Storage Tier Pricing Revision Initiated Due to Ceph Licensing Costs"), plain headline simplified ("Pricing for Storage Options to be Updated for Next Quarter"). Key decisions and action items correctly extracted with participant attribution.

**Gaps Discovered:**
- Gemini markdown code fence wrapping: Gemini returns JSON wrapped in ````json...```` fences despite explicit "Respond with ONLY valid JSON" instruction. SummarizerProcessor handles this with `stripCodeFences()`. ClassifierProcessor (Story 3.3) does NOT have this fix and fails with Gemini. Recommend adding the same fix to ClassifierProcessor in a follow-up.
- NestJS DI with tsx: When bootstrapping a standalone NestJS app context via `tsx` (outside Vitest), dependency injection fails for some providers due to transpilation differences with `reflect-metadata`. Not a production issue — only affects standalone E2E scripts. Workaround: use direct DB/API calls for E2E validation instead of NestJS DI bootstrap.

**Change Log:**
- 2026-05-08: Story 3.4 implemented — thread summarization pipeline with dual summaries, roster matching, golden fixtures, 11 unit tests, and E2E validation.

### File List

| File | Action |
|------|--------|
| `packages/db/src/schema/topics.ts` | MODIFIED — added `technicalSummary` and `plainSummary` jsonb nullable columns |
| `packages/db/src/migrations/0009_cheerful_lake.sql` | NEW — ALTER TABLE migration |
| `packages/db/src/migrations/meta/0009_snapshot.json` | NEW — drizzle-kit meta snapshot |
| `packages/db/src/migrations/meta/_journal.json` | MODIFIED — updated by drizzle-kit |
| `packages/shared/src/schemas/pipeline.schema.ts` | MODIFIED — added `summarySchema`, `summarizationResultSchema`, type exports |
| `apps/api/src/modules/pipeline/llm/prompts/summarize.prompt.ts` | NEW — prompt template + version constant |
| `apps/api/src/modules/pipeline/llm/fixtures/summarize.golden.json` | NEW — 3 golden summarization fixtures |
| `apps/api/src/modules/pipeline/llm/fixtures/summarize.fixture.spec.ts` | NEW — 5 fixture validation tests |
| `apps/api/src/modules/pipeline/processors/summarizer.processor.ts` | NEW — summarization logic with LLM retry |
| `apps/api/src/modules/pipeline/processors/summarizer.processor.spec.ts` | NEW — 6 unit tests |
| `apps/api/src/modules/pipeline/pipeline.service.ts` | MODIFIED — added `runSummarization()`, `SummarizerProcessor` injection, roster matching |
| `apps/api/src/modules/pipeline/pipeline.service.spec.ts` | MODIFIED — added 5 summarization unit tests |
| `apps/api/src/modules/pipeline/pipeline.module.ts` | MODIFIED — registered `SummarizerProcessor` |
