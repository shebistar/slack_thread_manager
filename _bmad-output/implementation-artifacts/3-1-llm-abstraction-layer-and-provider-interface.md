# Story 3.1: LLM Abstraction Layer & Provider Interface

Status: done

## Story

As a **developer**,
I want a provider-agnostic LLM service that abstracts model calls behind a unified interface with CPU model primary and Gemini Pro fallback,
so that the pipeline can swap models without changing processing logic.

## Acceptance Criteria

1. **Given** the LLM module is configured with primary (CPU model) and fallback (Gemini Pro) providers, **When** a pipeline processor requests LLM inference, **Then** it calls `LlmService.complete()` with a prompt and receives a typed response containing content, model_version, prompt_version, latency_ms, and success.

2. **Given** the `LlmProviderInterface`, **When** examined, **Then** it defines three methods: `complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult>`, `embed(text: string): Promise<LlmEmbedResult>`, and `healthCheck(): Promise<boolean>`.

3. **Given** `cpu-model.provider.ts`, **When** `complete()` is called, **Then** it sends a POST to `{CPU_MODEL_URL}/v1/chat/completions` with the configured model name and returns a typed result.

4. **Given** `gemini.provider.ts`, **When** `complete()` is called, **Then** it calls the Google Gemini Pro API via `@google/generative-ai` SDK and returns a typed result.

5. **Given** the CPU model times out (configurable via `LLM_TIMEOUT_MS`, default 30s) or returns an error, **When** `LlmService.complete()` is called, **Then** the service retries the CPU model once; if both CPU attempts fail, it falls back to Gemini Pro.

6. **Given** both providers fail (CPU model fails twice, Gemini Pro fails twice), **When** all retry attempts are exhausted, **Then** `LlmService.complete()` throws `LlmPendingRetryError` (not a generic error) — the caller catches this to mark the item as `pending_retry`.

7. **Given** any LLM call completes (success or failure), **When** the call returns, **Then** `LlmService` logs at `log` level: `provider`, `modelVersion`, `promptVersion`, `latencyMs`, `success` — every call, always.

8. **Given** `LlmService` is tracking a batch run (after `resetBatchCounters()` is called), **When** `logBatchSummary()` is called and fallback rate exceeds the configured threshold (default 0.5), **Then** a `warn` level log is emitted with `llm.fallback_rate` and counts.

## Tasks / Subtasks

