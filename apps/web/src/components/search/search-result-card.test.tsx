import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchResultCard } from './search-result-card.js';
import type { SearchResultItem } from '@slack-thread-manager/shared';

const fullItem: SearchResultItem = {
  threadId: '550e8400-e29b-41d4-a716-446655440000',
  threadHeadline: 'API migration strategy',
  summarySnippet: 'The team discussed the migration plan for the REST endpoints.',
  workstreamName: 'Platform',
  sourceThreadUrl: 'https://app.slack.com/client/T123/C456/thread/C456-789',
  relevanceScore: 0.85,
  matchType: 'BOTH',
};

describe('SearchResultCard', () => {
  it('renders headline, summary, workstream badge, and Slack link', () => {
    render(<SearchResultCard item={fullItem} />);

    expect(screen.getByText('API migration strategy')).toBeInTheDocument();
    expect(screen.getByText(/The team discussed/)).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /view thread in slack/i });
    expect(link).toHaveAttribute('href', fullItem.sourceThreadUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders match type badge', () => {
    render(<SearchResultCard item={fullItem} />);
    expect(screen.getByText('Keyword + Semantic')).toBeInTheDocument();
  });

  it('renders KEYWORD match type label', () => {
    render(<SearchResultCard item={{ ...fullItem, matchType: 'KEYWORD' }} />);
    expect(screen.getByText('Keyword')).toBeInTheDocument();
  });

  it('renders SEMANTIC match type label', () => {
    render(<SearchResultCard item={{ ...fullItem, matchType: 'SEMANTIC' }} />);
    expect(screen.getByText('Semantic')).toBeInTheDocument();
  });

  it('shows rank number when provided', () => {
    render(<SearchResultCard item={fullItem} rank={3} />);
    expect(screen.getByText('3.')).toBeInTheDocument();
  });

  it('omits rank when not provided', () => {
    render(<SearchResultCard item={fullItem} />);
    expect(screen.queryByText(/^\d+\.$/)).not.toBeInTheDocument();
  });

  it('handles null summarySnippet gracefully', () => {
    render(<SearchResultCard item={{ ...fullItem, summarySnippet: null }} />);
    expect(screen.getByText('API migration strategy')).toBeInTheDocument();
    expect(screen.queryByText(/The team discussed/)).not.toBeInTheDocument();
  });

  it('handles null workstreamName gracefully', () => {
    render(<SearchResultCard item={{ ...fullItem, workstreamName: null }} />);
    expect(screen.getByText('API migration strategy')).toBeInTheDocument();
    expect(screen.queryByText('Platform')).not.toBeInTheDocument();
  });

  it('handles null sourceThreadUrl gracefully', () => {
    render(<SearchResultCard item={{ ...fullItem, sourceThreadUrl: null }} />);
    expect(screen.getByText('API migration strategy')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows partial match badge when relevanceScore is below threshold', () => {
    render(<SearchResultCard item={{ ...fullItem, relevanceScore: 0.3 }} />);
    expect(screen.getByText('Partial match — verify with source')).toBeInTheDocument();
  });

  it('does not show partial match badge when relevanceScore is at or above threshold', () => {
    render(<SearchResultCard item={{ ...fullItem, relevanceScore: 0.4 }} />);
    expect(screen.queryByText(/Partial match/)).not.toBeInTheDocument();
  });

  it('does not show partial match badge for high relevance', () => {
    render(<SearchResultCard item={{ ...fullItem, relevanceScore: 0.95 }} />);
    expect(screen.queryByText(/Partial match/)).not.toBeInTheDocument();
  });

  it('applies white background to the card for high-confidence results', () => {
    const { container } = render(<SearchResultCard item={fullItem} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('bg-white');
  });

  it('applies motion-reduce transition guard alongside the hover transition', () => {
    const { container } = render(<SearchResultCard item={fullItem} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('transition-shadow');
    expect(card.className).toContain('motion-reduce:transition-none');
  });

  it('applies semantic partial-match background and left border tokens', () => {
    const { container } = render(<SearchResultCard item={{ ...fullItem, relevanceScore: 0.2 }} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('bg-state-partial-match-bg');
    expect(card.className).toContain('border-l-state-partial-match-border');
    expect(card.className).not.toContain('bg-white');
  });

  it('renders a relevance indicator for confident matches', () => {
    render(<SearchResultCard item={{ ...fullItem, relevanceScore: 0.85 }} />);
    expect(screen.getByText('85% match')).toBeInTheDocument();
  });

  it('hides the relevance indicator for partial-match results', () => {
    render(<SearchResultCard item={{ ...fullItem, relevanceScore: 0.3 }} />);
    expect(screen.queryByText(/% match/)).not.toBeInTheDocument();
  });

  it('rounds the relevance percentage', () => {
    render(<SearchResultCard item={{ ...fullItem, relevanceScore: 0.666 }} />);
    expect(screen.getByText('67% match')).toBeInTheDocument();
  });
});
