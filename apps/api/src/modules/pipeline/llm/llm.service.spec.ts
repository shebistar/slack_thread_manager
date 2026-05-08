import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { LlmService } from './llm.service.js';
import { CpuModelProvider } from './providers/cpu-model.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { LlmPendingRetryError, type LlmCompletionResult } from './llm-provider.interface.js';

const makeCpuResult = (overrides?: Partial<LlmCompletionResult>): LlmCompletionResult => ({
  content: 'cpu response',
  modelVersion: 'mistral',
  latencyMs: 100,
  success: true,
  ...overrides,
});

const makeGeminiResult = (overrides?: Partial<LlmCompletionResult>): LlmCompletionResult => ({
  content: 'gemini response',
  modelVersion: 'gemini-pro',
  latencyMs: 200,
  success: true,
  ...overrides,
});

describe('LlmService', () => {
  let service: LlmService;
  let mockPrimary: { complete: ReturnType<typeof vi.fn>; embed: ReturnType<typeof vi.fn>; healthCheck: ReturnType<typeof vi.fn> };
  let mockFallback: { complete: ReturnType<typeof vi.fn>; embed: ReturnType<typeof vi.fn>; healthCheck: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockPrimary = {
      complete: vi.fn(),
      embed: vi.fn(),
      healthCheck: vi.fn(),
    };
    mockFallback = {
      complete: vi.fn(),
      embed: vi.fn(),
      healthCheck: vi.fn(),
    };
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'LLM_FALLBACK_RATE_THRESHOLD') return 0.5;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        { provide: CpuModelProvider, useValue: mockPrimary },
        { provide: GeminiProvider, useValue: mockFallback },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
  });

  describe('complete()', () => {
    it('returns result with usedFallback: false when primary succeeds on first attempt', async () => {
      mockPrimary.complete.mockResolvedValue(makeCpuResult());

      const result = await service.complete('test prompt');

      expect(result.content).toBe('cpu response');
      expect(result.usedFallback).toBe(false);
      expect(mockPrimary.complete).toHaveBeenCalledOnce();
      expect(mockFallback.complete).not.toHaveBeenCalled();
    });

    it('retries primary once on first failure; succeeds on second attempt with usedFallback: false', async () => {
      mockPrimary.complete
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(makeCpuResult());

      const result = await service.complete('test prompt');

      expect(result.usedFallback).toBe(false);
      expect(mockPrimary.complete).toHaveBeenCalledTimes(2);
      expect(mockFallback.complete).not.toHaveBeenCalled();
    });

    it('falls back to Gemini when primary fails both attempts; returns usedFallback: true', async () => {
      mockPrimary.complete.mockRejectedValue(new Error('CPU unavailable'));
      mockFallback.complete.mockResolvedValue(makeGeminiResult());

      const result = await service.complete('test prompt');

      expect(result.content).toBe('gemini response');
      expect(result.usedFallback).toBe(true);
      expect(mockPrimary.complete).toHaveBeenCalledTimes(2);
      expect(mockFallback.complete).toHaveBeenCalledOnce();
    });

    it('retries fallback once; succeeds on second fallback attempt with usedFallback: true', async () => {
      mockPrimary.complete.mockRejectedValue(new Error('CPU unavailable'));
      mockFallback.complete
        .mockRejectedValueOnce(new Error('gemini transient'))
        .mockResolvedValueOnce(makeGeminiResult());

      const result = await service.complete('test prompt');

      expect(result.usedFallback).toBe(true);
      expect(mockFallback.complete).toHaveBeenCalledTimes(2);
    });

    it('throws LlmPendingRetryError when both providers fail all attempts', async () => {
      mockPrimary.complete.mockRejectedValue(new Error('CPU down'));
      mockFallback.complete.mockRejectedValue(new Error('Gemini down'));

      await expect(service.complete('test prompt')).rejects.toThrow(LlmPendingRetryError);
      expect(mockPrimary.complete).toHaveBeenCalledTimes(2);
      expect(mockFallback.complete).toHaveBeenCalledTimes(2);
    });

    it('passes options (promptVersion) through to the provider', async () => {
      mockPrimary.complete.mockResolvedValue(makeCpuResult());

      await service.complete('prompt', { promptVersion: 'v2', temperature: 0.7 });

      expect(mockPrimary.complete).toHaveBeenCalledWith('prompt', {
        promptVersion: 'v2',
        temperature: 0.7,
      });
    });
  });

  describe('batch counters', () => {
    it('increments batchTotal on each complete() call', async () => {
      mockPrimary.complete.mockResolvedValue(makeCpuResult());

      service.resetBatchCounters();
      await service.complete('p1');
      await service.complete('p2');

      // Access via logBatchSummary — it should log with batchTotal: 2
      const logSpy = vi.spyOn(service['logger'], 'log');
      service.logBatchSummary();
      expect(logSpy).toHaveBeenCalledWith(
        'LLM batch summary',
        expect.objectContaining({ batchTotal: 2, batchFallback: 0 }),
      );
    });

    it('increments batchFallback only when fallback is used', async () => {
      mockPrimary.complete.mockRejectedValue(new Error('down'));
      mockFallback.complete.mockResolvedValue(makeGeminiResult());

      service.resetBatchCounters();
      await service.complete('p1');

      // 1/1 = 100% fallback rate → exceeds threshold → emits warn
      const warnSpy = vi.spyOn(service['logger'], 'warn');
      service.logBatchSummary();
      expect(warnSpy).toHaveBeenCalledWith(
        'LLM fallback rate exceeded threshold',
        expect.objectContaining({ batchTotal: 1, batchFallback: 1 }),
      );
    });

    it('resetBatchCounters() resets both counters to zero', async () => {
      mockPrimary.complete.mockRejectedValue(new Error('down'));
      mockFallback.complete.mockResolvedValue(makeGeminiResult());
      await service.complete('p1');

      service.resetBatchCounters();

      const logSpy = vi.spyOn(service['logger'], 'log');
      service.logBatchSummary();
      // batchTotal is 0, so logBatchSummary returns early without logging
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('logBatchSummary() emits warn when fallback rate exceeds threshold (>50%)', async () => {
      mockPrimary.complete.mockRejectedValue(new Error('down'));
      mockFallback.complete.mockResolvedValue(makeGeminiResult());

      service.resetBatchCounters();
      // 2 fallback calls out of 2 total = 100% > 50% threshold
      await service.complete('p1');
      await service.complete('p2');

      const warnSpy = vi.spyOn(service['logger'], 'warn');
      service.logBatchSummary();

      expect(warnSpy).toHaveBeenCalledWith(
        'LLM fallback rate exceeded threshold',
        expect.objectContaining({ 'llm.fallback_rate': 1, batchTotal: 2, batchFallback: 2 }),
      );
    });

    it('logBatchSummary() emits log (not warn) when fallback rate is at or below threshold', async () => {
      mockPrimary.complete.mockResolvedValue(makeCpuResult());

      service.resetBatchCounters();
      await service.complete('p1');
      await service.complete('p2');

      const warnSpy = vi.spyOn(service['logger'], 'warn');
      const logSpy = vi.spyOn(service['logger'], 'log');
      service.logBatchSummary();

      expect(warnSpy).not.toHaveBeenCalledWith('LLM fallback rate exceeded threshold', expect.anything());
      expect(logSpy).toHaveBeenCalledWith('LLM batch summary', expect.objectContaining({ batchTotal: 2 }));
    });
  });

  describe('embed()', () => {
    it('delegates embed() to primary provider', async () => {
      mockPrimary.embed.mockResolvedValue({ embedding: [0.1, 0.2], modelVersion: 'mistral' });

      const result = await service.embed('some text');

      expect(result.embedding).toEqual([0.1, 0.2]);
      expect(mockPrimary.embed).toHaveBeenCalledWith('some text');
      expect(mockFallback.embed).not.toHaveBeenCalled();
    });
  });
});
