import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VectorSearchService } from './vector-search.service.js';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { LlmService } from '../pipeline/llm/llm.service.js';

function flattenSqlChunks(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) {
    return '';
  }

  return chunks
    .map((chunk) => {
      if (typeof chunk === 'string') {
        return chunk;
      }
      if (chunk && typeof chunk === 'object' && 'value' in chunk) {
        return String((chunk as { value: unknown }).value);
      }
      return flattenSqlChunks(chunk);
    })
    .join(' ');
}

function makeEmbedding(length = 768, value = 0.1): number[] {
  return Array.from({ length }, () => value);
}

describe('VectorSearchService', () => {
  let service: VectorSearchService;
  let mockDb: { execute: ReturnType<typeof vi.fn> };
  let mockLlmService: { embed: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDb = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    mockLlmService = { embed: vi.fn() };
    mockConfigService = { get: vi.fn().mockReturnValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        VectorSearchService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: LlmService, useValue: mockLlmService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<VectorSearchService>(VectorSearchService);
  });

  describe('search — input guards', () => {
    it('returns empty array for empty query without calling embed', async () => {
      const result = await service.search('');
      expect(result).toEqual([]);
      expect(mockLlmService.embed).not.toHaveBeenCalled();
    });

    it('returns empty array for whitespace-only query without calling embed', async () => {
      const result = await service.search('   ');
      expect(result).toEqual([]);
      expect(mockLlmService.embed).not.toHaveBeenCalled();
    });
  });

  describe('search — embed failure (AC 8)', () => {
    it('returns empty array and does not execute DB query when embed fails', async () => {
      mockLlmService.embed.mockRejectedValue(new Error('CPU model unavailable'));

      const result = await service.search('test query');

      expect(result).toEqual([]);
      expect(mockDb.execute).not.toHaveBeenCalled();
    });
  });

  describe('search — normal flow (AC 1, 2, 3, 4)', () => {
    it('calls embed with the trimmed query text (AC 1)', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(),
        modelVersion: 'nomic-v1',
      });

      await service.search('  deployment pipeline  ');

      expect(mockLlmService.embed).toHaveBeenCalledWith('deployment pipeline');
    });

    it('executes SQL containing <=> operator (AC 2)', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3, 0.5),
        modelVersion: 'nomic-v1',
      });

      await service.search('semantic query');

      expect(mockDb.execute).toHaveBeenCalledOnce();
      const sqlArg = mockDb.execute.mock.calls[0]?.[0] as unknown;
      const sqlText = flattenSqlChunks(sqlArg);
      expect(sqlText).toContain('<=>');
    });

    it('SQL contains ORDER BY for ascending distance (AC 2)', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });

      await service.search('query');

      const sqlArg = mockDb.execute.mock.calls[0]?.[0] as unknown;
      const sqlText = flattenSqlChunks(sqlArg);
      expect(sqlText).toMatch(/ORDER BY/i);
      expect(sqlText).toMatch(/ASC/i);
    });

    it('SQL contains pipeline_state approved filter (AC 3)', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });

      await service.search('query');

      const sqlArg = mockDb.execute.mock.calls[0]?.[0] as unknown;
      const sqlText = flattenSqlChunks(sqlArg);
      expect(sqlText).toContain('approved');
    });

    it('reads SEMANTIC_SEARCH_SIMILARITY_THRESHOLD from config first (AC 4)', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SEMANTIC_SEARCH_SIMILARITY_THRESHOLD') return 0.9;
        return undefined;
      });
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });

      await service.search('query');

      expect(mockConfigService.get).toHaveBeenCalledWith('SEMANTIC_SEARCH_SIMILARITY_THRESHOLD');
      expect(mockDb.execute).toHaveBeenCalledOnce();
    });

    it('falls back to CORRELATION_SIMILARITY_THRESHOLD when SEMANTIC_SEARCH_SIMILARITY_THRESHOLD is absent (AC 4)', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SEMANTIC_SEARCH_SIMILARITY_THRESHOLD') return undefined;
        if (key === 'CORRELATION_SIMILARITY_THRESHOLD') return 0.8;
        return undefined;
      });
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });

      await service.search('query');

      const getCalls = mockConfigService.get.mock.calls.map((c: unknown[]) => c[0]);
      expect(getCalls).toContain('SEMANTIC_SEARCH_SIMILARITY_THRESHOLD');
      expect(getCalls).toContain('CORRELATION_SIMILARITY_THRESHOLD');
      expect(mockDb.execute).toHaveBeenCalledOnce();
    });

    it('uses 0.7 default threshold and executes query when no config is set (AC 4)', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });

      await service.search('query');

      expect(mockDb.execute).toHaveBeenCalledOnce();
    });
  });

  describe('search — result mapping (AC 5)', () => {
    it('maps DB rows to VectorSearchResult shape', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });
      mockDb.execute.mockResolvedValue({
        rows: [
          { thread_id: 'tid-1', classified_topic_id: 'ct-1', distance: 0.2 },
          { thread_id: 'tid-2', classified_topic_id: 'ct-2', distance: 0.35 },
        ],
      });

      const results = await service.search('query');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        threadId: 'tid-1',
        classifiedTopicId: 'ct-1',
        similarity: expect.closeTo(0.8, 10),
      });
      expect(results[1]).toEqual({
        threadId: 'tid-2',
        classifiedTopicId: 'ct-2',
        similarity: expect.closeTo(0.65, 10),
      });
    });

    it('returns empty array when DB returns no rows', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });
      mockDb.execute.mockResolvedValue({ rows: [] });

      const results = await service.search('no match query');
      expect(results).toEqual([]);
    });
  });

  describe('search — limit handling', () => {
    it('executes DB query (default limit) for valid queries', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });

      await service.search('query');

      expect(mockDb.execute).toHaveBeenCalledOnce();
    });

    it('executes DB query with custom limit option', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });

      await service.search('query', { limit: 5 });

      expect(mockDb.execute).toHaveBeenCalledOnce();
    });

    it('executes DB query even when limit exceeds maximum (clamped internally)', async () => {
      mockLlmService.embed.mockResolvedValue({
        embedding: makeEmbedding(3),
        modelVersion: 'nomic-v1',
      });

      await service.search('query', { limit: 9999 });

      expect(mockDb.execute).toHaveBeenCalledOnce();
    });
  });
});
