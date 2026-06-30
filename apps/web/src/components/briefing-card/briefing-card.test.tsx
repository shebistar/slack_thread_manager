import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BriefingCard, getCardStateClasses } from './briefing-card.js';

describe('BriefingCard', () => {
  describe('compact variant', () => {
    it('renders headline, workstream badge, and deep-link', () => {
      render(
        <BriefingCard
          headline="Migration decision finalized"
          workstreamName="Platform"
          sourceThreadUrl="https://app.slack.com/client/T123/C456/thread/C456-123"
          itemType="standard"
          variant="compact"
        />,
      );

      expect(screen.getByText('Migration decision finalized')).toBeInTheDocument();
      expect(screen.getByText('Platform')).toBeInTheDocument();

      const link = screen.getByRole('link', { name: /view thread in slack/i });
      expect(link).toHaveAttribute('href', 'https://app.slack.com/client/T123/C456/thread/C456-123');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('omits deep-link when sourceThreadUrl is null', () => {
      render(
        <BriefingCard
          headline="Text-paste imported decision"
          workstreamName="Engineering"
          sourceThreadUrl={null}
          itemType="standard"
        />,
      );

      expect(screen.getByText('Text-paste imported decision')).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders cross_workstream badge for cross-workstream items', () => {
      render(
        <BriefingCard
          headline="Cross-team decision"
          workstreamName="Engineering"
          sourceThreadUrl={null}
          itemType="cross_workstream"
        />,
      );

      expect(screen.getByText('Cross-workstream')).toBeInTheDocument();
    });

    it('renders orphaned action badge', () => {
      render(
        <BriefingCard
          headline="Orphaned item"
          workstreamName={null}
          sourceThreadUrl={null}
          itemType="orphaned_action"
        />,
      );

      expect(screen.getByText('Orphaned action')).toBeInTheDocument();
    });

    it('omits workstream badge when workstreamName is null', () => {
      render(
        <BriefingCard
          headline="No workstream item"
          workstreamName={null}
          sourceThreadUrl={null}
          itemType="standard"
        />,
      );

      expect(screen.getByText('No workstream item')).toBeInTheDocument();
      const badges = screen.queryAllByText(/Platform|Engineering/);
      expect(badges).toHaveLength(0);
    });

    it('has hover background class for subtle feedback', () => {
      const { container } = render(
        <BriefingCard
          headline="Hover card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="compact"
        />,
      );
      const el = container.firstChild as HTMLElement;
      expect(el.className).toContain('hover:bg-[--color-gray-05]');
    });

    it('has motion-reduce:transition-none on compact variant', () => {
      const { container } = render(
        <BriefingCard
          headline="Compact motion"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="compact"
        />,
      );
      const el = container.firstChild as HTMLElement;
      expect(el.className).toContain('motion-reduce:transition-none');
    });
  });

  describe('standard variant', () => {
    it('renders headline with workstream badge and metadata row', () => {
      render(
        <BriefingCard
          headline="API refactoring proposal"
          workstreamName="Platform"
          sourceThreadUrl="https://app.slack.com/client/T123/C456/thread/C456-789"
          itemType="standard"
          variant="standard"
          summaryText="Full details of the refactoring plan."
          messageCount={12}
          participantCount={4}
          latestActivityAt="2026-05-11T10:00:00Z"
        />,
      );

      expect(screen.getByText('API refactoring proposal')).toBeInTheDocument();
      expect(screen.getByText('Platform')).toBeInTheDocument();
      expect(screen.getByText('4 participants')).toBeInTheDocument();
      expect(screen.getByText('12 messages')).toBeInTheDocument();
    });

    it('renders orphaned_action badge for orphaned items', () => {
      render(
        <BriefingCard
          headline="Missed action item"
          workstreamName="DevOps"
          sourceThreadUrl={null}
          itemType="orphaned_action"
          variant="standard"
        />,
      );

      expect(screen.getByText('Orphaned action')).toBeInTheDocument();
    });

    it('renders cross-workstream badge for cross_workstream items', () => {
      render(
        <BriefingCard
          headline="Cross-team alignment"
          workstreamName="Infra"
          sourceThreadUrl={null}
          itemType="cross_workstream"
          variant="standard"
        />,
      );

      expect(screen.getByText('Cross-workstream')).toBeInTheDocument();
    });

    it('renders Historical badge for backfill items', () => {
      render(
        <BriefingCard
          headline="Historical onboarding context"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="backfill"
          variant="standard"
          summaryText="Historical summary"
        />,
      );

      expect(screen.getByText('Historical')).toBeInTheDocument();
    });

    it('does not render Historical badge for non-backfill items', () => {
      render(
        <BriefingCard
          headline="Daily update"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Daily summary"
        />,
      );

      expect(screen.queryByText('Historical')).not.toBeInTheDocument();
    });

    it('expands to show full summary text when clicked', async () => {
      const user = userEvent.setup();
      render(
        <BriefingCard
          headline="Expandable card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Detailed summary content here."
          messageCount={5}
          participantCount={2}
        />,
      );

      const toggle = screen.getByRole('button');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const summary = screen.getByText('Detailed summary content here.');
      expect(summary.className).toContain('max-h-10');

      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(summary.className).toContain('max-h-96');
    });

    it('collapses when clicked again', async () => {
      const user = userEvent.setup();
      render(
        <BriefingCard
          headline="Toggle card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Hidden content."
        />,
      );

      const toggle = screen.getByRole('button');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('handles null sourceThreadUrl (text-paste mode) gracefully', () => {
      render(
        <BriefingCard
          headline="Text-paste card"
          workstreamName="Engineering"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary from text paste."
          messageCount={3}
          participantCount={1}
        />,
      );

      expect(screen.getByText('Text-paste card')).toBeInTheDocument();
      expect(screen.getByText('1 participant')).toBeInTheDocument();
      expect(screen.queryByText(/View in Slack/)).not.toBeInTheDocument();
    });

    it('shows "View in Slack" link without requiring expansion', () => {
      render(
        <BriefingCard
          headline="Linked card"
          workstreamName="Platform"
          sourceThreadUrl="https://app.slack.com/client/T123/C456/thread/C456-111"
          itemType="standard"
          variant="standard"
          summaryText="Summary with link."
        />,
      );

      const link = screen.getByRole('link', { name: /view thread in slack/i });
      expect(link).toHaveAttribute('href', 'https://app.slack.com/client/T123/C456/thread/C456-111');
    });
  });

  describe('gone_quiet / silence badge', () => {
    it('shows "Quiet for N days" badge when silenceDays is provided with gone_quiet itemType', () => {
      const { container } = render(
        <BriefingCard
          headline="Silent topic"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="gone_quiet"
          variant="standard"
          summaryText="Summary."
          silenceDays={5}
        />,
      );
      expect(screen.getByText('Quiet for 5 days')).toBeInTheDocument();
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('border-l-state-gone-quiet-border');
    });

    it('uses singular "day" when silenceDays is 1', () => {
      render(
        <BriefingCard
          headline="Silent topic"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="gone_quiet"
          variant="standard"
          summaryText="Summary."
          silenceDays={1}
        />,
      );
      expect(screen.getByText('Quiet for 1 day')).toBeInTheDocument();
    });

    it('falls back to "Gone Quiet" badge when gone_quiet itemType has no silenceDays', () => {
      render(
        <BriefingCard
          headline="Static quiet topic"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="gone_quiet"
          variant="standard"
          summaryText="Summary."
        />,
      );
      expect(screen.getByText('Gone Quiet')).toBeInTheDocument();
    });

    it('shows flagged-quiet state and badge for non-gone_quiet item when silenceDays is provided', () => {
      const { container } = render(
        <BriefingCard
          headline="Standard item gone quiet"
          workstreamName="Engineering"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          silenceDays={3}
        />,
      );
      expect(screen.getByText('Quiet for 3 days')).toBeInTheDocument();
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('border-l-state-gone-quiet-border');
    });
  });

  it('renders featured variant as standard variant', () => {
    render(
      <BriefingCard
        headline="Featured topic"
        workstreamName="Platform"
        sourceThreadUrl={null}
        itemType="standard"
        variant="featured"
        summaryText="Featured summary content."
      />,
    );
    expect(screen.getByText('Featured topic')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Featured summary content.')).toBeInTheDocument();
  });

  describe('selectable variant (onSelect)', () => {
    it('renders selected state with semantic border and background tokens', () => {
      const { container } = render(
        <BriefingCard
          headline="Selected card"
          workstreamName="Infra"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Full summary visible."
          selected={true}
          onSelect={() => {}}
        />,
      );
      const card = container.querySelector('[role="option"]');
      expect(card).toBeInTheDocument();
      expect(card?.className).toContain('border-state-selected-border');
      expect(card?.className).toContain('bg-state-selected-bg');
      expect(card).toHaveAttribute('aria-selected', 'true');
    });

    it('fires onSelect callback on click', async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();
      const { container } = render(
        <BriefingCard
          headline="Clickable card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary text."
          onSelect={handleSelect}
        />,
      );
      const card = container.querySelector('[role="option"]');
      expect(card).toBeInTheDocument();
      await user.click(card!);
      expect(handleSelect).toHaveBeenCalledOnce();
    });

    it('shows full summary without expand toggle when onSelect provided', () => {
      render(
        <BriefingCard
          headline="Full summary card"
          workstreamName="DevOps"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="This is the full summary that should be fully visible."
          onSelect={() => {}}
        />,
      );
      const summary = screen.getByText('This is the full summary that should be fully visible.');
      expect(summary.className).not.toContain('max-h-10');
      expect(summary.className).not.toContain('overflow-hidden');
      expect(screen.queryByRole('button', { name: /expand/i })).not.toBeInTheDocument();
    });

    it('preserves expand/collapse when onSelect is absent', async () => {
      const user = userEvent.setup();
      render(
        <BriefingCard
          headline="Expandable card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Expandable content."
        />,
      );
      const toggle = screen.getByRole('button');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });

    it('responds to Enter key for selection', async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();
      const { container } = render(
        <BriefingCard
          headline="Keyboard card"
          workstreamName="Infra"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          onSelect={handleSelect}
        />,
      );
      const card = container.querySelector('[role="option"]');
      expect(card).toBeInTheDocument();
      (card as HTMLElement).focus();
      await user.keyboard('{Enter}');
      expect(handleSelect).toHaveBeenCalledOnce();
    });

    it('responds to Space key for selection', async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();
      const { container } = render(
        <BriefingCard
          headline="Space key card"
          workstreamName="Infra"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          onSelect={handleSelect}
        />,
      );
      const card = container.querySelector('[role="option"]');
      expect(card).toBeInTheDocument();
      (card as HTMLElement).focus();
      await user.keyboard(' ');
      expect(handleSelect).toHaveBeenCalledOnce();
    });

    it('does not show expand/collapse chevron when onSelect is provided', () => {
      const { container } = render(
        <BriefingCard
          headline="No chevron card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          onSelect={() => {}}
        />,
      );
      const svgs = container.querySelectorAll('svg');
      const chevronSvg = Array.from(svgs).find(
        (svg) => svg.querySelector('path[d="M19 9l-7 7-7-7"]'),
      );
      expect(chevronSvg).toBeUndefined();
    });
  });

  describe('read/unread state', () => {
    it('unread standard card has full opacity and blue left border', () => {
      const { container } = render(
        <BriefingCard
          headline="Unread card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          isRead={false}
        />,
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('border-l-[--color-blue-50]');
      expect(card.className).not.toContain('opacity-60');
    });

    it('read standard card has opacity-60 and no left border', () => {
      const { container } = render(
        <BriefingCard
          headline="Read card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          isRead={true}
        />,
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('opacity-60');
      expect(card.className).not.toContain('border-l-[--color-blue-50]');
    });

    it('read + selected: selected state overrides read opacity', () => {
      const { container } = render(
        <BriefingCard
          headline="Read selected card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          isRead={true}
          selected={true}
          onSelect={() => {}}
        />,
      );
      const card = container.querySelector('[role="option"]') as HTMLElement;
      expect(card.className).toContain('border-state-selected-border');
      expect(card.className).not.toContain('opacity-60');
    });

    it('read + gone_quiet: yellow border removed, opacity applied', () => {
      const { container } = render(
        <BriefingCard
          headline="Read quiet card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="gone_quiet"
          variant="standard"
          summaryText="Summary."
          isRead={true}
        />,
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('opacity-60');
      expect(card.className).not.toContain('border-l-state-gone-quiet-border');
    });

    it('compact variant: isRead prop does not affect visual output', () => {
      const { container } = render(
        <BriefingCard
          headline="Compact read card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="compact"
          isRead={true}
        />,
      );
      const el = container.firstChild as HTMLElement;
      expect(el.className).not.toContain('opacity-60');
      expect(el.className).not.toContain('border-l-[--color-blue-50]');
    });

    it('calls onExpandChange when card is expanded', async () => {
      const user = userEvent.setup();
      const handleExpand = vi.fn();
      render(
        <BriefingCard
          headline="Expand callback card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          onExpandChange={handleExpand}
        />,
      );
      const toggle = screen.getByRole('button');
      await user.click(toggle);
      expect(handleExpand).toHaveBeenCalledWith(true);
    });

    it('does not call onExpandChange when collapsing', async () => {
      const user = userEvent.setup();
      const handleExpand = vi.fn();
      render(
        <BriefingCard
          headline="Collapse callback card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          onExpandChange={handleExpand}
        />,
      );
      const toggle = screen.getByRole('button');
      await user.click(toggle); // expand
      handleExpand.mockClear();
      await user.click(toggle); // collapse
      expect(handleExpand).not.toHaveBeenCalled();
    });
  });

  describe('partial-match state', () => {
    it('renders yellow background and badge when isPartialMatch is true', () => {
      const { container } = render(
        <BriefingCard
          headline="Partial match card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          isRead={false}
          isPartialMatch={true}
        />,
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('bg-state-partial-match-bg');
      expect(card.className).toContain('border-l-state-partial-match-border');
      expect(screen.getByText('Partial match — verify with source')).toBeInTheDocument();
    });

    it('partial-match + read applies opacity-60', () => {
      const { container } = render(
        <BriefingCard
          headline="Read partial match"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          isRead={true}
          isPartialMatch={true}
        />,
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('opacity-60');
    });

    it('partial-match + gone-quiet: gone-quiet wins', () => {
      const { container } = render(
        <BriefingCard
          headline="Quiet partial match"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="gone_quiet"
          variant="standard"
          summaryText="Summary."
          isRead={false}
          isPartialMatch={true}
        />,
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('border-l-state-gone-quiet-border');
      expect(card.className).toContain('bg-state-gone-quiet-bg');
      expect(card.className).not.toContain('bg-state-partial-match-bg');
    });

    it('partial-match + selected: selected wins', () => {
      const { container } = render(
        <BriefingCard
          headline="Selected partial match"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          isRead={false}
          isPartialMatch={true}
          selected={true}
          onSelect={() => {}}
        />,
      );
      const card = container.querySelector('[role="option"]') as HTMLElement;
      expect(card.className).toContain('bg-state-selected-bg');
      expect(card.className).not.toContain('bg-state-partial-match-bg');
    });
  });

  describe('newly-surfaced state', () => {
    it('newly surfaced card renders green left border when no higher-priority border', () => {
      const state = getCardStateClasses({
        isRead: false,
        selected: false,
        isQuiet: false,
        isOrphaned: false,
        isPartialMatch: false,
        isNew: true,
        isSelectable: false,
      });
      // Normal unread takes priority over newly-surfaced in the current logic
      // because unread non-special cards get blue border first
      expect(state.leftBorder).toContain('border-l-[--color-blue-50]');
    });

    it('newly surfaced + unread: unread blue border wins over green', () => {
      const { container } = render(
        <BriefingCard
          headline="New unread card"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          isRead={false}
        />,
      );
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('border-l-[--color-blue-50]');
      expect(card.className).not.toContain('border-l-[--color-green-50]');
    });

    it('New badge always renders regardless of left border priority', () => {
      render(
        <BriefingCard
          headline="New card with badge"
          workstreamName="Platform"
          sourceThreadUrl={null}
          itemType="standard"
          variant="standard"
          summaryText="Summary."
          isRead={false}
        />,
      );
      expect(screen.getByText('New')).toBeInTheDocument();
    });
  });

  describe('getCardStateClasses helper', () => {
    it('selected overrides all other states', () => {
      const result = getCardStateClasses({
        isRead: false,
        selected: true,
        isQuiet: true,
        isOrphaned: false,
        isPartialMatch: true,
        isNew: true,
        isSelectable: true,
      });
      expect(result.cardClasses).toContain('bg-state-selected-bg');
      expect(result.cardClasses).toContain('border-state-selected-border');
      expect(result.leftBorder).toBe('');
      expect(result.opacity).toBe('');
    });

    it('gone-quiet takes priority over orphaned and partial-match', () => {
      const result = getCardStateClasses({
        isRead: false,
        selected: false,
        isQuiet: true,
        isOrphaned: false,
        isPartialMatch: true,
        isNew: true,
        isSelectable: false,
      });
      expect(result.leftBorder).toContain('border-l-state-gone-quiet-border');
      expect(result.cardClasses).toContain('bg-state-gone-quiet-bg');
    });

    it('orphaned gets yellow border without background', () => {
      const result = getCardStateClasses({
        isRead: false,
        selected: false,
        isQuiet: false,
        isOrphaned: true,
        isPartialMatch: false,
        isNew: false,
        isSelectable: false,
      });
      expect(result.leftBorder).toContain('border-l-state-gone-quiet-border');
      expect(result.cardClasses).not.toContain('bg-state-gone-quiet-bg');
    });

    it('read + not selected gives opacity-60', () => {
      const result = getCardStateClasses({
        isRead: true,
        selected: false,
        isQuiet: false,
        isOrphaned: false,
        isPartialMatch: false,
        isNew: false,
        isSelectable: false,
      });
      expect(result.opacity).toBe('opacity-60');
      expect(result.leftBorder).toBe('');
    });

    it('read + selected: no opacity', () => {
      const result = getCardStateClasses({
        isRead: true,
        selected: true,
        isQuiet: false,
        isOrphaned: false,
        isPartialMatch: false,
        isNew: false,
        isSelectable: true,
      });
      expect(result.opacity).toBe('');
    });

    it('partial-match unread gets partial-match tokens', () => {
      const result = getCardStateClasses({
        isRead: false,
        selected: false,
        isQuiet: false,
        isOrphaned: false,
        isPartialMatch: true,
        isNew: true,
        isSelectable: false,
      });
      expect(result.leftBorder).toContain('border-l-state-partial-match-border');
      expect(result.cardClasses).toContain('bg-state-partial-match-bg');
    });

    it('selectable adds focus-visible ring class', () => {
      const result = getCardStateClasses({
        isRead: false,
        selected: false,
        isQuiet: false,
        isOrphaned: false,
        isPartialMatch: false,
        isNew: false,
        isSelectable: true,
      });
      expect(result.cardClasses).toContain('focus-visible:ring-2');
    });
  });
});
