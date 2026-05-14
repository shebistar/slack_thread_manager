import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse } from '@slack-thread-manager/shared';

const mockUseSearch = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => {
    (globalThis as Record<string, unknown>).__searchPageComponent = opts.component;
    return { component: opts.component };
  },
}));

vi.mock('@/hooks/use-search.js', () => ({
  useSearch: (...args: unknown[]) => mockUseSearch(...args),
}));

vi.mock('@slack-thread-manager/shared', () => ({
  MAX_SEARCH_QUERY_LENGTH: 500,
}));

vi.mock('@/components/search/search-result-card.js', () => ({
  SearchResultCard: ({ item, rank }: { item: { threadHeadline: string }; rank?: number }) => (
    <div data-testid="search-result-card">
      {rank != null && <span>{rank}.</span>}
      <span>{item.threadHeadline}</span>
    </div>
  ),
}));

vi.mock('@/components/ui/skeleton.js', () => ({
  Skeleton: ({ className }: { className: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

const fullResponse: SearchResponse = {
  results: [
    {
      threadId: '1',
      threadHeadline: 'API Design Discussion',
      summarySnippet: 'Team discussed new endpoints',
      workstreamName: 'Platform',
      sourceThreadUrl: 'https://slack.com/thread/1',
      relevanceScore: 0.9,
      matchType: 'BOTH',
    },
    {
      threadId: '2',
      threadHeadline: 'Database Migration Plan',
      summarySnippet: null,
      workstreamName: null,
      sourceThreadUrl: null,
      relevanceScore: 0.3,
      matchType: 'KEYWORD',
    },
  ],
  meta: { total: 2, query: 'api design', searchTimeMs: 150 },
};

const emptyResponse: SearchResponse = {
  results: [],
  meta: { total: 0, query: 'nonexistent', searchTimeMs: 50 },
  suggestions: ['Try a broader query', 'Use different keywords'],
};

async function getSearchPage() {
  await import('./search.js');
  return (globalThis as Record<string, unknown>).__searchPageComponent as React.ComponentType;
}

describe('SearchPage', () => {
  let SearchPage: React.ComponentType;

  beforeEach(async () => {
    mockUseSearch.mockReset();
    mockUseSearch.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    localStorage.clear();
    SearchPage = await getSearchPage();
  });

  it('renders the search input with correct placeholder (AC 1)', () => {
    render(<SearchPage />);
    const input = screen.getByRole('textbox', { name: /search project discussions/i });
    expect(input).toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute('placeholder', 'Ask a question about project discussions...');
  });

  it('sets document title', () => {
    render(<SearchPage />);
    expect(document.title).toBe('Search — Slack Thread Manager');
  });

  it('submit button is disabled when input is empty', () => {
    render(<SearchPage />);
    const submitBtn = screen.getByRole('button', { name: /search/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submits query on form submit and passes to useSearch (AC 7)', async () => {
    const user = userEvent.setup();
    render(<SearchPage />);

    const input = screen.getByRole('textbox', { name: /search project discussions/i });
    await user.type(input, 'api design');
    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(mockUseSearch).toHaveBeenCalledWith('api design');
  });

  it('displays loading skeletons when search is in progress (AC 2)', () => {
    mockUseSearch.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SearchPage />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders result cards when data is available (AC 3)', async () => {
    const user = userEvent.setup();
    mockUseSearch.mockImplementation((q: string) => ({
      data: q ? fullResponse : undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<SearchPage />);
    const input = screen.getByRole('textbox', { name: /search project discussions/i });
    await user.type(input, 'api design');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(screen.getByText('API Design Discussion')).toBeInTheDocument();
    expect(screen.getByText('Database Migration Plan')).toBeInTheDocument();
  });

  it('renders results after form submission', async () => {
    const user = userEvent.setup();
    mockUseSearch.mockImplementation((q: string) => ({
      data: q ? fullResponse : undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<SearchPage />);
    const input = screen.getByRole('textbox', { name: /search project discussions/i });
    await user.type(input, 'api design');
    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(screen.getByText('API Design Discussion')).toBeInTheDocument();
    expect(screen.getByText('Database Migration Plan')).toBeInTheDocument();
  });

  it('shows metadata row with total and search time (AC: meta)', async () => {
    const user = userEvent.setup();
    mockUseSearch.mockImplementation((q: string) => ({
      data: q ? fullResponse : undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<SearchPage />);
    const input = screen.getByRole('textbox', { name: /search project discussions/i });
    await user.type(input, 'api design');
    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(screen.getByText(/2 results · 150ms/)).toBeInTheDocument();
  });

  it('shows empty state with suggestions when no results (AC 5)', async () => {
    const user = userEvent.setup();
    mockUseSearch.mockImplementation((q: string) => ({
      data: q ? emptyResponse : undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<SearchPage />);
    const input = screen.getByRole('textbox', { name: /search project discussions/i });
    await user.type(input, 'nonexistent');
    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(screen.getByText('No matches found for your question')).toBeInTheDocument();
    expect(screen.getByText('Try a broader query')).toBeInTheDocument();
    expect(screen.getByText('Use different keywords')).toBeInTheDocument();
  });

  it('shows error state with retry button (AC 9)', async () => {
    const mockRefetch = vi.fn();
    const user = userEvent.setup();
    mockUseSearch.mockImplementation((q: string) => ({
      data: undefined,
      isLoading: false,
      isError: !!q,
      error: q ? new Error('Network failure') : null,
      refetch: mockRefetch,
    }));

    render(<SearchPage />);
    const input = screen.getByRole('textbox', { name: /search project discussions/i });
    await user.type(input, 'failing query');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText("We couldn't complete your search. Please try again.")).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
    await user.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });

  describe('search history (AC 8)', () => {
    it('saves search query to history on successful search', async () => {
      const user = userEvent.setup();
      mockUseSearch.mockImplementation((q: string) => ({
        data: q ? fullResponse : undefined,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      }));

      render(<SearchPage />);
      const input = screen.getByRole('textbox', { name: /search project discussions/i });
      await user.type(input, 'api design');
      await user.click(screen.getByRole('button', { name: /^search$/i }));

      expect(screen.getByText('api design')).toBeInTheDocument();
      expect(screen.getByText('Recent:')).toBeInTheDocument();
    });

    it('clicking history item fills input and triggers search', async () => {
      localStorage.setItem('stm:searchHistory', JSON.stringify(['previous query']));

      mockUseSearch.mockImplementation((q: string) => ({
        data: q ? fullResponse : undefined,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      }));

      const user = userEvent.setup();
      render(<SearchPage />);

      const chip = screen.getByRole('button', { name: 'previous query' });
      await user.click(chip);

      expect(mockUseSearch).toHaveBeenCalledWith('previous query');
    });

    it('clear button removes all history', async () => {
      localStorage.setItem('stm:searchHistory', JSON.stringify(['query1', 'query2']));
      const user = userEvent.setup();

      mockUseSearch.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<SearchPage />);
      expect(screen.getByText('query1')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /clear/i }));
      expect(screen.queryByText('query1')).not.toBeInTheDocument();
      expect(screen.queryByText('query2')).not.toBeInTheDocument();
    });

    it('loads history from localStorage on mount', () => {
      localStorage.setItem('stm:searchHistory', JSON.stringify(['old search']));

      render(<SearchPage />);
      expect(screen.getByText('old search')).toBeInTheDocument();
    });
  });
});
