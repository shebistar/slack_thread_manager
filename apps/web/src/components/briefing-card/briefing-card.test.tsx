import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BriefingCard } from './briefing-card.js';

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
    it('renders selected state with blue border and background', () => {
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
      const card = container.querySelector('[role="button"]');
      expect(card).toBeInTheDocument();
      expect(card?.className).toContain('border-[--color-blue-50]');
      expect(card?.className).toContain('bg-[--color-blue-10]');
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
      const card = container.querySelector('[role="button"]');
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
      const card = container.querySelector('[role="button"]');
      expect(card).toBeInTheDocument();
      (card as HTMLElement).focus();
      await user.keyboard('{Enter}');
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
});
