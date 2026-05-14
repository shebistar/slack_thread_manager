import { describe, expect, it, vi, beforeEach } from 'vitest';
import { searchKeys, useSearch } from './use-search.js';

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock('@/lib/api-client.js', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('use-search hook', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseQuery.mockReturnValue({ data: null });
  });

  it('searchKeys factory returns expected key structures', () => {
    expect(searchKeys.all).toEqual(['search']);
    expect(searchKeys.byQuery('hello')).toEqual(['search', { query: 'hello' }]);
  });

  it('useSearch passes correct query key', () => {
    useSearch('test query');
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['search', { query: 'test query' }],
      }),
    );
  });

  it('useSearch is disabled when query is empty', () => {
    useSearch('');
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  it('useSearch is enabled when query is non-empty', () => {
    useSearch('something');
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
      }),
    );
  });

  it('useSearch sets staleTime for caching repeat queries', () => {
    useSearch('cached query');
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        staleTime: 5 * 60 * 1000,
      }),
    );
  });

  it('queryFn unwraps the { data } envelope', async () => {
    const mockResponse = {
      results: [{ threadId: '1', threadHeadline: 'Test' }],
      meta: { total: 1, query: 'test', searchTimeMs: 50 },
    };
    const { api } = await import('@/lib/api-client.js');
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

    useSearch('test');
    const callArgs = mockUseQuery.mock.calls[0][0];
    const result = await callArgs.queryFn();
    expect(result).toEqual(mockResponse);
    expect(api.post).toHaveBeenCalledWith('/search', { query: 'test' });
  });
});
