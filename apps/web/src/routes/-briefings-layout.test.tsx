import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseTodayBriefing = vi.fn();
const mockUseMarkItemRead = vi.fn();
const mockUseSilenceAlerts = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => opts,
}));

vi.mock('@/hooks/use-briefings.js', () => ({
  useTodayBriefing: () => mockUseTodayBriefing(),
  useMarkItemRead: () => mockUseMarkItemRead(),
}));

vi.mock('@/hooks/use-silence.js', () => ({
  useSilenceAlerts: () => mockUseSilenceAlerts(),
  useDismissSilenceAlert: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/components/enrichment-panel/enrichment-panel.js', () => ({
  EnrichmentPanel: ({ threadId }: { threadId: string | null }) => (
    <div data-testid="enrichment-panel">{threadId ?? 'none'}</div>
  ),
}));

import { FeedLayout, SplitPanelLayout, DashboardLayout } from './briefings.js';

const sampleBriefingData = {
  briefing: {
    id: 'b1',
    userId: 'u1',
    briefingDate: '2026-06-28',
    briefingShape: 'filtered_brief',
    generatedAt: '2026-06-28T06:00:00Z',
    threadCount: 5,
    workstreamCount: 2,
  },
  items: [
    {
      id: 'item-1',
      briefingId: 'b1',
      threadId: 'thread-1',
      headline: 'Test topic',
      summaryText: 'Summary here',
      workstreamName: 'Platform',
      sourceThreadUrl: null,
      itemType: 'standard',
      sortOrder: 0,
      latestActivityAt: null,
      messageCount: 3,
      participantCount: 2,
    },
  ],
  readItemIds: [],
  nextBatchScheduledAt: null,
};

describe('briefings layout integration', () => {
  beforeEach(() => {
    mockUseMarkItemRead.mockReturnValue({ mutate: vi.fn() });
    mockUseSilenceAlerts.mockReturnValue({ data: { alerts: [] } });
    mockUseTodayBriefing.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: sampleBriefingData,
    });
  });

  describe('BriefingPageFrame renders correct header for each layout', () => {
    it('FeedLayout renders "Filtered Brief" badge', () => {
      render(<FeedLayout />);
      expect(screen.getByText('Filtered Brief')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Daily Briefing' })).toBeInTheDocument();
    });

    it('SplitPanelLayout renders "Lead Architect View" badge', () => {
      render(<SplitPanelLayout />);
      expect(screen.getByText('Lead Architect View')).toBeInTheDocument();
      expect(screen.getByText('Daily Briefing — Intelligence Report')).toBeInTheDocument();
    });

    it('DashboardLayout renders "Executive Scan" badge', () => {
      render(<DashboardLayout />);
      expect(screen.getByText('Executive Scan')).toBeInTheDocument();
      expect(screen.getByText('Briefing Dashboard')).toBeInTheDocument();
    });
  });

  describe('shared elements present in all layouts', () => {
    it('FeedLayout renders a visible h1 page title via BriefingPageFrame', () => {
      render(<FeedLayout />);
      const heading = screen.getByRole('heading', { level: 1, name: 'Daily Briefing' });
      expect(heading).toBeInTheDocument();
      expect(heading).not.toHaveClass('sr-only');
    });

    it('SplitPanelLayout renders a visible h1 page title via BriefingPageFrame', () => {
      render(<SplitPanelLayout />);
      const heading = screen.getByRole('heading', { level: 1, name: 'Daily Briefing — Intelligence Report' });
      expect(heading).toBeInTheDocument();
      expect(heading).not.toHaveClass('sr-only');
    });

    it('DashboardLayout renders a visible h1 page title via BriefingPageFrame', () => {
      render(<DashboardLayout />);
      const heading = screen.getByRole('heading', { level: 1, name: 'Briefing Dashboard' });
      expect(heading).toBeInTheDocument();
      expect(heading).not.toHaveClass('sr-only');
    });
  });

  describe('freshness metadata renders consistently', () => {
    it('FeedLayout shows thread count and workstream count', () => {
      render(<FeedLayout />);
      expect(screen.getByText(/5 threads across 2 workstreams/)).toBeInTheDocument();
    });

    it('SplitPanelLayout shows thread count and workstream count', () => {
      render(<SplitPanelLayout />);
      expect(screen.getByText(/5 threads across 2 workstreams/)).toBeInTheDocument();
    });

    it('DashboardLayout shows thread count and workstream count', () => {
      render(<DashboardLayout />);
      expect(screen.getByText(/5 threads across 2 workstreams/)).toBeInTheDocument();
    });
  });

  describe('loading state shows skeleton instead of freshness text', () => {
    beforeEach(() => {
      mockUseTodayBriefing.mockReturnValue({
        isLoading: true,
        isError: false,
        error: null,
        data: undefined,
      });
    });

    it('FeedLayout shows skeleton when loading', () => {
      const { container } = render(<FeedLayout />);
      expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
      expect(screen.queryByText(/threads across/)).not.toBeInTheDocument();
    });

    it('SplitPanelLayout shows skeleton when loading', () => {
      const { container } = render(<SplitPanelLayout />);
      expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
      expect(screen.queryByText(/threads across/)).not.toBeInTheDocument();
    });

    it('DashboardLayout shows skeleton when loading', () => {
      const { container } = render(<DashboardLayout />);
      expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
      expect(screen.queryByText(/threads across/)).not.toBeInTheDocument();
    });
  });
});
