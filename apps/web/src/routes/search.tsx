import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearch } from '@/hooks/use-search.js';
import { SearchResultCard } from '@/components/search/search-result-card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Input } from '@/components/ui/input.js';
import { Badge } from '@/components/ui/badge.js';
import { MAX_SEARCH_QUERY_LENGTH } from '@slack-thread-manager/shared';

export const Route = createFileRoute('/search')({
  component: SearchPage,
});

const HISTORY_KEY = 'stm:searchHistory';
const MAX_HISTORY = 5;

function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function writeHistory(queries: string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(queries.slice(0, MAX_HISTORY)));
  } catch {
    /* localStorage full or unavailable */
  }
}

function addToHistory(query: string, history: string[]): string[] {
  const trimmed = query.trim();
  if (!trimmed) return history;
  const filtered = history.filter((h) => h.toLowerCase() !== trimmed.toLowerCase());
  return [trimmed, ...filtered].slice(0, MAX_HISTORY);
}

function SearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [history, setHistory] = useState<string[]>(readHistory);

  const { data, isLoading, isError, error, refetch } = useSearch(submittedQuery);
  const showSkeleton = isLoading && !data;

  useEffect(() => {
    document.title = 'Search — Slack Thread Manager';
  }, []);

  useEffect(() => {
    if (submittedQuery && data) {
      const updated = addToHistory(submittedQuery, history);
      setHistory(updated);
      writeHistory(updated);
    }
    // Only run when a successful search response arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedQuery, data]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed) {
        setSubmittedQuery(trimmed);
      }
    },
    [query],
  );

  const handleHistoryClick = useCallback((historyQuery: string) => {
    setQuery(historyQuery);
    setSubmittedQuery(historyQuery);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    writeHistory([]);
  }, []);

  const hasResults = !!data && data.results.length > 0;
  const hasEmptyResults = !!data && data.results.length === 0 && !!submittedQuery;

  return (
    <div>
      <header className="bg-white border-b-[3px] border-b-[--color-brand-red] px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-[--font-display] text-xl font-medium text-[--color-gray-95]">
            Search
          </h1>
          <Badge className="px-2.5 py-1 bg-[--color-teal-10] text-[--color-teal-50] rounded text-[11px] font-medium">
            Natural Language Search
          </Badge>
        </div>
        <p className="text-[13px] text-[--color-gray-50] mt-1">
          Ask questions across all workstreams and past briefings
        </p>
      </header>

      <div className="p-6 space-y-6">
        <div>
          <form onSubmit={handleSubmit}>
            <div className="relative">
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a question about project discussions..."
                maxLength={MAX_SEARCH_QUERY_LENGTH}
                className="h-11 pr-24"
                aria-label="Search project discussions"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[--color-blue-50] text-white text-xs font-medium rounded-md hover:bg-[--color-blue-70] disabled:opacity-40 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none"
              >
                Search
              </button>
            </div>
          </form>

          {history.length > 0 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[--color-gray-50]">Recent:</span>
              {history.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleHistoryClick(h)}
                  className="px-2.5 py-1 bg-[--color-gray-10] text-[--color-gray-95] text-xs rounded-full hover:bg-[--color-gray-20] transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none"
                >
                  {h}
                </button>
              ))}
              <button
                type="button"
                onClick={clearHistory}
                className="px-2 py-1 text-[10px] text-[--color-gray-50] hover:text-[--color-gray-95] transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div aria-live="polite" aria-busy={isLoading}>
          {showSkeleton && <SearchSkeleton />}

          {isError && (
            <div className="rounded-lg border border-[--color-brand-red] bg-white px-6 py-6 text-center">
              <p className="text-lg text-[--color-gray-95]">Something went wrong</p>
              <p className="mt-2 text-sm text-[--color-gray-50]">
                We couldn't complete your search. Please try again.
              </p>
              {error instanceof Error && (
                <p className="mt-2 text-xs text-[--color-gray-50]">
                  If this keeps happening, contact support.
                </p>
              )}
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-4 px-4 py-2 bg-[--color-blue-50] text-white text-sm font-medium rounded-md hover:bg-[--color-blue-70] transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none"
              >
                Retry
              </button>
            </div>
          )}

          {hasResults && data && (
            <>
              <div className="mb-4 text-xs text-[--color-gray-50]">
                {data.meta.total} {data.meta.total === 1 ? 'result' : 'results'} · {data.meta.searchTimeMs}ms
              </div>
              <div className="space-y-3">
                {data.results.map((item, idx) => (
                  <SearchResultCard key={item.threadId} item={item} rank={idx + 1} />
                ))}
              </div>
            </>
          )}

          {hasEmptyResults && data && (
            <div className="rounded-lg border border-[--color-gray-20] bg-white px-6 py-12 text-center">
              <p className="text-lg text-[--color-gray-50]">
                No matches found for your question
              </p>
              {data.suggestions && data.suggestions.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-[--color-gray-50] mb-2">Try:</p>
                  <ul className="text-sm text-[--color-gray-50] list-disc list-inside">
                    {data.suggestions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading search results">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-[--color-gray-20] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
          <div className="mt-3 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}
