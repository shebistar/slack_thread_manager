import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { EnrichmentService } from './enrichment.service.js';
import { EnrichmentCacheService } from './enrichment-cache.service.js';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { ENRICHMENT_SOURCES } from './enrichment-source.interface.js';
import type { EnrichmentSource } from './enrichment-source.interface.js';

describe('EnrichmentService', () => {
  let service: EnrichmentService;
  let mockSource1: EnrichmentSource;
  let mockSource2: EnrichmentSource;
  let mockSource3: EnrichmentSource;

  const mockCacheService = {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    invalidate: vi.fn(),
    clear: vi.fn(),
  };

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      { primaryTopic: 'OpenShift networking', plainSummary: 'Discussion about SDN' },
    ]),
  };

  beforeEach(async () => {
    mockSource1 = {
      name: 'Source1',
      query: vi.fn().mockResolvedValue({
        sections: [
          { title: 'Doc A', description: 'Desc A', sourceUrl: 'https://a.com', sourceType: 'OPENSHIFT_DOCS', relevanceScore: 0.9 },
        ],
      }),
    };
    mockSource2 = {
      name: 'Source2',
      query: vi.fn().mockResolvedValue({
        sections: [
          { title: 'KB Entry', description: 'Desc B', sourceUrl: 'https://b.com', sourceType: 'NOTEBOOKLM', relevanceScore: 0.8 },
        ],
      }),
    };
    mockSource3 = {
      name: 'Source3',
      query: vi.fn().mockResolvedValue({ sections: [] }),
    };

    const module = await Test.createTestingModule({
      providers: [
        EnrichmentService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: ENRICHMENT_SOURCES, useValue: [mockSource1, mockSource2, mockSource3] },
        { provide: EnrichmentCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<EnrichmentService>(EnrichmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('aggregates sections from all successful sources', async () => {
    const threadId = '11111111-1111-1111-1111-111111111111';
    const result = await service.getEnrichment(threadId);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]!.sourceType).toBe('OPENSHIFT_DOCS');
    expect(result.sections[1]!.sourceType).toBe('NOTEBOOKLM');
    expect(result.meta.sourcesAvailable).toBe(3);
    expect(result.meta.sourcesSucceeded).toBe(2);
  });

  it('returns valid empty payload when all sources return empty', async () => {
    (mockSource1.query as ReturnType<typeof vi.fn>).mockResolvedValue({ sections: [] });
    (mockSource2.query as ReturnType<typeof vi.fn>).mockResolvedValue({ sections: [] });

    const result = await service.getEnrichment('11111111-1111-1111-1111-111111111111');

    expect(result.sections).toEqual([]);
    expect(result.meta.sourcesSucceeded).toBe(0);
    expect(result.meta.sourcesAvailable).toBe(3);
  });

  it('handles partial failure — failed source does not block others', async () => {
    (mockSource2.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Timeout'));

    const result = await service.getEnrichment('11111111-1111-1111-1111-111111111111');

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.sourceType).toBe('OPENSHIFT_DOCS');
    expect(result.meta.sourcesSucceeded).toBe(1);
  });

  it('handles all sources failing gracefully', async () => {
    (mockSource1.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Fail 1'));
    (mockSource2.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Fail 2'));
    (mockSource3.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Fail 3'));

    const result = await service.getEnrichment('11111111-1111-1111-1111-111111111111');

    expect(result.sections).toEqual([]);
    expect(result.meta.sourcesSucceeded).toBe(0);
    expect(result.meta.threadId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('meta.queriedAt is a valid ISO datetime', async () => {
    const result = await service.getEnrichment('22222222-2222-2222-2222-222222222222');
    const date = new Date(result.meta.queriedAt);
    expect(date.toISOString()).toBe(result.meta.queriedAt);
  });

  it('builds query context from classified topic', async () => {
    await service.getEnrichment('11111111-1111-1111-1111-111111111111');

    expect(mockSource1.query).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      { primaryTopic: 'OpenShift networking', summary: 'Discussion about SDN' },
    );
  });

  it('gracefully handles missing classified topic', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const result = await service.getEnrichment('33333333-3333-3333-3333-333333333333');

    expect(result.sections).toBeDefined();
    expect(mockSource1.query).toHaveBeenCalledWith(
      '33333333-3333-3333-3333-333333333333',
      {},
    );
  });

  it('returns cached response on cache hit without querying sources', async () => {
    const cachedResponse = {
      sections: [{ title: 'Cached', description: 'From cache', sourceUrl: 'https://cached.com', sourceType: 'OPENSHIFT_DOCS' as const, relevanceScore: 0.9 }],
      meta: { threadId: '11111111-1111-1111-1111-111111111111', queriedAt: '2026-05-26T08:00:00.000Z', sourcesAvailable: 3, sourcesSucceeded: 1 },
    };
    mockCacheService.get.mockReturnValueOnce(cachedResponse);

    const result = await service.getEnrichment('11111111-1111-1111-1111-111111111111');

    expect(result).toBe(cachedResponse);
    expect(mockSource1.query).not.toHaveBeenCalled();
    expect(mockSource2.query).not.toHaveBeenCalled();
  });

  it('stores result in cache after successful query', async () => {
    await service.getEnrichment('11111111-1111-1111-1111-111111111111');

    expect(mockCacheService.set).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      expect.objectContaining({ sections: expect.any(Array), meta: expect.any(Object) }),
    );
  });
});
