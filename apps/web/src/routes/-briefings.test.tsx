import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefingItem } from '@/hooks/use-briefings.js';

const mockUseTodayBriefing = vi.fn();
const mockUseMarkItemRead = vi.fn();
const mockUseSilenceAlerts = vi.fn();
const markMutate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => opts,
}));

vi.mock('@/hooks/use-briefings.js', () => ({
  useTodayBriefing: () => mockUseTodayBriefing(),
  useMarkItemRead: () => mockUseMarkItemRead(),
}));

vi.mock('@/hooks/use-silence.js', () => ({
  useSilenceAlerts: () => mockUseSilenceAlerts(),
}));

vi.mock('@/components/enrichment-panel/enrichment-panel.js', () => ({
  EnrichmentPanel: ({ threadId }: { threadId: string | null }) => (
    <div data-testid="enrichment-panel">{threadId ?? 'none'}</div>
  ),
}));

import { FeedLayout, SplitPanelLayout, partitionItems } from './briefings.js';

const sampleBriefing = {
  briefing: {
    id: 'briefing-1',
    userId: 'user-1',
    briefingDate: '2026-05-27',
    briefingShape: 'INTELLIGENCE_REPORT',
    generatedAt: '2026-05-27T08:00:00.000Z',
    threadCount: 3,
    workstreamCount: 1,
  },
  readItemIds: [],
  nextBatchScheduledAt: null,
};

describe('briefings route backfill wiring', () => {
  beforeEach(() => {
    markMutate.mockReset();
    mockUseMarkItemRead.mockReturnValue({ mutate: markMutate });
    mockUseSilenceAlerts.mockReturnValue({ data: { alerts: [] } });
  });

  it('FeedLayout renders backfill section when backfill items exist', () => {
    mockUseTodayBriefing.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: {
        ...sampleBriefing,
        items: [
          {
            id: 'backfill-1',
            briefingId: 'briefing-1',
            threadId: 'thread-1',
            headline: 'Backfill item',
            summaryText: 'Historical context',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
            itemType: 'backfill',
            sortOrder: 0,
            latestActivityAt: null,
            messageCount: 2,
            participantCount: 1,
          },
          {
            id: 'daily-1',
            briefingId: 'briefing-1',
            threadId: 'thread-2',
            headline: 'Daily item',
            summaryText: 'Today update',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
            itemType: 'standard',
            sortOrder: 1,
            latestActivityAt: null,
            messageCount: 4,
            participantCount: 2,
          },
        ],
      },
    });

    render(<FeedLayout />);
    expect(screen.getByText(/since you joined:/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /today's briefing/i })).toBeInTheDocument();
  });

  it('SplitPanelLayout renders backfill section and supports selectable backfill cards', async () => {
    const user = userEvent.setup();
    mockUseTodayBriefing.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: {
        ...sampleBriefing,
        items: [
          {
            id: 'backfill-1',
            briefingId: 'briefing-1',
            threadId: 'thread-1',
            headline: 'Backfill selectable',
            summaryText: 'Historical context',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
            itemType: 'backfill',
            sortOrder: 0,
            latestActivityAt: null,
            messageCount: 2,
            participantCount: 1,
          },
          {
            id: 'daily-1',
            briefingId: 'briefing-1',
            threadId: 'thread-2',
            headline: 'Daily item',
            summaryText: 'Today update',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
            itemType: 'standard',
            sortOrder: 1,
            latestActivityAt: null,
            messageCount: 4,
            participantCount: 2,
          },
        ],
      },
    });

    render(<SplitPanelLayout />);
    expect(screen.getByText(/since you joined:/i)).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /backfill selectable/i }));
    expect(markMutate).toHaveBeenCalledWith('backfill-1');
  });

  it('does not render backfill section when no backfill items exist', () => {
    mockUseTodayBriefing.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: {
        ...sampleBriefing,
        items: [
          {
            id: 'daily-1',
            briefingId: 'briefing-1',
            threadId: 'thread-2',
            headline: 'Daily item only',
            summaryText: 'Today update',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
            itemType: 'standard',
            sortOrder: 1,
            latestActivityAt: null,
            messageCount: 4,
            participantCount: 2,
          },
        ],
      },
    });

    render(<FeedLayout />);
    expect(screen.queryByText(/since you joined:/i)).not.toBeInTheDocument();
  });

  it('partitionItems separates backfill from daily items', () => {
    const mkItem = (id: string, itemType: string): BriefingItem => ({
      id,
      briefingId: 'briefing-1',
      threadId: `thread-${id}`,
      headline: `Item ${id}`,
      summaryText: 'Summary',
      workstreamName: 'Platform',
      sourceThreadUrl: null,
      itemType,
      sortOrder: 0,
      latestActivityAt: null,
      messageCount: null,
      participantCount: null,
    });

    const items: BriefingItem[] = [
      mkItem('1', 'backfill'),
      mkItem('2', 'standard'),
      mkItem('3', 'BACKFILL'),
      mkItem('4', 'cross_workstream'),
    ];

    const { backfillItems, dailyItems } = partitionItems(items);

    expect(backfillItems.map((i) => i.id)).toEqual(['1', '3']);
    expect(dailyItems.map((i) => i.id)).toEqual(['2', '4']);
  });
});
