# Story 6.2: Semantic Search with pgvector

**Story ID:** 6.2
**Story Key:** `6-2-semantic-search-with-pgvector`
**Epic:** 6 — Search & Discovery
**Status:** ready-for-dev

---

## User Story

As a **developer**,
I want semantic search using pgvector embeddings alongside keyword search,
So that users can find threads by meaning even when exact keywords don't match.

---

## Acceptance Criteria (BDD)

1. **Given** thread embeddings exist in `thread_embeddings` (from Story 3.5), **When** a user submits a search query, **Then** the query text is embedded using `LlmService.embed()` — the same `nomic-embed-text` (768-dim) CPU model used for thread embeddings.

2. **Given** a query embedding is produced, **When** cosine similarity search runs against `thread_embeddings`, **Then** results are ordered by cosine distance ascending (lowest distance = highest similarity) and the HNSW index (`idx_thread_embeddings_hnsw`) is used by the query planner.

3. **Given** semantic search runs, **When** results are returned, **Then** every result is restricted to threads with `slack_threads.pipeline_state = 'approved'` in the query WHERE clause (defense in depth — FR28).

4. **Given** a configurable similarity threshold (default `0.7`, sourced from `CORRELATION_SIMILARITY_THRESHOLD` env var or a new `SEMANTIC_SEARCH_SIMILARITY_THRESHOLD` if decoupled), **When** results are ranked, **Then** only matches above the threshold are returned (cosine distance < `1 - threshold`).

5. **Given** `VectorSearchService` is implemented, **When** `search(query: string, options?)` is called, **Then** it returns results ranked by cosine similarity containing at minimum: `threadId`, `similarity` (float, 0–1), and `classifiedTopicId` for downstream joins in Story 6.3.

6. **Given** both FTS results (from Story 6.1) and semantic results exist, **When** `HybridSearchService.search()` (or equivalent) is called, **Then** results from both sources are merged using a combined ranking strategy with configurable weights (default: FTS 0.4, semantic 0.6) via Reciprocal Rank Fusion (RRF) or weighted score normalization — document chosen strategy in Completion Notes.

7. **Given** a query that matches via both FTS and semantic search, **When** results are merged, **Then** the same thread appears only once with a combined score, and the `matchType` field indicates `BOTH`.

8. **Given** an LLM embedding failure (CPU model unavailable), **When** `VectorSearchService.search()` is called, **Then** it throws or returns an empty result set with a logged warning — it does NOT fall back to Gemini (by design, per `[P5]` in deferred-work.md; `LlmService.embed()` is primary-only).

---

## Tasks / Subtasks

- [ ] **Task 1 — `VectorSearchService` (AC: 1, 2, 3, 4, 5)**
  - [ ] Create `apps/api/src/modules/search/vector-search.service.ts` (flat in `modules/search/`, per architecture).
  - [ ] Inject `LlmService` (from `PipelineModule`) and `DATABASE_TOKEN`.
  - [ ] Implement `search(query: string, options?: { limit?: number; threshold?: number })`:
    1. Call `this.llmService.embed(query)` to get 768-dim query vector.
    2. Run pgvector cosine distance query using raw `cosineDistance` operator — **use `<=>` directly, NOT `1 - cosineDistance`** — to ensure HNSW index is hit.
    3. Filter `JOIN slack_threads ON ... WHERE pipeline_state = 'approved'`.
    4. Filter `WHERE embedding <=> $queryVector < $distanceThreshold` (distance threshold = `1 - similarityThreshold`).
    5. `ORDER BY embedding <=> $queryVector ASC` (ascending = most similar first).
    6. `LIMIT` (default 20).
    7. Return: `{ threadId, similarity: 1 - distance, classifiedTopicId }[]`.
  - [ ] Read threshold from `ConfigService` (`SEMANTIC_SEARCH_SIMILARITY_THRESHOLD` falling back to `CORRELATION_SIMILARITY_THRESHOLD`, default `0.7`).

- [ ] **Task 2 — Hybrid merge service (AC: 6, 7)**
  - [ ] Create `apps/api/src/modules/search/hybrid-search.service.ts` (or add a `mergeResults` method to an existing search orchestrator).
  - [ ] Implement Reciprocal Rank Fusion (RRF) or weighted-score merge:
    - Normalize FTS `ts_rank_cd` scores to 0–1 range (divide by max score in batch).
    - Normalize semantic similarity scores (already 0–1).
    - Combined score = `ftsWeight * normalizedFts + semanticWeight * normalizedSemantic`.
    - Default weights from config: `SEARCH_FTS_WEIGHT=0.4`, `SEARCH_SEMANTIC_WEIGHT=0.6`.
  - [ ] Deduplicate by `threadId` — if a thread appears in both FTS and semantic results, merge into a single result with `matchType: 'BOTH'` and the higher combined score.
  - [ ] Tag each result with `matchType: 'KEYWORD' | 'SEMANTIC' | 'BOTH'`.

