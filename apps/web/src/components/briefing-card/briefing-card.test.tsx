import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

  it('renders placeholder for standard variant', () => {
    render(
      <BriefingCard
        headline="Test"
        workstreamName="Eng"
        sourceThreadUrl={null}
        itemType="standard"
        variant="standard"
      />,
    );
    expect(screen.getByText(/coming in story 5\.3/i)).toBeInTheDocument();
  });

  it('renders placeholder for featured variant', () => {
    render(
      <BriefingCard
        headline="Test"
        workstreamName="Eng"
        sourceThreadUrl={null}
        itemType="standard"
        variant="featured"
      />,
    );
    expect(screen.getByText(/coming in story 5\.4/i)).toBeInTheDocument();
  });
});
