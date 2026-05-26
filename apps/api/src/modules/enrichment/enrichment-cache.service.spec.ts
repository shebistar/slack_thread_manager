import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EnrichmentCacheService } from './enrichment-cache.service.js';
import type { EnrichmentResponse } from '@slack-thread-manager/shared';

describe('EnrichmentCacheService', () => {
  let cacheService: EnrichmentCacheService;

  const mockResponse: EnrichmentResponse = {
    sections: [
      { title: 'Test', description: 'Desc', sourceUrl: 'https://test.com', sourceType: 'OPENSHIFT_DOCS', relevanceScore: 0.9 },
    ],
    meta: {
      threadId: '11111111-1111-1111-1111-111111111111',
      queriedAt: '2026-05-26T09:00:00.000Z',
      sourcesAvailable: 3,
      sourcesSucceeded: 1,
    },
  };

  beforeEach(() => {
    cacheService = new EnrichmentCacheService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for cache miss', () => {
    const result = cacheService.get('nonexistent');
    expect(result).toBeNull();
  });

  it('returns cached response for same-day hit', () => {
    cacheService.set('thread-1', mockResponse);
    const result = cacheService.get('thread-1');
    expect(result).toBe(mockResponse);
  });

  it('invalidates cache for different day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T10:00:00Z'));

    cacheService.set('thread-1', mockResponse);

    vi.setSystemTime(new Date('2026-05-27T10:00:00Z'));

    const result = cacheService.get('thread-1');
    expect(result).toBeNull();
  });

  it('invalidate() removes specific entry', () => {
    cacheService.set('thread-1', mockResponse);
    expect(cacheService.get('thread-1')).not.toBeNull();

    cacheService.invalidate('thread-1');
    expect(cacheService.get('thread-1')).toBeNull();
  });

  it('clear() removes all entries', () => {
    cacheService.set('thread-1', mockResponse);
    cacheService.set('thread-2', mockResponse);
    expect(cacheService.size).toBe(2);

    cacheService.clear();
    expect(cacheService.size).toBe(0);
  });
});
