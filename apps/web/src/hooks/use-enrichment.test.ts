import { describe, expect, it, vi, beforeEach } from 'vitest';
import { enrichmentKeys, useEnrichment } from './use-enrichment.js';

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock('@/lib/api-client.js', () => ({
  api: {
    get: vi.fn(),
  },
}));

describe('use-enrichment hook', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseQuery.mockReturnValue({ data: null });
  });

  it('enrichmentKeys factory returns expected key structures', () => {
    expect(enrichmentKeys.all).toEqual(['enrichment']);
    expect(enrichmentKeys.byThread('abc-123')).toEqual(['enrichment', { threadId: 'abc-123' }]);
  });

  it('useEnrichment passes correct query key', () => {
    useEnrichment('thread-id-1');
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['enrichment', { threadId: 'thread-id-1' }],
      }),
    );
  });

  it('useEnrichment is disabled when threadId is null', () => {
    useEnrichment(null);
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  it('useEnrichment is enabled when threadId is provided', () => {
    useEnrichment('some-thread-id');
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
      }),
    );
  });

  it('useEnrichment sets staleTime for caching', () => {
    useEnrichment('thread-1');
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        staleTime: 5 * 60 * 1000,
      }),
    );
  });

  it('queryFn unwraps the { data } envelope', async () => {
    const mockResponse = {
      sections: [{ title: 'Doc', description: 'Desc', sourceUrl: 'https://example.com', sourceType: 'OPENSHIFT_DOCS', relevanceScore: 0.9 }],
      meta: { threadId: 'thread-1', queriedAt: '2026-05-26T09:00:00.000Z', sourcesAvailable: 3, sourcesSucceeded: 1 },
    };
    const { api } = await import('@/lib/api-client.js');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

    useEnrichment('thread-1');
    const callArgs = mockUseQuery.mock.calls[0][0];
    const result = await callArgs.queryFn();
    expect(result).toEqual(mockResponse);
    expect(api.get).toHaveBeenCalledWith('/enrichment/thread-1');
  });

  it('queryFn propagates API errors', async () => {
    const { api } = await import('@/lib/api-client.js');
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API 500'));

    useEnrichment('thread-1');
    const callArgs = mockUseQuery.mock.calls[0][0];

    await expect(callArgs.queryFn()).rejects.toThrow('API 500');
    expect(api.get).toHaveBeenCalledWith('/enrichment/thread-1');
  });
});