- [ ] **Task 3 — Wire into SearchModule (AC: all)**
  - [ ] Register `VectorSearchService` and `HybridSearchService` as providers in `search.module.ts` (created by Story 6.1).
  - [ ] Import `PipelineModule` (or use `forwardRef`) in `SearchModule` to access `LlmService`.
  - [ ] Export `HybridSearchService` (and `VectorSearchService`, `FtsService`) for Story 6.3.

- [ ] **Task 4 — Config schema update**
  - [ ] Add `SEMANTIC_SEARCH_SIMILARITY_THRESHOLD` (optional, default `0.7`) to `llmConfigSchema` in `apps/api/src/config/llm.config.ts`.
  - [ ] Add `SEARCH_FTS_WEIGHT` (optional, default `0.4`) and `SEARCH_SEMANTIC_WEIGHT` (optional, default `0.6`) to config schema.
  - [ ] Update `.env.example` with new vars and comments.

- [ ] **Task 5 — Verify HNSW index ([B2] deferred work)**
  - [ ] Confirm HNSW index `idx_thread_embeddings_hnsw` exists in Drizzle schema (`packages/db/src/schema/embeddings.ts` lines 18–21) and migration `0010_skinny_raider.sql` line 11.
  - [ ] Verify HNSW index parameters are adequate for ~100–1000 embeddings (default `m=16`, `ef_construction=64` are fine at this scale).
  - [ ] Run `EXPLAIN ANALYZE` on a sample vector query in E2E validation to confirm index scan (not sequential).
  - [ ] Mark `[B2]` as **RESOLVED** in `deferred-work.md` with confirmation details.

- [ ] **Task 6 — Tests**
  - [ ] `vector-search.service.spec.ts`: mock `LlmService.embed()` and DB; verify:
    - Query embedding is called with the user's search text.
    - SQL fragment uses `<=>` operator with parameterized vector (no string interpolation).
    - Results filtered to `approved` state only.
    - Threshold filtering applied correctly.
    - Empty embedding result handled gracefully.
  - [ ] `hybrid-search.service.spec.ts`: verify:
    - FTS-only results tagged `KEYWORD`.
    - Semantic-only results tagged `SEMANTIC`.
    - Overlapping results deduplicated and tagged `BOTH`.
    - Configurable weights affect ranking order.
    - Edge cases: empty FTS results, empty semantic results, both empty.

- [ ] **Task 7 — E2E validation (mandatory)**
  - [ ] Prerequisite: Story 6.1 must be implemented (FTS + staging integration).
  - [ ] Text-paste import → pipeline → staging → approve at least 2 threads on different topics.
  - [ ] Call `VectorSearchService.search('topic keywords from thread 1')` — verify thread 1 appears with high similarity.
  - [ ] Call `HybridSearchService.search()` — verify merged results contain both FTS and semantic matches.
  - [ ] Run `EXPLAIN ANALYZE` on the vector query to confirm HNSW index scan.
  - [ ] Document in `### Completion Notes` with `E2E validation` entry; gaps → `deferred-work.md`.

---

## Dev Notes

### Story Scope and Intent

- **No public HTTP search API in this story** — that is Story 6.3. This story delivers the `VectorSearchService` and `HybridSearchService` callable from tests and the future `SearchController`.
- **No search UI work** — Story 6.4 implements the frontend.
- **Depends on Story 6.1** being implemented first. Story 6.1 creates `SearchModule`, `FtsService`, and the staging→FTS integration. If 6.1 is not yet landed, implement 6.1 first.

### Architecture Compliance

- pgvector semantic search per architecture Decision #8 (`PostgreSQL FTS + pgvector`).
- Module boundary: `modules/search/` for all search services (architecture structure map: `search.module.ts`, `fts.service.ts`, `vector-search.service.ts`).
- Responses: services are internal — no `{ data }` envelope until HTTP layer (6.3).
- RBAC: not applicable to service-only story; 6.3 will add `JwtAuthGuard`.

### Critical: pgvector Index Usage with Drizzle ORM

**The standard Drizzle `cosineDistance` guide has a known bug.** Using `1 - cosineDistance(...)` in WHERE/ORDER prevents PostgreSQL from using the HNSW index. Instead:

