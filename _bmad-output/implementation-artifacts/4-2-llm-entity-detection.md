# Story 4.2: LLM Entity Detection

Status: review

## Story

As a **system**,
I want LLM-assisted entity detection to identify customer references that the blocklist might miss,
so that novel or unanticipated customer identifiers are caught before human review.

## Acceptance Criteria

1. **Given** content has passed through the blocklist filter, **When** the LLM entity detector runs, **Then** it sends the content to the LLM with a detection prompt (from `prompts/detect-entities.prompt.ts`) asking it to identify: customer company names, personnel names, private/intranet URLs, account identifiers, infrastructure IPs and hostnames.

2. **Given** the LLM returns a response, **Then** detected entities are returned with: `entity_text`, `entity_type`, `confidence`, `suggested_replacement`.

3. **Given** entities are detected by LLM, **Then** entities that are NOT already in the blocklist are flagged as "LLM entity detection" (source: `'LLM'`), distinct from blocklist matches (source: `'BLOCKLIST'`).

4. **Given** the LLM detection runs, **Then** it uses the same fallback chain as other pipeline processors (CPU model → Gemini Pro via `LlmService.complete()`).

5. **Given** entity detection is implemented, **Then** golden fixture tests validate detection output against `detect-entities.golden.json`.

6. **Given** false positives may occur, **Then** they are acceptable — human review in the staging queue (Story 4.3) resolves them.

7. **Given** content has passed through the blocklist filter with text-paste-imported data, **When** the LLM entity detector runs, **Then** entities are detected identically regardless of whether threads were ingested via Slack API or text-paste import.

## Tasks / Subtasks

