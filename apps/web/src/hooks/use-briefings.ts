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

export interface BriefingHistoryItem {
  id: string;
  briefingDate: string;
  briefingShape: string;
  threadCount: number;
  workstreamCount: number;
  generatedAt: string;
}

export const briefingKeys = {
  all: ['briefings'] as const,
  today: () => [...briefingKeys.all, 'today'] as const,
  detail: (id: string) => [...briefingKeys.all, 'detail', id] as const,
  details: () => [...briefingKeys.all, 'detail'] as const,
  history: (days?: number) => [...briefingKeys.all, 'history', { days: days ?? 7 }] as const,
};

export function useTodayBriefing() {
  return useQuery({
    queryKey: briefingKeys.today(),
    queryFn: () =>
      api
        .get<{ data: BriefingWithItems | null }>('/briefings/today')
        .then((r) => r.data),
  });
}

export function useBriefingById(id: string | undefined) {
  return useQuery({
    queryKey: briefingKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: () =>
      api
        .get<{ data: Omit<BriefingWithItems, 'nextBatchScheduledAt'> }>(`/briefings/${id}`)
        .then((r) => (r.data ? { ...r.data, nextBatchScheduledAt: null } : null)),
  });
}

export function useBriefingHistory(days?: number) {
  const effectiveDays = days ?? 7;
  return useQuery({
    queryKey: briefingKeys.history(effectiveDays),
    queryFn: () =>
      api
        .get<{ data: { briefings: BriefingHistoryItem[] } }>(`/briefings/history?days=${effectiveDays}`)
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
      await queryClient.cancelQueries({ queryKey: briefingKeys.today() });
      const previous = queryClient.getQueryData<BriefingWithItems | null>(briefingKeys.today());

      if (previous) {
        queryClient.setQueryData<BriefingWithItems | null>(briefingKeys.today(), {
          ...previous,
          readItemIds: Array.from(new Set([...(previous.readItemIds ?? []), briefingItemId])),
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(briefingKeys.today(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: briefingKeys.today() });
      void queryClient.invalidateQueries({ queryKey: briefingKeys.details() });
    },
  });
}