```typescript
// CORRECT: HNSW index IS used
const distance = sql<number>`${cosineDistance(threadEmbeddings.embedding, queryVector)}`;
db.select(...)
  .where(lt(distance, distanceThreshold))  // lt = less than
  .orderBy(asc(distance))                  // ascending = most similar first
  .limit(20);

// WRONG: HNSW index NOT used (transforms the expression)
const similarity = sql<number>`1 - (${cosineDistance(threadEmbeddings.embedding, queryVector)})`;
db.select(...)
  .where(gt(similarity, 0.7))
  .orderBy(desc(similarity));
```

The service should use the CORRECT pattern with `cosineDistance` + `lt` + `asc`, then convert to similarity (1 - distance) in the returned results for human-readable scores.

Alternatively, use raw SQL with the `<=>` operator directly:

```typescript
sql`te.embedding <=> ${queryVector}::vector`
```

### Embedding Model Alignment

- Thread embeddings use `nomic-embed-text` (768 dimensions) via `CpuModelProvider.embed()`.
- Query embeddings MUST use the same model — `LlmService.embed()` delegates to the same provider.
- **Do NOT call Gemini's `text-embedding-004`** — different model produces incompatible vector spaces. `LlmService.embed()` is primary-only by design (`[P5]` in deferred-work.md).

### Embeddings Are Pre-Anonymization

- Current `EmbedderProcessor.buildEmbeddingInput()` builds from `classified_topics.technicalSummary` and `plainSummary` — these are **pre-anonymization** content.
- This means semantic search may match on terms that were subsequently anonymized in the FTS index.
- Story 6.1 flagged this as a known limitation. **Do NOT expand scope to re-embed from anonymized content.** If FR28 interpretation becomes strict for semantic search, log as a gap in Completion Notes and add to `deferred-work.md`.

### Import & Pattern Guardrails

- **ESM:** relative imports end with `.js` in `apps/api` and `packages/`.
- **DB injection:** `@Inject(DATABASE_TOKEN) private readonly db: Database` — never instantiate Drizzle directly.
- **Logger:** `private readonly logger = new Logger(ClassName.name)` — never `console.log`.
- **Parameterized queries:** never interpolate user query text into raw SQL strings. Use Drizzle `sql` template tag with parameterized values.
- **Flat module structure:** all files for search go directly in `apps/api/src/modules/search/`. No `services/` subdirectory.

### Existing Patterns to Follow

- **Correlator cosine similarity:** `apps/api/src/modules/pipeline/processors/correlator.processor.ts` (lines 112–130) shows the existing `<=>` operator usage with raw SQL. Follow the same parameterized SQL pattern.
- **Embedder processor:** `apps/api/src/modules/pipeline/processors/embedder.processor.ts` shows `LlmService.embed()` call pattern and dimension validation.
- **FtsService (6.1):** follow whatever patterns 6.1 established for the search service (result shape, error handling, logging).

### Project Structure Notes

