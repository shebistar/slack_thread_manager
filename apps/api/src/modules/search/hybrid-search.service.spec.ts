import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HybridSearchService } from './hybrid-search.service.js';
import type { FtsResult } from './fts.service.js';
import type { VectorSearchResult } from './vector-search.service.js';

function makeConfigService(ftsWeight?: number, semanticWeight?: number) {
  return {
    get: vi.fn().mockImplementation((key: string) => {
      if (key === 'SEARCH_FTS_WEIGHT') return ftsWeight;
      if (key === 'SEARCH_SEMANTIC_WEIGHT') return semanticWeight;
      return undefined;
    }),
  };
}

describe('HybridSearchService', () => {
  let service: HybridSearchService;
  let mockConfigService: ReturnType<typeof makeConfigService>;

  async function buildService(ftsWeight?: number, semanticWeight?: number) {
    mockConfigService = makeConfigService(ftsWeight, semanticWeight);

    const module = await Test.createTestingModule({
      providers: [
        HybridSearchService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    return module.get<HybridSearchService>(HybridSearchService);
  }

  beforeEach(async () => {
    service = await buildService();
  });

  describe('edge cases — empty inputs', () => {
    it('returns empty array when both inputs are empty', () => {
      const result = service.merge([], []);
      expect(result).toEqual([]);
    });

    it('returns KEYWORD results when semantic results are empty', () => {
      const fts: FtsResult[] = [
        { threadId: 'tid-1', classifiedTopicId: 'ct-1', rank: 0.9 },
        { threadId: 'tid-2', classifiedTopicId: 'ct-2', rank: 0.5 },
      ];

      const result = service.merge(fts, []);

      expect(result).toHaveLength(2);
      result.forEach((r) => expect(r.matchType).toBe('KEYWORD'));
    });

    it('returns SEMANTIC results when FTS results are empty', () => {
      const semantic: VectorSearchResult[] = [
        { threadId: 'tid-1', classifiedTopicId: 'ct-1', similarity: 0.85 },
        { threadId: 'tid-2', classifiedTopicId: 'ct-2', similarity: 0.6 },
      ];

      const result = service.merge([], semantic);

      expect(result).toHaveLength(2);
      result.forEach((r) => expect(r.matchType).toBe('SEMANTIC'));
    });
  });

  describe('matchType tagging (AC 7)', () => {
    it('tags FTS-only results as KEYWORD', () => {
      const fts: FtsResult[] = [{ threadId: 'fts-only', classifiedTopicId: 'ct-1', rank: 0.8 }];
      const semantic: VectorSearchResult[] = [
        { threadId: 'sem-only', classifiedTopicId: 'ct-2', similarity: 0.75 },
      ];

      const result = service.merge(fts, semantic);

      const ftsResult = result.find((r) => r.threadId === 'fts-only');
      const semResult = result.find((r) => r.threadId === 'sem-only');

      expect(ftsResult?.matchType).toBe('KEYWORD');
      expect(semResult?.matchType).toBe('SEMANTIC');
    });

    it('tags threads appearing in both as BOTH (AC 7)', () => {
      const sharedThreadId = 'shared-tid';
      const fts: FtsResult[] = [{ threadId: sharedThreadId, classifiedTopicId: 'ct-1', rank: 0.8 }];
      const semantic: VectorSearchResult[] = [
        { threadId: sharedThreadId, classifiedTopicId: 'ct-1', similarity: 0.9 },
      ];

      const result = service.merge(fts, semantic);

      expect(result).toHaveLength(1);
      expect(result[0]?.matchType).toBe('BOTH');
    });

    it('deduplicates shared thread to single result (AC 7)', () => {
      const sharedId = 'dup-tid';
      const fts: FtsResult[] = [
        { threadId: sharedId, classifiedTopicId: 'ct-1', rank: 0.9 },
        { threadId: 'unique-fts', classifiedTopicId: 'ct-2', rank: 0.5 },
      ];
      const semantic: VectorSearchResult[] = [
        { threadId: sharedId, classifiedTopicId: 'ct-1', similarity: 0.8 },
        { threadId: 'unique-sem', classifiedTopicId: 'ct-3', similarity: 0.7 },
      ];

      const result = service.merge(fts, semantic);

      expect(result).toHaveLength(3);
      const deduplicated = result.filter((r) => r.threadId === sharedId);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]?.matchType).toBe('BOTH');
    });
  });

  describe('scoring and ranking (AC 6)', () => {
    it('uses default weights (FTS 0.4, semantic 0.6) when config returns undefined', () => {
      const fts: FtsResult[] = [{ threadId: 'tid-1', classifiedTopicId: 'ct-1', rank: 1.0 }];
      const semantic: VectorSearchResult[] = [
        { threadId: 'tid-2', classifiedTopicId: 'ct-2', similarity: 1.0 },
      ];

      const result = service.merge(fts, semantic);

      // tid-1: combinedScore = 0.4 * 1.0 + 0.6 * 0 = 0.4
      // tid-2: combinedScore = 0.4 * 0 + 0.6 * 1.0 = 0.6
      const ftsResult = result.find((r) => r.threadId === 'tid-1');
      const semResult = result.find((r) => r.threadId === 'tid-2');

      expect(ftsResult?.combinedScore).toBeCloseTo(0.4, 5);
      expect(semResult?.combinedScore).toBeCloseTo(0.6, 5);
    });

    it('configurable weights affect combined scores (AC 6)', async () => {
      // Use FTS-heavy weights
      const heavyFtsService = await buildService(0.9, 0.1);

      const fts: FtsResult[] = [{ threadId: 'tid-1', classifiedTopicId: 'ct-1', rank: 1.0 }];
      const semantic: VectorSearchResult[] = [
        { threadId: 'tid-2', classifiedTopicId: 'ct-2', similarity: 1.0 },
      ];

      const result = heavyFtsService.merge(fts, semantic);

      // tid-1: 0.9 * 1.0 + 0.1 * 0 = 0.9
      // tid-2: 0.9 * 0 + 0.1 * 1.0 = 0.1
      const ftsResult = result.find((r) => r.threadId === 'tid-1');
      const semResult = result.find((r) => r.threadId === 'tid-2');

      expect(ftsResult?.combinedScore).toBeCloseTo(0.9, 5);
      expect(semResult?.combinedScore).toBeCloseTo(0.1, 5);
    });

    it('normalizes FTS ranks relative to max rank in batch', () => {
      const fts: FtsResult[] = [
        { threadId: 'tid-1', classifiedTopicId: 'ct-1', rank: 0.8 },
        { threadId: 'tid-2', classifiedTopicId: 'ct-2', rank: 0.4 },
      ];

      const result = service.merge(fts, []);

      // normalizedRank for tid-1 = 0.8 / 0.8 = 1.0 → combined = 0.4 * 1.0 = 0.4
      // normalizedRank for tid-2 = 0.4 / 0.8 = 0.5 → combined = 0.4 * 0.5 = 0.2
      expect(result[0]?.threadId).toBe('tid-1');
      expect(result[0]?.combinedScore).toBeCloseTo(0.4, 5);
      expect(result[1]?.threadId).toBe('tid-2');
      expect(result[1]?.combinedScore).toBeCloseTo(0.2, 5);
    });

    it('sorts merged results by combined score descending', () => {
      const fts: FtsResult[] = [{ threadId: 'low-fts', classifiedTopicId: 'ct-1', rank: 0.1 }];
      const semantic: VectorSearchResult[] = [
        { threadId: 'high-sem', classifiedTopicId: 'ct-2', similarity: 0.95 },
        { threadId: 'mid-sem', classifiedTopicId: 'ct-3', similarity: 0.5 },
      ];

      const result = service.merge(fts, semantic);

      // high-sem: 0.6 * 0.95 = 0.57
      // mid-sem:  0.6 * 0.5  = 0.30
      // low-fts:  0.4 * 1.0  = 0.40
      expect(result[0]?.threadId).toBe('high-sem');
      expect(result[1]?.threadId).toBe('low-fts');
      expect(result[2]?.threadId).toBe('mid-sem');
    });
  });

  describe('score presence on results', () => {
    it('includes ftsScore for KEYWORD matches', () => {
      const fts: FtsResult[] = [{ threadId: 'tid-1', classifiedTopicId: 'ct-1', rank: 0.8 }];
      const result = service.merge(fts, []);
      expect(result[0]).toHaveProperty('ftsScore');
      expect(result[0]).not.toHaveProperty('semanticScore');
    });

    it('includes semanticScore for SEMANTIC matches', () => {
      const semantic: VectorSearchResult[] = [
        { threadId: 'tid-1', classifiedTopicId: 'ct-1', similarity: 0.9 },
      ];
      const result = service.merge([], semantic);
      expect(result[0]).toHaveProperty('semanticScore');
      expect(result[0]).not.toHaveProperty('ftsScore');
    });

    it('includes both ftsScore and semanticScore for BOTH matches', () => {
      const fts: FtsResult[] = [{ threadId: 'tid-1', classifiedTopicId: 'ct-1', rank: 0.8 }];
      const semantic: VectorSearchResult[] = [
        { threadId: 'tid-1', classifiedTopicId: 'ct-1', similarity: 0.9 },
      ];
      const result = service.merge(fts, semantic);
      expect(result[0]).toHaveProperty('ftsScore');
      expect(result[0]).toHaveProperty('semanticScore');
    });
  });

  describe('classifiedTopicId propagation', () => {
    it('uses FTS classifiedTopicId for KEYWORD results', () => {
      const fts: FtsResult[] = [{ threadId: 'tid-1', classifiedTopicId: 'ct-fts', rank: 0.5 }];
      const result = service.merge(fts, []);
      expect(result[0]?.classifiedTopicId).toBe('ct-fts');
    });

    it('uses semantic classifiedTopicId for SEMANTIC results', () => {
      const semantic: VectorSearchResult[] = [
        { threadId: 'tid-1', classifiedTopicId: 'ct-sem', similarity: 0.8 },
      ];
      const result = service.merge([], semantic);
      expect(result[0]?.classifiedTopicId).toBe('ct-sem');
    });
  });
});
