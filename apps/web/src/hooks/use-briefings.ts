import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client.js';

export interface BriefingItem {
  id: string;
  briefingId: string;
  threadId: string;
  headline: string;
  summaryText: string;
  workstreamName: string | null;
  sourceThreadUrl: string | null;
  itemType: string;
  sortOrder: number;
  latestActivityAt: string | null;
  messageCount: number | null;
  participantCount: number | null;
}

export interface Briefing {
  id: string;
  userId: string;
  briefingDate: string;
  briefingShape: string;
  generatedAt: string;
  threadCount: number;
  workstreamCount: number;
}

export interface BriefingWithItems {
  briefing: Briefing;
  items: BriefingItem[];
  readItemIds: string[];
  nextBatchScheduledAt: string | null;
}

const BRIEFINGS_KEY = ['briefings', 'today'] as const;

export function useTodayBriefing() {
  return useQuery({
    queryKey: BRIEFINGS_KEY,
    queryFn: () =>
      api
        .get<{ data: BriefingWithItems | null }>('/briefings/today')
        .then((r) => r.data),
  });
}

export function useMarkItemRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (briefingItemId: string) =>
      api
        .post<{ data: { briefingItemId: string; readAt: string } }>(
          `/briefings/items/${briefingItemId}/read`,
          {},
        )
        .then((r) => r.data),
    onMutate: async (briefingItemId) => {
      await queryClient.cancelQueries({ queryKey: BRIEFINGS_KEY });
      const previous = queryClient.getQueryData<BriefingWithItems | null>(BRIEFINGS_KEY);

      if (previous) {
        queryClient.setQueryData<BriefingWithItems | null>(BRIEFINGS_KEY, {
          ...previous,
          readItemIds: [...previous.readItemIds, briefingItemId],
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(BRIEFINGS_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BRIEFINGS_KEY });
    },
  });
}
