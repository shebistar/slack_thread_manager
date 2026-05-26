import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EnrichmentPanel } from './enrichment-panel.js';

const mockUseEnrichment = vi.fn();

vi.mock('@/hooks/use-enrichment.js', () => ({
  useEnrichment: (...args: unknown[]) => mockUseEnrichment(...args),
}));

describe('EnrichmentPanel', () => {
  beforeEach(() => {
    mockUseEnrichment.mockReset();
    mockUseEnrichment.mockReturnValue({ data: null, isLoading: false, isError: false });
  });

  it('renders "AI-Assisted" badge and "Related Context" heading', () => {
    render(<EnrichmentPanel threadId={null} isOpen={true} onToggle={() => {}} />);
    expect(screen.getByText('AI-Assisted')).toBeInTheDocument();
    expect(screen.getByText('Related Context')).toBeInTheDocument();
  });

  it('shows empty state when no threadId selected', () => {
    render(<EnrichmentPanel threadId={null} isOpen={true} onToggle={() => {}} />);
    expect(screen.getByText('Select a topic card to see related context')).toBeInTheDocument();
  });

  it('shows skeleton state when loading', () => {
    mockUseEnrichment.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<EnrichmentPanel threadId="thread-1" isOpen={true} onToggle={() => {}} />);
    const skeletons = container.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "No related context found" when sections are empty', () => {
    mockUseEnrichment.mockReturnValue({
      data: { sections: [], meta: { threadId: 'thread-1', queriedAt: '2026-05-26T09:00:00Z', sourcesAvailable: 3, sourcesSucceeded: 0 } },
      isLoading: false,
      isError: false,
    });
    render(<EnrichmentPanel threadId="thread-1" isOpen={true} onToggle={() => {}} />);
    expect(screen.getByText('No related context found for this topic')).toBeInTheDocument();
  });

  it('shows "Enrichment temporarily unavailable" on error', () => {
    mockUseEnrichment.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<EnrichmentPanel threadId="thread-1" isOpen={true} onToggle={() => {}} />);
    expect(screen.getByText('Enrichment temporarily unavailable')).toBeInTheDocument();
  });

  it('renders three section headers when data is loaded', () => {
    mockUseEnrichment.mockReturnValue({
      data: {
        sections: [
          { title: 'Doc A', description: 'Desc A', sourceUrl: 'https://a.com', sourceType: 'OPENSHIFT_DOCS', relevanceScore: 0.9 },
          { title: 'KB Entry', description: 'Desc B', sourceUrl: 'https://b.com', sourceType: 'NOTEBOOKLM', relevanceScore: 0.8 },
          { title: 'Discussion', description: 'Desc C', sourceUrl: 'https://c.com', sourceType: 'PAST_DISCUSSION', relevanceScore: 0.7 },
        ],
        meta: { threadId: 'thread-1', queriedAt: '2026-05-26T09:00:00Z', sourcesAvailable: 3, sourcesSucceeded: 3 },
      },
      isLoading: false,
      isError: false,
    });
    render(<EnrichmentPanel threadId="thread-1" isOpen={true} onToggle={() => {}} />);

    expect(screen.getByText('OpenShift Documentation')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Base (NotebookLM)')).toBeInTheDocument();
    expect(screen.getByText('Similar Past Discussions')).toBeInTheDocument();
  });

  it('renders enrichment links with correct titles and hrefs', () => {
    mockUseEnrichment.mockReturnValue({
      data: {
        sections: [
          { title: 'Networking Guide', description: 'SDN setup', sourceUrl: 'https://docs.openshift.com/net', sourceType: 'OPENSHIFT_DOCS', relevanceScore: 0.9 },
        ],
        meta: { threadId: 'thread-1', queriedAt: '2026-05-26T09:00:00Z', sourcesAvailable: 3, sourcesSucceeded: 1 },
      },
      isLoading: false,
      isError: false,
    });
    render(<EnrichmentPanel threadId="thread-1" isOpen={true} onToggle={() => {}} />);

    const link = screen.getByRole('link', { name: 'Networking Guide' });
    expect(link).toHaveAttribute('href', 'https://docs.openshift.com/net');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows "Source temporarily unavailable" for sections with no items', () => {
    mockUseEnrichment.mockReturnValue({
      data: {
        sections: [
          { title: 'Doc A', description: 'Desc', sourceUrl: 'https://a.com', sourceType: 'OPENSHIFT_DOCS', relevanceScore: 0.9 },
        ],
        meta: { threadId: 'thread-1', queriedAt: '2026-05-26T09:00:00Z', sourcesAvailable: 3, sourcesSucceeded: 1 },
      },
      isLoading: false,
      isError: false,
    });
    render(<EnrichmentPanel threadId="thread-1" isOpen={true} onToggle={() => {}} />);

    const unavailableMessages = screen.getAllByText('Source temporarily unavailable');
    expect(unavailableMessages.length).toBe(2);
  });

  it('sections are collapsible (toggle aria-expanded)', async () => {
    const user = userEvent.setup();
    mockUseEnrichment.mockReturnValue({
      data: {
        sections: [
          { title: 'Doc A', description: 'Desc', sourceUrl: 'https://a.com', sourceType: 'OPENSHIFT_DOCS', relevanceScore: 0.9 },
        ],
        meta: { threadId: 'thread-1', queriedAt: '2026-05-26T09:00:00Z', sourcesAvailable: 3, sourcesSucceeded: 1 },
      },
      isLoading: false,
      isError: false,
    });
    render(<EnrichmentPanel threadId="thread-1" isOpen={true} onToggle={() => {}} />);

    const docsButton = screen.getByRole('button', { name: /OpenShift Documentation/i });
    expect(docsButton).toHaveAttribute('aria-expanded', 'true');

    await user.click(docsButton);
    expect(docsButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(docsButton);
    expect(docsButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('links open in new tab (target="_blank")', () => {
    mockUseEnrichment.mockReturnValue({
      data: {
        sections: [
          { title: 'Link 1', description: 'D1', sourceUrl: 'https://one.com', sourceType: 'PAST_DISCUSSION', relevanceScore: 0.8 },
          { title: 'Link 2', description: 'D2', sourceUrl: 'https://two.com', sourceType: 'PAST_DISCUSSION', relevanceScore: 0.7 },
        ],
        meta: { threadId: 'thread-1', queriedAt: '2026-05-26T09:00:00Z', sourcesAvailable: 3, sourcesSucceeded: 1 },
      },
      isLoading: false,
      isError: false,
    });
    render(<EnrichmentPanel threadId="thread-1" isOpen={true} onToggle={() => {}} />);

    const links = screen.getAllByRole('link');
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
    }
  });
});
