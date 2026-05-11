import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatsBar } from './stats-bar.js';
import type { BriefingWithItems } from '@/hooks/use-briefings.js';

const mockData: BriefingWithItems = {
  briefing: {
    id: 'b-1',
    userId: 'user-1',
    briefingDate: '2026-05-11',
    briefingShape: 'executive_scan',
    generatedAt: new Date().toISOString(),
    threadCount: 12,
    workstreamCount: 4,
  },
  nextBatchScheduledAt: new Date().toISOString(),
  items: [
    { id: 'i-1', briefingId: 'b-1', threadId: 't-1', headline: 'h1', summaryText: 's1', workstreamName: 'Eng', sourceThreadUrl: null, itemType: 'standard', sortOrder: 0, latestActivityAt: null },
    { id: 'i-2', briefingId: 'b-1', threadId: 't-2', headline: 'h2', summaryText: 's2', workstreamName: 'Sales', sourceThreadUrl: null, itemType: 'cross_workstream', sortOrder: 1, latestActivityAt: null },
    { id: 'i-3', briefingId: 'b-1', threadId: 't-3', headline: 'h3', summaryText: 's3', workstreamName: 'Eng', sourceThreadUrl: null, itemType: 'orphaned_action', sortOrder: 2, latestActivityAt: null },
    { id: 'i-4', briefingId: 'b-1', threadId: 't-4', headline: 'h4', summaryText: 's4', workstreamName: null, sourceThreadUrl: null, itemType: 'gone_quiet', sortOrder: 3, latestActivityAt: null },
  ],
};

describe('StatsBar', () => {
  it('renders 4 stat cells with correct values', () => {
    render(<StatsBar data={mockData} isLoading={false} />);

    expect(screen.getByLabelText('Threads Processed: 12')).toBeInTheDocument();
    expect(screen.getByLabelText('Active Workstreams: 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Gone Quiet: 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Flags Raised: 2')).toBeInTheDocument();
  });

  it('renders skeleton state when loading', () => {
    const { container } = render(<StatsBar data={undefined} isLoading={true} />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it('renders zero-state when data is null', () => {
    render(<StatsBar data={null} isLoading={false} />);
    expect(screen.getByText('No briefing data')).toBeInTheDocument();
  });

  it('shows 0 for gone_quiet and flags when no special item types exist', () => {
    const noSpecialData: BriefingWithItems = {
      ...mockData,
      items: [
        { id: 'i-1', briefingId: 'b-1', threadId: 't-1', headline: 'h1', summaryText: 's1', workstreamName: 'Eng', sourceThreadUrl: null, itemType: 'standard', sortOrder: 0, latestActivityAt: null },
      ],
    };
    render(<StatsBar data={noSpecialData} isLoading={false} />);
    expect(screen.getByLabelText('Gone Quiet: 0')).toBeInTheDocument();
    expect(screen.getByLabelText('Flags Raised: 0')).toBeInTheDocument();
  });

  it('uses role="status" for each stat cell', () => {
    render(<StatsBar data={mockData} isLoading={false} />);
    const statusElements = screen.getAllByRole('status');
    expect(statusElements).toHaveLength(4);
  });
});
