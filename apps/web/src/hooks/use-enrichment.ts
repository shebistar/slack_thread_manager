import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client.js';
import type { EnrichmentResponse } from '@slack-thread-manager/shared';

export const enrichmentKeys = {
  all: ['enrichment'] as const,
  byThread: (threadId: string) => [...enrichmentKeys.all, { threadId }] as const,
};

export function useEnrichment(threadId: string | null) {
  return useQuery({
    queryKey: enrichmentKeys.byThread(threadId ?? ''),
    enabled: !!threadId,
    queryFn: () =>
      api
        .get<{ data: EnrichmentResponse }>(`/enrichment/${threadId}`)
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}