- [x] Task 1: Update Zod schemas for LLM entity detection (AC: #2, #3)
  - [x] 1.1 In `packages/shared/src/schemas/anonymization.schema.ts`: add `llmEntityMatchSchema` with fields: `term` (string), `replacement` (string), `category` (blocklistCategorySchema), `source` (z.literal('LLM')), `confidence` (number 0–1)
  - [x] 1.2 Create `anonymizationFlagSchema = z.discriminatedUnion('source', [blocklistMatchSchema, llmEntityMatchSchema])`
  - [x] 1.3 Update `anonymizationResultSchema.flags` from `z.array(blocklistMatchSchema)` → `z.array(anonymizationFlagSchema)`
  - [x] 1.4 Export new types: `LlmEntityMatch`, `AnonymizationFlag`
  - [x] 1.5 Create `llmEntityDetectionResponseSchema` — Zod schema for raw LLM JSON output: `z.array(z.object({ entity_text, entity_type, confidence, suggested_replacement }))`

- [x] Task 2: Create `detect-entities.prompt.ts` (AC: #1)
  - [x] 2.1 Create `apps/api/src/modules/pipeline/llm/prompts/detect-entities.prompt.ts`
  - [x] 2.2 Export `DETECT_ENTITIES_PROMPT_VERSION = 'detect-entities-v1'`
  - [x] 2.3 Export `buildEntityDetectionPrompt(contentText: string, knownBlocklistTerms: string[]): string` — instructs LLM to identify entity categories (company_name, person_name, url, account_id, infrastructure) and skip already-handled blocklist terms
  - [x] 2.4 Prompt response format: JSON array of `{ entity_text, entity_type, confidence, suggested_replacement }`; empty array if nothing detected

- [x] Task 3: Create golden fixture (AC: #5)
  - [x] 3.1 Create `apps/api/src/modules/pipeline/llm/fixtures/detect-entities.golden.json` with 5 sample outputs covering all 5 entity categories

- [x] Task 4: Create `LlmEntityDetectorProcessor` (AC: #1, #2, #3, #4, #6)
  - [x] 4.1 Create `apps/api/src/modules/pipeline/anonymization/llm-entity-detector.processor.ts`
  - [x] 4.2 Implement `runDetection(blocklistResults: AnonymizationResult[]): Promise<LlmEntityDetectionResult>` that:
    - Returns early with zeros if `blocklistResults` is empty
    - Loads all blocklist entries from DB for server-side dedup
    - For each result: extracts text from `originalContent`, builds prompt via `buildEntityDetectionPrompt`, calls `LlmService.complete()`, parses + validates response with Zod, deduplicates against blocklist terms (case-insensitive), maps to `LlmEntityMatch` flags, merges with existing blocklist flags
    - Per-thread error isolation: detection failure on one thread does not block others; on failure, passes through original result without LLM flags
    - Logs completion with `threadsProcessed`, `entitiesDetected`, `durationMs`
  - [x] 4.3 Create `apps/api/src/modules/pipeline/anonymization/llm-entity-detector.processor.spec.ts`

- [x] Task 5: Add `runLlmEntityDetection()` to `PipelineService` (AC: #4)
  - [x] 5.1 Update `apps/api/src/modules/pipeline/pipeline.service.ts`: inject `LlmEntityDetectorProcessor`, add `runLlmEntityDetection(blocklistResults: AnonymizationResult[]): Promise<LlmEntityDetectionResult>` method, export `LlmEntityDetectionResult` type

- [x] Task 6: Update `PipelineModule` (AC: all)
  - [x] 6.1 Update `apps/api/src/modules/pipeline/pipeline.module.ts`: add `LlmEntityDetectorProcessor` to `providers`

- [x] Task 7: Update `AdminController` to call `runLlmEntityDetection` (AC: #1)
  - [x] 7.1 Update `apps/api/src/modules/admin/admin.controller.ts`: pass `blocklistFilter.results` to `runLlmEntityDetection()`, include `entityDetection` in the response body

- [x] Task 8: Write unit tests (AC: #1–#7)
  - [x] 8.1 LLM detects entities in original content → returns flags with source: 'LLM' (AC: #1, #2, #3)
  - [x] 8.2 Each entity has correct fields: term, replacement, category, source, confidence (AC: #2)
  - [x] 8.3 Entity types: company_name, person_name, url, account_id, infrastructure (AC: #1)
  - [x] 8.4 Deduplication: entity matching a blocklist term (case-insensitive) is excluded (AC: #3)
  - [x] 8.5 LLM flags merged with existing blocklist flags in results (AC: #3)
  - [x] 8.6 Uses LlmService.complete() with correct promptVersion and fallback chain (AC: #4)
  - [x] 8.7 LLM returns empty array → zero entities, results passed through with original flags
  - [x] 8.8 LLM returns malformed JSON → retry once, then return original result without LLM flags
  - [x] 8.9 LLM output validated against Zod schema (llmEntityDetectionResponseSchema)
  - [x] 8.10 Per-thread error isolation: one thread fails, others still processed
  - [x] 8.11 Zero blocklistResults input → returns `{ threadsProcessed: 0, entitiesDetected: 0, results: [] }`
  - [x] 8.12 Golden fixture: validate detect-entities.golden.json against llmEntityDetectionResponseSchema (AC: #5)
  - [x] 8.13 `pipeline.service.spec.ts` (additive) — `runLlmEntityDetection()` delegates to processor and returns result
  - [x] 8.14 `admin.controller.spec.ts` (additive) — pipeline/run response includes `entityDetection` field

- [x] Task 9: E2E validation with imported test data (AC: #7, all)
  - [x] 9.1 Start the local API server (`pnpm dev` — now works with Node.js v24 + tsx loader)
  - [ ] 9.2 Import representative Slack chat via text-paste import (`POST /api/admin/channels/:id/import`)
  - [ ] 9.3 Run full pipeline (`POST /api/admin/pipeline/run`) — exercises classify → summarize → embed → blocklist filter → LLM entity detection
  - [ ] 9.4 Verify LLM entity detection returns flags for entities not in blocklist
  - [x] 9.5 Document what was validated and any gaps found

## Dev Notes

### Module Placement & Directory Structure

All files follow the established `pipeline/anonymization/` subdirectory pattern from Story 4.1. Prompt and fixture files go in existing `pipeline/llm/prompts/` and `pipeline/llm/fixtures/` directories.

```
apps/api/src/modules/pipeline/
├── pipeline.module.ts                              ← MODIFY: add LlmEntityDetectorProcessor to providers
├── pipeline.service.ts                             ← MODIFY: inject LlmEntityDetectorProcessor, add runLlmEntityDetection()
├── pipeline.service.spec.ts                        ← MODIFY: add runLlmEntityDetection() tests
├── anonymization/
│   ├── blocklist-filter.processor.ts               ← unchanged
│   ├── blocklist-filter.processor.spec.ts          ← unchanged
│   ├── llm-entity-detector.processor.ts            ← NEW
│   └── llm-entity-detector.processor.spec.ts       ← NEW
├── llm/
│   ├── prompts/
│   │   ├── classify.prompt.ts                      ← unchanged
│   │   ├── summarize.prompt.ts                     ← unchanged
│   │   └── detect-entities.prompt.ts               ← NEW
│   └── fixtures/
│       ├── classify.golden.json                    ← unchanged
│       ├── summarize.golden.json                   ← unchanged
│       └── detect-entities.golden.json             ← NEW

apps/api/src/modules/admin/
└── admin.controller.ts                             ← MODIFY: add entityDetection to pipeline/run response
└── admin.controller.spec.ts                        ← MODIFY: add entityDetection response test

packages/shared/src/schemas/
├── anonymization.schema.ts                         ← MODIFY: add LLM entity schemas, discriminated union
├── index.ts                                        ← unchanged (already exports anonymization)
```

### Data Flow: Blocklist Filter → LLM Entity Detection

```
BlocklistFilterProcessor.runFilter()
  → BlocklistFilterResult { results: AnonymizationResult[] }
      ↓ (results passed as input)
LlmEntityDetectorProcessor.runDetection(results)
  → LlmEntityDetectionResult { results: AnonymizationResult[] with merged flags }
```

The LLM entity detector receives `AnonymizationResult[]` from the blocklist filter. For each result:
1. Extracts text from `originalContent` (NOT `anonymizedContent`) — the LLM sees the unmodified text to catch entities the blocklist missed
2. Sends to LLM with entity detection prompt + known blocklist terms
3. Deduplicates detected entities against blocklist terms (server-side, case-insensitive)
4. Maps valid entities to `LlmEntityMatch` flags with `source: 'LLM'`
5. Merges LLM flags into the result's existing `flags` array (alongside blocklist flags)

**The LLM entity detector does NOT apply replacements.** It only DETECTS and FLAGS. The `anonymizedContent` is preserved as-is from the blocklist filter. LLM-detected entity replacements are suggestions for admin review in Story 4.3's staging queue.

### Zod Schema Changes (packages/shared)

Current `anonymization.schema.ts` has `blocklistMatchSchema` with `source: z.literal('BLOCKLIST')`. This story adds:

```typescript
export const llmEntityMatchSchema = z.object({
  term: z.string(),
  replacement: z.string(),
  category: blocklistCategorySchema,
  source: z.literal('LLM'),
  confidence: z.number().min(0).max(1),
});

export const anonymizationFlagSchema = z.discriminatedUnion('source', [
  blocklistMatchSchema,
  llmEntityMatchSchema,
]);

export type LlmEntityMatch = z.infer<typeof llmEntityMatchSchema>;
export type AnonymizationFlag = z.infer<typeof anonymizationFlagSchema>;
```

Update `anonymizationResultSchema.flags`:
```typescript
flags: z.array(anonymizationFlagSchema),  // was: z.array(blocklistMatchSchema)
```

Add a raw LLM response validation schema:
```typescript
export const llmEntityDetectionResponseSchema = z.array(
  z.object({
    entity_text: z.string().min(1),
    entity_type: blocklistCategorySchema,
    confidence: z.number().min(0).max(1),
    suggested_replacement: z.string().min(1),
  }),
);
export type LlmEntityDetectionResponse = z.infer<typeof llmEntityDetectionResponseSchema>;
```

**Backward compatibility note:** The blocklist filter processor creates `flags: BlocklistMatch[]`. Since `BlocklistMatch` is a member of the `AnonymizationFlag` discriminated union, this is assignable to `AnonymizationFlag[]` without modifying the blocklist filter code.

### Prompt Design (`detect-entities.prompt.ts`)

```typescript
export const DETECT_ENTITIES_PROMPT_VERSION = 'detect-entities-v1';

export function buildEntityDetectionPrompt(
  contentText: string,
  knownBlocklistTerms: string[],
): string {
  // Prompt structure:
  // 1. Role: NDA compliance entity detection specialist
  // 2. Content to analyze: concatenated originalContent text fields
  // 3. Already-handled terms: blocklist terms to skip
  // 4. Entity categories: company_name, person_name, url, account_id, infrastructure
  // 5. Output format: JSON array of { entity_text, entity_type, confidence, suggested_replacement }
  // 6. Rules: skip known blocklist terms, skip internal team names, skip public URLs
  //    and open-source project names, empty array if none detected
}
```

**Content extraction helper:** Concatenate all text fields from both summaries into a single string for the prompt:
```typescript
function extractTextContent(content: { technicalSummary: SummaryShape; plainSummary: SummaryShape }): string {
  const parts: string[] = [];
  for (const summary of [content.technicalSummary, content.plainSummary]) {
    parts.push(summary.headline, summary.body);
    parts.push(...summary.key_decisions, ...summary.action_items);
  }
  return parts.join('\n');
}
```

### LLM Entity Detector Processor

```typescript
@Injectable()
export class LlmEntityDetectorProcessor {
  private readonly logger = new Logger(LlmEntityDetectorProcessor.name);

  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async runDetection(blocklistResults: AnonymizationResult[]): Promise<LlmEntityDetectionResult> {
    // 1. Return early if empty
    // 2. Load blocklist terms from DB for dedup
    // 3. Reset/log LLM batch counters
    // 4. For each result:
    //    a. Extract text from originalContent
    //    b. Build prompt with known terms
    //    c. Call LlmService.complete() with retry (callLlmWithRetry pattern from ClassifierProcessor)
    //    d. Parse JSON, validate with llmEntityDetectionResponseSchema
    //    e. Dedup: filter out entities where entity_text matches blocklist terms (case-insensitive)
    //    f. Map to LlmEntityMatch flags
    //    g. Merge with existing flags
    //    h. Per-thread try/catch: on error, pass through original result
    // 5. Log completion with stats
  }
}
```

### Result Data Structure

```typescript
export interface LlmEntityDetectionResult {
  threadsProcessed: number;
  entitiesDetected: number;
  results: AnonymizationResult[];
}
```

### AdminController Update

Add `entityDetection` after `blocklistFilter`, passing results as input:

```typescript
@Post('pipeline/run')
@Roles('ADMIN')
async runPipeline(@Query('date') date?: string) {
  const classification = await this.pipelineService.runClassification(date);
  const summarization = await this.pipelineService.runSummarization(date);
  const embedding = await this.pipelineService.runEmbedding(date);
  const correlation = await this.pipelineService.runCorrelation();
  const blocklistFilter = await this.pipelineService.runBlocklistFilter();
  const entityDetection = await this.pipelineService.runLlmEntityDetection(blocklistFilter.results);
  return {
    data: {
      classification,
      summarization,
      embedding,
      correlation,
      blocklistFilter,
      entityDetection,
    },
  };
}
```

### Pipeline State: NO Transition

Like the blocklist filter, correlator, and orphaned action detector, the LLM entity detector does NOT transition thread pipeline states. Threads remain in `embedded` state. The `embedded → staged` transition is handled by Story 4.3 (Staging Queue & Pipeline Gate).

Do NOT call `PipelineStateService.transitionState()`.

### LLM Call Pattern: Follow ClassifierProcessor

The LLM call + parse + validate pattern MUST follow the established `ClassifierProcessor.callLlmWithRetry()` pattern:

1. Call `this.llmService.complete(prompt, { promptVersion, temperature: 0.2 })`
2. Strip markdown fences from response: `trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)`
3. `JSON.parse()` the cleaned content
4. Validate with `llmEntityDetectionResponseSchema.safeParse(parsed)`
5. If parse/validate fails on attempt 1, retry once
6. If both attempts fail, log error and treat as zero entities (do NOT throw — per-thread error isolation)

The `LlmService.complete()` already handles the CPU → Gemini fallback chain internally. The processor does NOT need to implement fallback logic.

### Deduplication Logic

After getting LLM entities, filter against blocklist:

```typescript
const knownTermsLower = new Set(blocklistTerms.map(t => t.toLowerCase()));
const newEntities = llmEntities.filter(
  e => !knownTermsLower.has(e.entity_text.toLowerCase())
);
```

This prevents double-flagging: if "Acme Corp" is in the blocklist AND the LLM detects it, it won't appear twice.

### Golden Fixture Format (`detect-entities.golden.json`)

```json
[
  {
    "entity_text": "Globex Industries",
    "entity_type": "company_name",
    "confidence": 0.92,
    "suggested_replacement": "[COMPANY]"
  },
  {
    "entity_text": "Bob Johnson",
    "entity_type": "person_name",
    "confidence": 0.85,
    "suggested_replacement": "[PERSON]"
  },
  {
    "entity_text": "https://portal.globex.net/admin",
    "entity_type": "url",
    "confidence": 0.95,
    "suggested_replacement": "[URL_REDACTED]"
  }
]
```

### Critical Implementation Details

**`@Inject()` on ALL constructor params** — Team agreement A6 from Epic 3 retro. The processor uses: `@Inject(LlmService) private readonly llmService: LlmService`, `@Inject(DATABASE_TOKEN) private readonly db: Database`.

**Per-thread error isolation** — Wrap each thread in a for-loop in its own try/catch. One thread's LLM call failure must not abort processing of other threads. On failure, push the original result (with blocklist flags only) into the enhanced results.

**LlmService batch counters** — Call `this.llmService.resetBatchCounters()` before the loop and `this.llmService.logBatchSummary()` after. This tracks the fallback rate for entity detection calls.

**Markdown fence stripping** — LLMs (especially Gemini) wrap JSON in code fences. Reuse the same `stripMarkdownFences()` pattern from `ClassifierProcessor`.

**ALWAYS use `.js` extension on relative imports** — ESM requirement.

**NestJS Logger** — use `private readonly logger = new Logger(LlmEntityDetectorProcessor.name)`. NEVER `console.log`.

### Key Drizzle Patterns to Follow

- **Load blocklist entries:** `await this.db.select().from(anonymizationBlocklist)` — load once at start, not per-thread.
- **Import `anonymizationBlocklist` from `@slack-thread-manager/db`.**
- **DB columns are camelCase in TypeScript** but snake_case in DB.

### Test Mocking Strategy

For `llm-entity-detector.processor.spec.ts`:
- Mock `LlmService` — `complete: vi.fn().mockResolvedValue({ content: JSON.stringify([...]), modelVersion: 'phi3:mini', latencyMs: 500, success: true })`
- Mock `Database` — `db.select().from()` returns blocklist entries
- Use `AnonymizationResult[]` input with known blocklist flags

For `pipeline.service.spec.ts` (additive):
- Mock `LlmEntityDetectorProcessor` — `runDetection: vi.fn().mockResolvedValue({ threadsProcessed: 2, entitiesDetected: 1, results: [] })`

For `admin.controller.spec.ts` (additive):
- Add `runLlmEntityDetection` to `mockPipelineService`

### Previous Story Intelligence

**From Story 4.1 (Anonymization Blocklist & Filter):**

- The blocklist filter creates `AnonymizationResult[]` with `originalContent`, `anonymizedContent`, and `flags: BlocklistMatch[]`
- Content surfaces scanned: `classifiedTopics` JSONB columns `technicalSummary` and `plainSummary`, shape: `{ headline, body, key_decisions[], action_items[] }`
- `structuredClone()` used for deep copy of original content
- Regex escaping needed for special characters in terms
- Per-item error isolation pattern established
- `@Inject(DATABASE_TOKEN)` convention followed
- `BlocklistFilterResult` type exported from processor file
- Admin controller calls pipeline steps sequentially, response includes all step results
- E2E validation was limited to unit tests at the time due to Node.js version blocker — **now resolved** (see below)

**Orphaned action detector files removed from working tree.** The Story 3.7 merge regression means orphaned action detection files don't exist on the current branch — no collision concern.

**CRITICAL: The blocklist filter does NOT persist results to DB.** Results are returned in-memory. The LLM entity detector receives them in-memory from the pipeline service call chain. Persistence happens in Story 4.3 (staging queue).

**Node.js v24 Upgrade (resolved blocker):** The Node.js v20 vs v22 local blocker from Epic 3 is fully resolved. The project now targets Node.js >=24.0.0 with `tsx` loader for ESM workspace resolution (`NODE_OPTIONS="--import tsx"` in the API dev script). The local API server starts successfully, enabling full E2E validation locally for this story.

### Git Intelligence

Latest commits on current branch:
- `a8e6506` feat(4.1): add anonymization blocklist schema and filter processor
- `bd06b29` feat(deploy): add pipeline smoke test script and Postman collection
- `90eb787` docs: add Epic 3 retrospective and mark epic done

**Uncommitted changes present:** The Node.js v24 upgrade (`.node-version`, `package.json`, `apps/api/package.json`, Dockerfiles, architecture docs, retro, project-context) is staged but not yet committed. These changes were made by a parallel agent. The dev agent should commit the Node.js upgrade separately first (e.g., `chore: upgrade to Node.js v24 with tsx loader`) before starting Story 4.2 implementation, to keep commits clean.

**Current branch:** Should be `feature/epic-4-anonymization` (created by Story 4.1). Verify with `git branch --show-current` before starting.

### Git Governance

Per project-context.md:
- Branch: `feature/epic-4-anonymization` (same as Story 4.1)
- **Pre-requisite commit:** The Node.js v24 upgrade changes are uncommitted. Commit them first: `chore: upgrade to Node.js v24 with tsx loader for ESM dev` (includes `.node-version`, `package.json`, `apps/api/package.json`, `apps/web/package.json`, `deploy/Dockerfile.*`, `pnpm-lock.yaml`, updated docs)
- Story commit format: `feat(4.2): add LLM entity detection processor and prompt`
- Commit includes: source files, spec files, story file, sprint status

### Project Context Reference

All implementation must follow rules in `_bmad-output/project-context.md`:
- **Runtime:** Node.js >=24.0.0 (upgraded from v22; local dev uses `tsx` loader via `NODE_OPTIONS="--import tsx"`)
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

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.2 Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — Pipeline module structure: `anonymization/llm-entity.filter.ts`, `llm/prompts/detect-entities.prompt.ts`, `llm/fixtures/detect-entities.golden.json`]
- [Source: _bmad-output/planning-artifacts/architecture.md — Cross-cutting: "LLM abstraction: Classification, summarization, entity detection, search, and enrichment all depend on LLM processing"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Logging levels: "debug — detailed processing (thread classified, entity detected)"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Transactional boundaries: "Anonymization staging: One transaction — Write to staging_queue + update thread state"]
- [Source: _bmad-output/planning-artifacts/prd.md — FR23 (LLM-assisted entity detection), FR27 (entity replacement), FR28 (mandatory staging gate)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR6: StagingReviewItem flag source label "Blocklist match / LLM entity detection"]
- [Source: _bmad-output/project-context.md — Critical Implementation Rules: imports, NestJS patterns, Drizzle patterns, testing, async patterns]
- [Source: _bmad-output/implementation-artifacts/4-1-anonymization-blocklist-and-filter.md — Previous story: processor pattern, data structures, pipeline integration, test strategy]
- [Source: apps/api/src/modules/pipeline/processors/classifier.processor.ts — LLM call + JSON parse + Zod validate + retry pattern (callLlmWithRetry)]
- [Source: apps/api/src/modules/pipeline/llm/llm.service.ts — LlmService.complete() with CPU→Gemini fallback, batch counters, resetBatchCounters(), logBatchSummary()]
- [Source: apps/api/src/modules/pipeline/llm/llm-provider.interface.ts — LlmCompletionOptions, LlmCompletionResult, LlmPendingRetryError]
- [Source: packages/shared/src/schemas/anonymization.schema.ts — Current schema: blocklistMatchSchema, anonymizationResultSchema, BlocklistMatch type]
- [Source: packages/shared/src/schemas/pipeline.schema.ts — SummaryShape type with headline, body, key_decisions, action_items]

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4 (Cursor Agent)

### Debug Log References

- Blocklist filter spec required type narrowing after discriminated union change (added `as BlocklistMatch` cast on flag access for `.positions`)
- LLM entity detector test 8.10 initially failed: `callLlmWithRetry` uses 2 internal retry attempts, so mocking a single rejection was insufficient — needed 2 rejections to trigger per-thread error isolation

### Completion Notes List

- ✅ All 235 unit tests pass across 28 test files (zero regressions)
- ✅ TypeScript compilation: TSC 0 issues, SWC compiled 80 files
- ✅ Shared package builds cleanly with new schemas
- ✅ Backward compatibility: blocklist filter processor and tests unaffected (12/12 pass)
- ✅ 14 new LLM entity detector tests + 2 additive pipeline service tests + 1 additive admin controller test = 17 new tests
- ✅ Golden fixture validates against `llmEntityDetectionResponseSchema` with all 5 entity categories

#### E2E Validation

**Validated:**
- API server starts successfully (`pnpm dev`): SWC compiles 80 files, TSC finds 0 type issues
- All 235 unit tests pass including comprehensive entity detection coverage
- Golden fixture validates against Zod schema

**Not validated (infrastructure not available in dev environment):**
- 9.2: Import via text-paste import — requires running PostgreSQL + Keycloak
- 9.3: Full pipeline run — requires PostgreSQL + local LLM service (Ollama)
- 9.4: Live entity detection verification — requires all services running

**Gaps:**
- Full E2E validation with real data deferred to local dev environment with PostgreSQL, Keycloak, and Ollama running (or OpenShift deployment)
- The prompt effectiveness (entity detection quality, false positive rate) can only be evaluated with real data against a live LLM

### File List

**New files:**
- `apps/api/src/modules/pipeline/anonymization/llm-entity-detector.processor.ts`
- `apps/api/src/modules/pipeline/anonymization/llm-entity-detector.processor.spec.ts`
- `apps/api/src/modules/pipeline/llm/prompts/detect-entities.prompt.ts`
- `apps/api/src/modules/pipeline/llm/fixtures/detect-entities.golden.json`

**Modified files:**
- `packages/shared/src/schemas/anonymization.schema.ts` — added `llmEntityMatchSchema`, `anonymizationFlagSchema`, `llmEntityDetectionResponseSchema`, updated `anonymizationResultSchema.flags`
- `apps/api/src/modules/pipeline/pipeline.service.ts` — injected `LlmEntityDetectorProcessor`, added `runLlmEntityDetection()` method
- `apps/api/src/modules/pipeline/pipeline.module.ts` — added `LlmEntityDetectorProcessor` to providers
- `apps/api/src/modules/admin/admin.controller.ts` — added `entityDetection` to pipeline/run response
- `apps/api/src/modules/pipeline/pipeline.service.spec.ts` — added `runLlmEntityDetection` tests
- `apps/api/src/modules/admin/admin.controller.spec.ts` — added `entityDetection` response test
- `apps/api/src/modules/pipeline/anonymization/blocklist-filter.processor.spec.ts` — type narrowing fix for discriminated union
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated
- `_bmad-output/implementation-artifacts/4-2-llm-entity-detection.md` — story file updated

### Change Log

- **2026-05-10**: Story 4.2 implementation complete — LLM entity detection processor, prompt, golden fixture, schema updates, pipeline integration, and 17 new unit tests. All 235 tests pass.
