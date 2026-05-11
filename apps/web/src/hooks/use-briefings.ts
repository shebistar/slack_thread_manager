import { useQuery } from '@tanstack/react-query';
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
