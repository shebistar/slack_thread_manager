import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BriefingPageFrame } from './briefing-page-frame.js';
import type { BriefingWithItems } from '@/hooks/use-briefings.js';

const mockBriefingData: BriefingWithItems = {
  briefing: {
    id: 'b1',
    userId: 'u1',
    briefingDate: '2026-06-28',
    briefingShape: 'filtered_brief',
    generatedAt: '2026-06-28T06:00:00Z',
    threadCount: 12,
    workstreamCount: 3,
  },
  items: [],
  readItemIds: [],
  nextBatchScheduledAt: null,
};

describe('BriefingPageFrame', () => {
  it('renders title and layout label badge', () => {
    render(
      <BriefingPageFrame
        title="Daily Briefing"
        layoutLabel="Filtered Brief"
        briefingData={mockBriefingData}
        isLoading={false}
      >
        <div>content</div>
      </BriefingPageFrame>,
    );

    expect(screen.getByText('Daily Briefing')).toBeInTheDocument();
    expect(screen.getByText('Filtered Brief')).toBeInTheDocument();
  });

  it('renders the page title as an h1 (semantic page heading)', () => {
    render(
      <BriefingPageFrame
        title="Daily Briefing"
        layoutLabel="Filtered Brief"
        briefingData={null}
        isLoading={false}
      >
        <div>content</div>
      </BriefingPageFrame>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Daily Briefing' })).toBeInTheDocument();
  });

  it('renders freshness text when briefingData is provided', () => {
    render(
      <BriefingPageFrame
        title="Daily Briefing"
        layoutLabel="Filtered Brief"
        briefingData={mockBriefingData}
        isLoading={false}
      >
        <div>content</div>
      </BriefingPageFrame>,
    );

    expect(screen.getByText(/12 threads across 3 workstreams/)).toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    const { container } = render(
      <BriefingPageFrame
        title="Daily Briefing"
        layoutLabel="Filtered Brief"
        briefingData={undefined}
        isLoading={true}
      >
        <div>content</div>
      </BriefingPageFrame>,
    );

    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toBeInTheDocument();
    expect(screen.queryByText(/threads across/)).not.toBeInTheDocument();
  });

  it('omits freshness text when briefingData is null', () => {
    render(
      <BriefingPageFrame
        title="Briefing Dashboard"
        layoutLabel="Executive Scan"
        briefingData={null}
        isLoading={false}
      >
        <div>content</div>
      </BriefingPageFrame>,
    );

    expect(screen.getByText('Briefing Dashboard')).toBeInTheDocument();
    expect(screen.queryByText(/threads across/)).not.toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <BriefingPageFrame
        title="Daily Briefing"
        layoutLabel="Filtered Brief"
        briefingData={null}
        isLoading={false}
      >
        <div data-testid="child-content">Hello World</div>
      </BriefingPageFrame>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('has the brand-red bottom border accent', () => {
    const { container } = render(
      <BriefingPageFrame
        title="Daily Briefing"
        layoutLabel="Filtered Brief"
        briefingData={null}
        isLoading={false}
      >
        <div>content</div>
      </BriefingPageFrame>,
    );

    const headerBar = container.querySelector('.border-b-\\[--color-brand-red\\]');
    expect(headerBar).toBeInTheDocument();
  });

  it('wraps the page-frame header bar in a <header> element containing the h1', () => {
    const { container } = render(
      <BriefingPageFrame
        title="Daily Briefing"
        layoutLabel="Filtered Brief"
        briefingData={null}
        isLoading={false}
      >
        <div>content</div>
      </BriefingPageFrame>,
    );

    const headerEl = container.querySelector('header');
    expect(headerEl).toBeInTheDocument();
    expect(within(headerEl!).getByRole('heading', { level: 1, name: 'Daily Briefing' })).toBeInTheDocument();
  });
});
