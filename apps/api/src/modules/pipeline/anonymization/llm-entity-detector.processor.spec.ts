import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { LlmEntityDetectorProcessor } from './llm-entity-detector.processor.js';
import { LlmService } from '../llm/llm.service.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import { llmEntityDetectionResponseSchema } from '@slack-thread-manager/shared';
import type { AnonymizationResult } from '@slack-thread-manager/shared';
import goldenFixture from '../llm/fixtures/detect-entities.golden.json';

const makeSummary = (headline: string, body: string) => ({
  headline,
  body,
  key_decisions: [] as string[],
  action_items: [] as string[],
});

function makeBlocklistResult(
  threadId: string,
  headline = 'Test headline',
): AnonymizationResult {
  const content = {
    technicalSummary: makeSummary(headline, 'Technical body content'),
    plainSummary: makeSummary('Plain headline', 'Plain body content'),
  };
  return {
    threadId,
    originalContent: content,
    anonymizedContent: structuredClone(content),
    flags: [
      {
        term: 'KnownCorp',
        replacement: '[COMPANY]',
        category: 'company_name',
        source: 'BLOCKLIST' as const,
        positions: [{ field: 'technicalSummary.headline', startIndex: 0, endIndex: 9 }],
      },
    ],
  };
}

const llmSuccessResponse = JSON.stringify([
  {
    entity_text: 'Globex Industries',
    entity_type: 'company_name',
    confidence: 0.92,
    suggested_replacement: '[COMPANY]',
  },
  {
    entity_text: 'Bob Johnson',
    entity_type: 'person_name',
    confidence: 0.85,
    suggested_replacement: '[PERSON]',
  },
]);

