import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BackfillSection } from './backfill-section.js';

const baseItem = {
  briefingId: 'briefing-1',
  threadId: 'thread-1',
  itemType: 'backfill',
  sortOrder: 0,
  latestActivityAt: '2026-05-27T12:00:00.000Z',
  messageCount: 3,
  participantCount: 2,
};

describe('BackfillSection', () => {
  it('renders heading with workstream names and onboarding badge', () => {
    render(
      <BackfillSection
        items={[
          {
            ...baseItem,
            id: 'item-1',
            headline: 'Decision A',
            summaryText: 'Summary A',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
          },
          {
            ...baseItem,
            id: 'item-2',
            headline: 'Decision B',
            summaryText: 'Summary B',
            workstreamName: 'Infrastructure',
            sourceThreadUrl: null,
          },
        ]}
        readItemIds={[]}
        onMarkRead={vi.fn()}
        variant="feed"
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: /since you joined: key context from platform, infrastructure/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });

  it('renders backfill cards and today separator', () => {
    render(
      <BackfillSection
        items={[
          {
            ...baseItem,
            id: 'item-1',
            headline: 'Historical Card',
            summaryText: 'Summary',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
          },
        ]}
        readItemIds={[]}
        onMarkRead={vi.fn()}
        variant="feed"
      />,
    );

    expect(screen.getByText('Historical Card')).toBeInTheDocument();
    expect(screen.getByText('Historical')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /today's briefing/i })).toBeInTheDocument();
  });

  it('shows empty state under today separator when requested', () => {
    render(
      <BackfillSection
        items={[
          {
            ...baseItem,
            id: 'item-1',
            headline: 'Only Backfill',
            summaryText: 'Summary',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
          },
        ]}
        readItemIds={[]}
        onMarkRead={vi.fn()}
        variant="feed"
        showDailyEmptyState
      />,
    );

    expect(
      screen.getByText('No new briefing items for today. Check back after the next batch.'),
    ).toBeInTheDocument();
  });

  it('returns null when no backfill items are provided', () => {
    const { container } = render(
      <BackfillSection items={[]} readItemIds={[]} onMarkRead={vi.fn()} variant="feed" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('marks read items with opacity styling', () => {
    const { container } = render(
      <BackfillSection
        items={[
          {
            ...baseItem,
            id: 'item-read',
            headline: 'Read Historical Item',
            summaryText: 'Summary',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
          },
        ]}
        readItemIds={['item-read']}
        onMarkRead={vi.fn()}
        variant="feed"
      />,
    );

    expect(screen.getByText('Read Historical Item')).toBeInTheDocument();
    expect(container.innerHTML).toContain('opacity-60');
  });

  it('supports split-panel item selection callbacks', async () => {
    const user = userEvent.setup();
    const onSelectItem = vi.fn();
    const onMarkRead = vi.fn();
    render(
      <BackfillSection
        items={[
          {
            ...baseItem,
            id: 'item-1',
            headline: 'Selectable Backfill',
            summaryText: 'Summary',
            workstreamName: 'Platform',
            sourceThreadUrl: null,
          },
        ]}
        readItemIds={[]}
        onMarkRead={onMarkRead}
        variant="split-panel"
        onSelectItem={onSelectItem}
      />,
    );

    await user.click(screen.getByRole('option'));
    expect(onSelectItem).toHaveBeenCalledWith('item-1');
    expect(onMarkRead).not.toHaveBeenCalled();
  });
});
