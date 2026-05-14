import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client.js';
import type { SearchResponse } from '@slack-thread-manager/shared';

export const searchKeys = {
  all: ['search'] as const,
  byQuery: (query: string) => [...searchKeys.all, { query }] as const,
};

export function useSearch(query: string) {
  return useQuery({
    queryKey: searchKeys.byQuery(query),
    enabled: !!query,
    queryFn: () =>
      api
        .post<{ data: SearchResponse }>('/search', { query })
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}