describe('LlmEntityDetectorProcessor', () => {
  let processor: LlmEntityDetectorProcessor;
  let mockLlmService: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockLlmService = {
      complete: vi.fn().mockResolvedValue({
        content: llmSuccessResponse,
        modelVersion: 'phi3:mini',
        latencyMs: 500,
        success: true,
        usedFallback: false,
      }),
      resetBatchCounters: vi.fn(),
      logBatchSummary: vi.fn(),
    };

    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([
          { id: 'bl-1', term: 'KnownCorp', replacement: '[COMPANY]', category: 'company_name', createdAt: new Date() },
        ]),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        LlmEntityDetectorProcessor,
        { provide: LlmService, useValue: mockLlmService },
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    processor = module.get(LlmEntityDetectorProcessor);
  });

  it('8.1: detects entities in original content and returns flags with source LLM (AC: #1, #2, #3)', async () => {
    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    expect(result.threadsProcessed).toBe(1);
    expect(result.entitiesDetected).toBe(2);

    const llmFlags = result.results[0].flags.filter((f) => f.source === 'LLM');
    expect(llmFlags).toHaveLength(2);
    expect(llmFlags[0]).toMatchObject({
      term: 'Globex Industries',
      source: 'LLM',
    });
  });

  it('8.2: each entity has correct fields: term, replacement, category, source, confidence (AC: #2)', async () => {
    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    const llmFlags = result.results[0].flags.filter((f) => f.source === 'LLM');
    for (const flag of llmFlags) {
      expect(flag).toHaveProperty('term');
      expect(flag).toHaveProperty('replacement');
      expect(flag).toHaveProperty('category');
      expect(flag).toHaveProperty('source', 'LLM');
      expect(flag).toHaveProperty('confidence');
    }
  });

  it('8.3: entity types cover all 5 categories (AC: #1)', async () => {
    mockLlmService.complete.mockResolvedValue({
      content: JSON.stringify([
        { entity_text: 'Acme', entity_type: 'company_name', confidence: 0.9, suggested_replacement: '[COMPANY]' },
        { entity_text: 'Jane', entity_type: 'person_name', confidence: 0.8, suggested_replacement: '[PERSON]' },
        { entity_text: 'https://int.local', entity_type: 'url', confidence: 0.9, suggested_replacement: '[URL_REDACTED]' },
        { entity_text: 'ACC-123', entity_type: 'account_id', confidence: 0.7, suggested_replacement: '[ACCOUNT_ID]' },
        { entity_text: 'db-prod-01', entity_type: 'infrastructure', confidence: 0.85, suggested_replacement: '[HOST_REDACTED]' },
      ]),
      modelVersion: 'phi3:mini',
      latencyMs: 400,
      success: true,
      usedFallback: false,
    });

    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    const categories = result.results[0].flags
      .filter((f) => f.source === 'LLM')
      .map((f) => f.category);

    expect(categories).toContain('company_name');
    expect(categories).toContain('person_name');
    expect(categories).toContain('url');
    expect(categories).toContain('account_id');
    expect(categories).toContain('infrastructure');
  });

  it('8.4: deduplication — entity matching blocklist term (case-insensitive) is excluded (AC: #3)', async () => {
    mockLlmService.complete.mockResolvedValue({
      content: JSON.stringify([
        { entity_text: 'KnownCorp', entity_type: 'company_name', confidence: 0.9, suggested_replacement: '[COMPANY]' },
        { entity_text: 'knowncorp', entity_type: 'company_name', confidence: 0.9, suggested_replacement: '[COMPANY]' },
        { entity_text: 'NewEntity', entity_type: 'person_name', confidence: 0.8, suggested_replacement: '[PERSON]' },
      ]),
      modelVersion: 'phi3:mini',
      latencyMs: 400,
      success: true,
      usedFallback: false,
    });

    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    const llmFlags = result.results[0].flags.filter((f) => f.source === 'LLM');
    expect(llmFlags).toHaveLength(1);
    expect(llmFlags[0].term).toBe('NewEntity');
  });

  it('8.5: LLM flags merged with existing blocklist flags in results (AC: #3)', async () => {
    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    const allFlags = result.results[0].flags;
    const blocklistFlags = allFlags.filter((f) => f.source === 'BLOCKLIST');
    const llmFlags = allFlags.filter((f) => f.source === 'LLM');

    expect(blocklistFlags).toHaveLength(1);
    expect(llmFlags).toHaveLength(2);
    expect(allFlags).toHaveLength(3);
  });

  it('8.6: uses LlmService.complete() with correct promptVersion (AC: #4)', async () => {
    const input = [makeBlocklistResult('thread-1')];
    await processor.runDetection(input);

    expect(mockLlmService.complete).toHaveBeenCalledWith(
      expect.any(String),
      { promptVersion: 'detect-entities-v1', temperature: 0.2 },
    );
  });

  it('8.7: LLM returns empty array — zero entities, results passed through', async () => {
    mockLlmService.complete.mockResolvedValue({
      content: '[]',
      modelVersion: 'phi3:mini',
      latencyMs: 200,
      success: true,
      usedFallback: false,
    });

    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    expect(result.entitiesDetected).toBe(0);
    expect(result.results[0].flags.filter((f) => f.source === 'LLM')).toHaveLength(0);
    expect(result.results[0].flags.filter((f) => f.source === 'BLOCKLIST')).toHaveLength(1);
  });

  it('8.8: LLM returns malformed JSON — retry once, then return original result without LLM flags', async () => {
    mockLlmService.complete
      .mockResolvedValueOnce({
        content: 'not valid json',
        modelVersion: 'phi3:mini',
        latencyMs: 300,
        success: true,
        usedFallback: false,
      })
      .mockResolvedValueOnce({
        content: '{{broken again}}',
        modelVersion: 'phi3:mini',
        latencyMs: 300,
        success: true,
        usedFallback: false,
      });

    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    expect(mockLlmService.complete).toHaveBeenCalledTimes(2);
    expect(result.results[0].flags.filter((f) => f.source === 'LLM')).toHaveLength(0);
    expect(result.results[0].flags.filter((f) => f.source === 'BLOCKLIST')).toHaveLength(1);
  });

  it('8.9: LLM output validated against Zod schema (AC: #5)', async () => {
    mockLlmService.complete.mockResolvedValue({
      content: JSON.stringify([{ entity_text: 'A', confidence: 'not-a-number', entity_type: 'company_name', suggested_replacement: '[X]' }]),
      modelVersion: 'phi3:mini',
      latencyMs: 300,
      success: true,
      usedFallback: false,
    });

    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    expect(result.results[0].flags.filter((f) => f.source === 'LLM')).toHaveLength(0);
  });

  it('8.10: per-thread error isolation — one thread fails, others still processed', async () => {
    mockLlmService.complete
      .mockRejectedValueOnce(new Error('LLM crashed attempt 1'))
      .mockRejectedValueOnce(new Error('LLM crashed attempt 2'))
      .mockResolvedValueOnce({
        content: llmSuccessResponse,
        modelVersion: 'phi3:mini',
        latencyMs: 500,
        success: true,
        usedFallback: false,
      });

    const input = [
      makeBlocklistResult('thread-1'),
      makeBlocklistResult('thread-2'),
    ];
    const result = await processor.runDetection(input);

    expect(result.threadsProcessed).toBe(2);
    expect(result.results).toHaveLength(2);

    const thread1Llm = result.results[0].flags.filter((f) => f.source === 'LLM');
    const thread2Llm = result.results[1].flags.filter((f) => f.source === 'LLM');
    expect(thread1Llm).toHaveLength(0);
    expect(thread2Llm).toHaveLength(2);
  });

  it('8.11: zero blocklistResults input returns empty result', async () => {
    const result = await processor.runDetection([]);

    expect(result).toEqual({
      threadsProcessed: 0,
      entitiesDetected: 0,
      results: [],
    });
    expect(mockLlmService.complete).not.toHaveBeenCalled();
  });

  it('8.12: golden fixture validates against llmEntityDetectionResponseSchema (AC: #5)', () => {
    const parsed = llmEntityDetectionResponseSchema.safeParse(goldenFixture);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toHaveLength(5);
      expect(parsed.data[0].entity_type).toBe('company_name');
      expect(parsed.data[1].entity_type).toBe('person_name');
      expect(parsed.data[2].entity_type).toBe('url');
      expect(parsed.data[3].entity_type).toBe('account_id');
      expect(parsed.data[4].entity_type).toBe('infrastructure');
    }
  });

  it('strips markdown code fences from LLM response', async () => {
    mockLlmService.complete.mockResolvedValue({
      content: '```json\n' + llmSuccessResponse + '\n```',
      modelVersion: 'phi3:mini',
      latencyMs: 400,
      success: true,
      usedFallback: false,
    });

    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    expect(result.entitiesDetected).toBe(2);
  });

  it('strips single-line markdown fences without newlines', async () => {
    mockLlmService.complete.mockResolvedValue({
      content: '```json' + llmSuccessResponse + '```',
      modelVersion: 'phi3:mini',
      latencyMs: 400,
      success: true,
      usedFallback: false,
    });

    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    expect(result.entitiesDetected).toBe(2);
  });

  it('deduplicates LLM entities with same entity_text (case-insensitive)', async () => {
    mockLlmService.complete.mockResolvedValue({
      content: JSON.stringify([
        { entity_text: 'Globex Industries', entity_type: 'company_name', confidence: 0.92, suggested_replacement: '[COMPANY]' },
        { entity_text: 'globex industries', entity_type: 'company_name', confidence: 0.88, suggested_replacement: '[COMPANY]' },
        { entity_text: 'Bob Johnson', entity_type: 'person_name', confidence: 0.85, suggested_replacement: '[PERSON]' },
      ]),
      modelVersion: 'phi3:mini',
      latencyMs: 400,
      success: true,
      usedFallback: false,
    });

    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    const llmFlags = result.results[0].flags.filter((f) => f.source === 'LLM');
    expect(llmFlags).toHaveLength(2);
    expect(llmFlags[0].term).toBe('Globex Industries');
    expect(llmFlags[1].term).toBe('Bob Johnson');
  });

  it('continues with empty known terms when DB blocklist load fails', async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    });

    const input = [makeBlocklistResult('thread-1')];
    const result = await processor.runDetection(input);

    expect(result.threadsProcessed).toBe(1);
    expect(result.entitiesDetected).toBe(2);
    expect(mockLlmService.complete).toHaveBeenCalledOnce();
  });

  it('calls resetBatchCounters and logBatchSummary', async () => {
    const input = [makeBlocklistResult('thread-1')];
    await processor.runDetection(input);

    expect(mockLlmService.resetBatchCounters).toHaveBeenCalledOnce();
    expect(mockLlmService.logBatchSummary).toHaveBeenCalledOnce();
  });
});