- All search files in `apps/api/src/modules/search/` (flat).
- Spec files colocated: `vector-search.service.spec.ts` next to `vector-search.service.ts`.
- No new schema changes required — `thread_embeddings` table and HNSW index already exist.
- No new migrations expected unless config table changes are needed.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 6, Story 6.2]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — Search module, PostgreSQL FTS + pgvector decision]
- [Source: `_bmad-output/planning-artifacts/prd.md` — FR15–FR17, FR28, NFR2]
- [Source: `_bmad-output/project-context.md` — Drizzle, NestJS, ESM imports, testing patterns]
- [Source: `_bmad-output/implementation-artifacts/6-1-full-text-search-infrastructure.md` — FtsService, SearchModule, staging integration]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — [B2] HNSW verification, [P5] embed() no fallback]
- [Source: `packages/db/src/schema/embeddings.ts` — thread_embeddings table with HNSW index]
- [Source: `packages/db/src/schema/topics.ts` — classified_topics (joined for topic data)]
- [Source: `apps/api/src/modules/pipeline/llm/llm.service.ts` — `embed()` method (primary-only)]
- [Source: `apps/api/src/modules/pipeline/processors/embedder.processor.ts` — `buildEmbeddingInput()` pattern]
- [Source: `apps/api/src/modules/pipeline/processors/correlator.processor.ts` — `<=>` cosine distance SQL pattern]
- [Source: `apps/api/src/config/llm.config.ts` — EMBEDDING_DIMENSIONS, CORRELATION_SIMILARITY_THRESHOLD]
- [Source: `packages/shared/src/schemas/pipeline.schema.ts` — summarySchema shape]
- [Source: Drizzle ORM docs — cosineDistance known issue with HNSW index usage (GitHub issues #436, #4398)]

---

## File Structure

### NEW (expected)

| File | Purpose |
|------|---------|
| `apps/api/src/modules/search/vector-search.service.ts` | pgvector cosine similarity search |
| `apps/api/src/modules/search/vector-search.service.spec.ts` | Unit tests |
| `apps/api/src/modules/search/hybrid-search.service.ts` | FTS + semantic merge with RRF/weighted scoring |
| `apps/api/src/modules/search/hybrid-search.service.spec.ts` | Unit tests |

### UPDATE (current state → this story)

| File | Current state | This story |
|------|---------------|------------|
| `apps/api/src/modules/search/search.module.ts` | Created by Story 6.1 with FtsService | Add VectorSearchService, HybridSearchService providers; import PipelineModule for LlmService |
| `apps/api/src/config/llm.config.ts` | Has CORRELATION_SIMILARITY_THRESHOLD | Add SEMANTIC_SEARCH_SIMILARITY_THRESHOLD, SEARCH_FTS_WEIGHT, SEARCH_SEMANTIC_WEIGHT |
| `.env.example` | No search weight vars | Add SEMANTIC_SEARCH_SIMILARITY_THRESHOLD, SEARCH_FTS_WEIGHT, SEARCH_SEMANTIC_WEIGHT |
| `_bmad-output/implementation-artifacts/deferred-work.md` | [B2] pending | Mark [B2] RESOLVED with HNSW verification details |

### NOT in scope (touch only if fixing regressions)

- `apps/web/src/routes/search.tsx` — placeholder until Story 6.4.
- `POST /api/search` — Story 6.3.
- `packages/db/src/schema/embeddings.ts` — no schema changes; HNSW index already present.
- Embedding re-generation from anonymized content — known limitation, out of scope.

---

## Testing Requirements

- **Unit:** `VectorSearchService` — embedding call, cosine distance SQL shape, approved-only filter, threshold, limit, error handling on embed failure.
- **Unit:** `HybridSearchService` — merge logic, deduplication, match type tagging, weight application, edge cases (empty results from either source).
- **Regression:** `pnpm test` / `turbo test` all green.
- **E2E:** imported threads through full pipeline → vector search returns relevant matches; `EXPLAIN ANALYZE` confirms index usage.

---

## Previous Story Intelligence (Story 6.1 — Full-Text Search Infrastructure)

- **SearchModule pattern:** 6.1 creates `search.module.ts` and `fts.service.ts` — follow the same injection pattern, logging, and error handling style.
- **Staging integration lesson:** FTS index is refreshed atomically during staging approval. Semantic search does NOT need staging integration — embeddings are written during the pipeline's embed stage (Story 3.5) and don't change on approval.
- **Approved-only filter:** 6.1 enforces `pipeline_state = 'approved'` in FTS queries. Apply the same defense-in-depth in vector search queries.
- **Module dependency graph:** 6.1 may have resolved the SearchModule ↔ AdminModule circular dependency — check how `FtsService` is wired and follow the same pattern for `VectorSearchService` (which needs `LlmService` from `PipelineModule`).
- **Pre-anonymization concern:** 6.1 flagged that embeddings use pre-anonymization content. This story inherits that limitation without expanding scope.

---

## Dependencies & Risks

| Type | Detail |
|------|--------|
| **Depends on** | Story 6.1 (SearchModule, FtsService — must be implemented first) |
| **Depends on** | Epics 1–4 (schema, pipeline, embeddings, staging) — all done |
| **Depends on** | Story 3.5 (thread_embeddings + HNSW index) — done |
| **Blocks** | Story 6.3 (Search API) needs HybridSearchService |
| **Risk** | **LLM embed unavailable at query time** — if CPU model is down, semantic search fails gracefully (returns empty). FTS still works independently. |
| **Risk** | **Circular dependency** if SearchModule imports PipelineModule which imports SearchModule. Resolve with `forwardRef(() => PipelineModule)` or expose `LlmService` from a shared provider. |
| **Risk** | **Embedding model mismatch** — if CPU_EMBED_MODEL_NAME changes between indexing and querying, similarity scores are meaningless. Mitigate: log model version used for query embedding; warn if it differs from stored embeddings' `modelVersion`. |
| **Risk** | **Scale at query time** — `LlmService.embed()` adds latency (~100–500ms per query). Combined with FTS, total must stay under 5s (NFR2). Acceptable for MVP scale (~100–1000 threads). |

---

## Dev Agent Record

### Agent Model Used

_(filled by implementer)_

### Debug Log References

### Completion Notes List

_(filled by implementer — include **E2E validation** bullet and **[B2] HNSW verification** result)_

### File List

_(filled by implementer)_

---

**Ultimate context engine analysis completed — comprehensive developer guide created.**