- [x] Task 1: Add LLM env vars to app config (AC: #3, #4, #5)
  - [x] 1.1 Create `apps/api/src/config/llm.config.ts` exporting `llmConfigSchema` (Zod) with: `CPU_MODEL_URL` (optional string URL), `CPU_MODEL_NAME` (optional string, default `'mistral'`), `GEMINI_API_KEY` (optional string), `GEMINI_MODEL_NAME` (optional string, default `'gemini-pro'`), `LLM_TIMEOUT_MS` (optional coerce number, default `30000`), `LLM_FALLBACK_RATE_THRESHOLD` (optional coerce number, default `0.5`)
  - [x] 1.2 Merge `llmConfigSchema` into `envSchema` in `apps/api/src/config/app.config.ts` using `z.intersection()` or `.merge()` — all LLM fields are `.optional()` (pipeline disabled if absent, similar to SLACK_BOT_TOKEN pattern)

- [x] Task 2: Create `LlmProviderInterface` and shared types (AC: #2, #6)
  - [x] 2.1 Create `apps/api/src/modules/pipeline/llm/llm-provider.interface.ts` with:
    - `LlmCompletionOptions`: `{ promptVersion?: string; maxTokens?: number; temperature?: number }`
    - `LlmCompletionResult`: `{ content: string; modelVersion: string; latencyMs: number; success: true }`
    - `LlmEmbedResult`: `{ embedding: number[]; modelVersion: string }`
    - `LlmPendingRetryError extends Error`: `constructor(message: string, public readonly provider: string)` — `name = 'LlmPendingRetryError'`
    - `LlmProviderInterface`: interface with `complete(prompt, options?)`, `embed(text)`, `healthCheck()`

- [x] Task 3: Create `CpuModelProvider` (AC: #3)
  - [x] 3.1 Create `apps/api/src/modules/pipeline/llm/providers/cpu-model.provider.ts`
    - `@Injectable() export class CpuModelProvider implements LlmProviderInterface`
    - Constructor: `constructor(private readonly configService: ConfigService)`
    - `complete()`: POST to `${CPU_MODEL_URL}/v1/chat/completions` with body `{ model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens }`; parse `choices[0].message.content`; wrap in `try/catch`; reject with typed error on non-2xx
    - `embed()`: POST to `${CPU_MODEL_URL}/v1/embeddings` with body `{ model, input: text }`; parse `data[0].embedding`
    - `healthCheck()`: GET `${CPU_MODEL_URL}/v1/models`; returns `true` if 2xx, `false` otherwise
    - Use `AbortController` + `signal` on `fetch()` to implement per-call timeout (pass `LLM_TIMEOUT_MS` from config)
    - Return `modelVersion` from config as `CPU_MODEL_NAME`

- [x] Task 4: Create `GeminiProvider` (AC: #4)
  - [x] 4.1 Install `@google/generative-ai` in `apps/api`: `pnpm --filter @slack-thread-manager/api add @google/generative-ai`
  - [x] 4.2 Create `apps/api/src/modules/pipeline/llm/providers/gemini.provider.ts`
    - `@Injectable() export class GeminiProvider implements LlmProviderInterface`
    - Constructor: `constructor(private readonly configService: ConfigService)`; instantiate `new GoogleGenerativeAI(GEMINI_API_KEY)` in constructor; store `this.genAI`
    - `complete()`: `this.genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME }).generateContent(prompt)`; parse `result.response.text()`; record `latencyMs`; return typed result; wrap in `try/catch`
    - `embed()`: `this.genAI.getGenerativeModel({ model: 'text-embedding-004' }).embedContent(text)`; return `result.embedding.values`
    - `healthCheck()`: call `this.genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME }).generateContent('ping')`; return `true` if OK, `false` on error
    - Return `modelVersion` as `GEMINI_MODEL_NAME`

- [x] Task 5: Create `LlmService` with retry/fallback logic (AC: #1, #5, #6, #7, #8)
  - [x] 5.1 Create `apps/api/src/modules/pipeline/llm/llm.service.ts`
    - `@Injectable() export class LlmService`
    - Constructor: `constructor(private readonly primary: CpuModelProvider, private readonly fallback: GeminiProvider, private readonly configService: ConfigService)`
    - Private fields: `private batchTotal = 0`, `private batchFallback = 0`
    - `complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult & { usedFallback: boolean }>`:
      - Try `primary.complete()` → on success → log + return with `usedFallback: false`
      - On first failure → retry `primary.complete()` once
      - On second primary failure → try `fallback.complete()` → on success → increment `batchFallback` → log + return with `usedFallback: true`
      - On first fallback failure → retry `fallback.complete()` once
      - On second fallback failure → log error → throw `new LlmPendingRetryError('All LLM providers failed', 'gemini')`
      - Increment `batchTotal` on every call (before attempt loop)
      - Always log via `this.logger.log('LLM call', { provider, modelVersion, promptVersion: options?.promptVersion, latencyMs, success })` — log the final resolved result
    - `embed(text: string)`: delegates to `primary.embed()` with no fallback (embedding errors propagate directly for now)
    - `resetBatchCounters(): void`: sets `batchTotal = 0` and `batchFallback = 0`
    - `logBatchSummary(): void`: computes rate; if `batchTotal > 0 && (batchFallback / batchTotal) > threshold` → `this.logger.warn('LLM fallback rate exceeded threshold', { llm_fallback_rate: rate, batchFallback, batchTotal, threshold })`; else → `this.logger.log('LLM batch summary', { batchTotal, batchFallback, rate })`

- [x] Task 6: Create `LlmModule` and `PipelineModule` (AC: all)
  - [x] 6.1 Create `apps/api/src/modules/pipeline/llm/llm.module.ts`:
    - `@Module({ providers: [CpuModelProvider, GeminiProvider, LlmService], exports: [LlmService] })`
  - [x] 6.2 Create `apps/api/src/modules/pipeline/pipeline.module.ts`:
    - `@Module({ imports: [LlmModule], exports: [LlmModule] })`
  - [x] 6.3 Add `PipelineModule` to `imports` in `apps/api/src/app.module.ts`

- [x] Task 7: Write unit tests (AC: #1–#8)
  - [x] 7.1 `llm.service.spec.ts` — primary success path: `complete()` returns result with `usedFallback: false`
  - [x] 7.2 `llm.service.spec.ts` — primary fails once, succeeds on retry: still `usedFallback: false`
  - [x] 7.3 `llm.service.spec.ts` — primary fails twice, fallback succeeds: returns result with `usedFallback: true`; `batchFallback` increments
  - [x] 7.4 `llm.service.spec.ts` — primary fails twice, fallback fails once, succeeds on retry: `usedFallback: true`
  - [x] 7.5 `llm.service.spec.ts` — both providers fail twice: throws `LlmPendingRetryError`
  - [x] 7.6 `llm.service.spec.ts` — logging: every successful call logs `provider`, `modelVersion`, `promptVersion`, `latencyMs`, `success`
  - [x] 7.7 `llm.service.spec.ts` — `resetBatchCounters()` resets `batchTotal` and `batchFallback`
  - [x] 7.8 `llm.service.spec.ts` — `logBatchSummary()` emits `warn` when fallback rate > threshold
  - [x] 7.9 `llm.service.spec.ts` — `logBatchSummary()` emits `log` (not warn) when fallback rate <= threshold
  - [x] 7.10 `llm.service.spec.ts` — `embed()` delegates to primary provider

## Dev Notes

### Module Placement (CRITICAL — Architecture Exception)

The LLM module lives inside `pipeline/`, which is a new top-level module. This creates a two-level structure:

```
apps/api/src/modules/pipeline/
├── pipeline.module.ts              ← PipelineModule (thin for now; grows in 3.2+)
└── llm/
    ├── llm.module.ts               ← LlmModule
    ├── llm.service.ts
    ├── llm.service.spec.ts
    ├── llm-provider.interface.ts
    └── providers/                  ← ARCHITECTURE EXCEPTION: subdirectory is explicitly designed
        ├── cpu-model.provider.ts
        └── gemini.provider.ts
```

The `providers/` subdirectory is an **explicit architecture exception** to the flat module rule. The architecture document defines this exact structure. Do NOT flatten it.

### Interface Definitions (copy verbatim)

```typescript
// llm-provider.interface.ts

export interface LlmCompletionOptions {
  promptVersion?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompletionResult {
  content: string;
  modelVersion: string;
  latencyMs: number;
  success: true;
}

export interface LlmEmbedResult {
  embedding: number[];
  modelVersion: string;
}

export class LlmPendingRetryError extends Error {
  readonly name = 'LlmPendingRetryError';
  constructor(
    message: string,
    public readonly provider: string,
  ) {
    super(message);
  }
}

export interface LlmProviderInterface {
  complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult>;
  embed(text: string): Promise<LlmEmbedResult>;
  healthCheck(): Promise<boolean>;
}
```

### CpuModelProvider — fetch with AbortController timeout

```typescript
// cpu-model.provider.ts
async complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult> {
  const url = this.configService.get<string>('CPU_MODEL_URL')!;
  const model = this.configService.get<string>('CPU_MODEL_NAME') ?? 'mistral';
  const timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS') ?? 30_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 2048,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`CPU model HTTP ${res.status}`);
    const data = await res.json() as { choices: [{ message: { content: string } }] };
    return {
      content: data.choices[0].message.content,
      modelVersion: model,
      latencyMs: Date.now() - start,
      success: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
```

Key: `AbortController` signals a timeout; `fetch` throws `AbortError` which the service catches as a failure.

### GeminiProvider — @google/generative-ai SDK

Install: `pnpm --filter @slack-thread-manager/api add @google/generative-ai`

```typescript
// gemini.provider.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

constructor(private readonly configService: ConfigService) {
  const apiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
  this.genAI = new GoogleGenerativeAI(apiKey);
}

async complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult> {
  const modelName = this.configService.get<string>('GEMINI_MODEL_NAME') ?? 'gemini-pro';
  const model = this.genAI.getGenerativeModel({ model: modelName });
  const start = Date.now();
  const result = await model.generateContent(prompt);
  return {
    content: result.response.text(),
    modelVersion: modelName,
    latencyMs: Date.now() - start,
    success: true,
  };
}

async embed(text: string): Promise<LlmEmbedResult> {
  const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return {
    embedding: result.embedding.values,
    modelVersion: 'text-embedding-004',
  };
}
```

### LlmService — Retry/Fallback Flow

```
complete(prompt, options):
  batchTotal++
  attempt primary:
    try primary.complete()  → success → log + return { ...result, usedFallback: false }
    catch              → retry once:
      try primary.complete()  → success → log + return { ...result, usedFallback: false }
      catch              → attempt fallback:
        try fallback.complete()  → success → batchFallback++ → log + return { ...result, usedFallback: true }
        catch               → retry once:
          try fallback.complete()  → success → batchFallback++ → log + return { ...result, usedFallback: true }
          catch               → log error → throw LlmPendingRetryError
```

### LlmService — Logging (AC #7)

Log on every completed call (success or final failure before throwing):

```typescript
this.logger.log('LLM call', {
  provider,          // 'cpu-model' or 'gemini'
  modelVersion,      // e.g., 'mistral' or 'gemini-pro'
  promptVersion: options?.promptVersion,
  latencyMs,
  success,           // boolean
});
```

Log `error` level before throwing `LlmPendingRetryError`:
```typescript
this.logger.error('All LLM providers failed', { prompt: prompt.slice(0, 80) });
```

### LlmConfig — env vars

Add to `app.config.ts` via `.merge()` or explicit addition:

| Variable | Type | Default | Required |
|----------|------|---------|----------|
| `CPU_MODEL_URL` | `string` | — | optional |
| `CPU_MODEL_NAME` | `string` | `'mistral'` | optional |
| `GEMINI_API_KEY` | `string` | — | optional |
| `GEMINI_MODEL_NAME` | `string` | `'gemini-pro'` | optional |
| `LLM_TIMEOUT_MS` | `number` | `30000` | optional |
| `LLM_FALLBACK_RATE_THRESHOLD` | `number` | `0.5` | optional |

All optional — if `CPU_MODEL_URL` is absent, the CpuModelProvider will fail on every call (graceful degradation via fallback). If `GEMINI_API_KEY` is absent, GeminiProvider fails gracefully. No startup crash.

**NEVER** add new required env vars without updating `envSchema`. These must remain optional.

### Testing Patterns for Providers/Service

Mock `CpuModelProvider` and `GeminiProvider` as `vi.fn()` implementations of `LlmProviderInterface`:

```typescript
const mockPrimary = {
  complete: vi.fn(),
  embed: vi.fn(),
  healthCheck: vi.fn(),
};
const mockFallback = {
  complete: vi.fn(),
  embed: vi.fn(),
  healthCheck: vi.fn(),
};
```

To simulate timeout on primary (AbortError):
```typescript
mockPrimary.complete.mockRejectedValue(new DOMException('aborted', 'AbortError'));
```

Test `LlmPendingRetryError` catch:
```typescript
await expect(service.complete('prompt')).rejects.toThrow(LlmPendingRetryError);
```

### Module Registration Chain

```
AppModule → PipelineModule → LlmModule → { CpuModelProvider, GeminiProvider, LlmService }
```

`PipelineModule` is thin in Story 3.1 — just imports and re-exports `LlmModule`. It will gain `PipelineService`, `ProcessorService` etc. in Stories 3.2–3.7.

`LlmService` is exported from `LlmModule` and `PipelineModule` so processors in `pipeline/processors/` can inject it.

### ConfigService for Providers

Both providers use `@nestjs/config`'s `ConfigService` (already in `AppModule`). They do NOT inject `DATABASE_TOKEN` — no DB access in the LLM module.

NestJS `ConfigModule` is `isGlobal: true` in `AppModule` — `ConfigService` is available in any module without importing `ConfigModule` again.

### Anti-Patterns to Avoid

- **DO NOT** use the `openai` npm package — use native `fetch()` for the CPU model's OpenAI-compatible API
- **DO NOT** make `CPU_MODEL_URL` required in `envSchema` — LLM is optional until Epic 3 is running
- **DO NOT** flatten the `providers/` subdirectory — the architecture explicitly requires it
- **DO NOT** inject `DATABASE_TOKEN` in LlmService or providers — no DB access needed in Story 3.1
- **DO NOT** use `console.log` — use `new Logger(ClassName.name)`
- **DO NOT** forget `.js` extension on relative imports (ESM/NodeNext): `import { LlmProviderInterface } from './llm-provider.interface.js'`
- **DO NOT** add `import type` for `LlmProviderInterface` when you need the runtime class — use regular `import` since `LlmPendingRetryError` is a class (not just a type)
- **DO NOT** register `CpuModelProvider` or `GeminiProvider` directly in `AppModule` — they must be scoped to `LlmModule`
- **DO NOT** implement `pipeline_failures` table or `pipeline_runs` table here — that is Story 3.2

### Files to Create / Modify

| File | Type | Change |
|------|------|--------|
| `apps/api/src/config/llm.config.ts` | NEW | `llmConfigSchema` with LLM env vars |
| `apps/api/src/config/app.config.ts` | MODIFY | Merge LLM env vars into `envSchema` |
| `apps/api/src/modules/pipeline/pipeline.module.ts` | NEW | Thin `PipelineModule` importing `LlmModule` |
| `apps/api/src/modules/pipeline/llm/llm-provider.interface.ts` | NEW | Interface, types, `LlmPendingRetryError` |
| `apps/api/src/modules/pipeline/llm/llm.module.ts` | NEW | `LlmModule` providing/exporting `LlmService` |
| `apps/api/src/modules/pipeline/llm/llm.service.ts` | NEW | Retry/fallback orchestration |
| `apps/api/src/modules/pipeline/llm/llm.service.spec.ts` | NEW | 10 unit tests |
| `apps/api/src/modules/pipeline/llm/providers/cpu-model.provider.ts` | NEW | OpenAI-compatible HTTP client |
| `apps/api/src/modules/pipeline/llm/providers/gemini.provider.ts` | NEW | Google Generative AI SDK client |
| `apps/api/src/app.module.ts` | MODIFY | Import `PipelineModule` |

### Previous Story Intelligence (Stories 2.3–2.5)

- **Import pattern**: always `.js` extension on relative imports — `from './llm.service.js'` not `from './llm.service'`
- **Logger**: `private readonly logger = new Logger(LlmService.name)` — never `console.log`
- **ConfigService**: injected via constructor, not `@Inject()` — `constructor(private readonly configService: ConfigService)` works without `@Inject(ConfigService)` since NestJS resolves it by type
- **Module exports**: always `exports: [LlmService]` in `LlmModule` to allow other modules to inject it
- **Test isolation**: use `Test.createTestingModule({ providers: [...mocks] })` — each test creates a fresh module
- **111 tests currently passing** across 16 test files — do NOT break any existing tests

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#LLM Failure Modes & Operational Safeguards]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure (lines 618–625)]
- [Source: apps/api/src/config/app.config.ts — env var pattern to extend]
- [Source: apps/api/src/app.module.ts — module registration pattern]
- [Source: apps/api/src/modules/ingestion/ingestion.module.ts — module structure pattern]
- [Source: _bmad-output/implementation-artifacts/2-5-historical-backfill.md — previous story patterns]

## Senior Developer Review (AI)

**Review Date:** 2026-05-08
**Review Outcome:** Changes Requested
**Layers Run:** Blind Hunter ✅ · Edge Case Hunter ✅ · Acceptance Auditor ✅

### Action Items

**Patches (must fix before `done`):**

- [x] [Review][Patch] P1: Log key `llm_fallback_rate` → `llm.fallback_rate` to match AC8 spec [`llm.service.ts:77`]
- [x] [Review][Patch] P2: Add timeout (LLM_TIMEOUT_MS) to Gemini `complete()` — unbounded hang risk [`gemini.provider.ts:25`]
- [x] [Review][Patch] P3: Add timeout (LLM_TIMEOUT_MS) to Gemini `embed()` — no AbortController [`gemini.provider.ts:38`]
- [x] [Review][Patch] P4: Add timeout (LLM_TIMEOUT_MS) to CPU `healthCheck()` — no AbortController [`cpu-model.provider.ts:98`]
- [x] [Review][Patch] P5: Guard `choices[0]` / `data[0]` array bounds in CPU responses — TypeError on empty array [`cpu-model.provider.ts:57,87`]
- [x] [Review][Patch] P6: Change hardcoded `'gemini'` → `'all'` in `LlmPendingRetryError` throw — wrong blame attribution [`llm.service.ts:60`]
- [x] [Review][Patch] P7: Add `promptVersion?: string` to `LlmCompleteResult` return type — AC1 violation [`llm-provider.interface.ts`, `llm.service.ts`]
- [x] [Review][Patch] P8: Pass `temperature`/`maxTokens` from options to Gemini `generateContent` — silently ignored on fallback path [`gemini.provider.ts:25`]

**Deferred:**

- [x] [Review][Defer] `embed()` has no fallback to Gemini — by spec design, dev notes explicitly state primary-only
- [x] [Review][Defer] Fallback-rate stats can miscount under concurrent calls — single-process by architecture assumption
- [x] [Review][Defer] Prompt content (80 chars) in error log — operational policy decision, not in story scope
- [x] [Review][Defer] CPU model has no auth header (`CPU_MODEL_API_KEY`) — not in story scope, add when needed
- [x] [Review][Defer] Gemini safety blocks treated as transport error — currently handled by retry+LlmPendingRetryError chain
- [x] [Review][Defer] `GEMINI_API_KEY` absent → empty string init — graceful degradation by design (fails on first call)

### Review Follow-ups (AI)

*(populated by dev agent when addressing review findings)*

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- All 7 tasks completed in one pass; no deviations from story spec.
- `llmConfigSchema` merged into `envSchema` via `baseSchema.merge(llmConfigSchema)` — all LLM fields optional; no startup crash when not configured.
- `providers/` subdirectory created inside `pipeline/llm/` as explicit architecture exception — flat module rule does not apply here per architecture doc.
- `CpuModelProvider` uses native `fetch()` with `AbortController` for timeout enforcement; no `openai` npm package needed.
- `GeminiProvider` uses `@google/generative-ai` SDK; `text-embedding-004` model for embeddings.
- `LlmService.complete()` implements 2-attempt retry loop on primary then 2-attempt retry loop on fallback before throwing `LlmPendingRetryError`.
- One test fix: test verifying `batchFallback` count was checking `logger.log` but the 100% fallback rate correctly triggers `logger.warn` — fixed to assert on `warn`.
- 123 tests passing across 17 test files; 0 regressions.

### File List

- `apps/api/src/config/llm.config.ts` — NEW: `llmConfigSchema` with all LLM env vars
- `apps/api/src/config/app.config.ts` — MODIFIED: merged `llmConfigSchema` into `envSchema`
- `apps/api/src/modules/pipeline/pipeline.module.ts` — NEW: thin `PipelineModule` importing `LlmModule`
- `apps/api/src/modules/pipeline/llm/llm-provider.interface.ts` — NEW: `LlmProviderInterface`, types, `LlmPendingRetryError`
- `apps/api/src/modules/pipeline/llm/llm.module.ts` — NEW: `LlmModule` registering and exporting `LlmService`
- `apps/api/src/modules/pipeline/llm/llm.service.ts` — NEW: retry/fallback orchestration, batch counters
- `apps/api/src/modules/pipeline/llm/llm.service.spec.ts` — NEW: 13 unit tests covering all ACs
- `apps/api/src/modules/pipeline/llm/providers/cpu-model.provider.ts` — NEW: OpenAI-compatible HTTP client with AbortController timeout
- `apps/api/src/modules/pipeline/llm/providers/gemini.provider.ts` — NEW: Google Generative AI SDK client
- `apps/api/src/app.module.ts` — MODIFIED: registered `PipelineModule`
