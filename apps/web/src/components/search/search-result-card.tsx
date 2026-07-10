import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent } from '@/components/ui/card.js';
import type { SearchResultItem, MatchType } from '@slack-thread-manager/shared';

const PARTIAL_MATCH_THRESHOLD = 0.4;

const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  KEYWORD: 'Keyword',
  SEMANTIC: 'Semantic',
  BOTH: 'Keyword + Semantic',
};

interface SearchResultCardProps {
  item: SearchResultItem;
  rank?: number;
}

export function SearchResultCard({ item, rank }: SearchResultCardProps) {
  const isPartialMatch =
    !Number.isFinite(item.relevanceScore) || item.relevanceScore < PARTIAL_MATCH_THRESHOLD;

  const stateClasses = isPartialMatch
    ? 'bg-state-partial-match-bg border-l-2 border-l-state-partial-match-border'
    : 'bg-white';

  return (
    <Card
      className={`${stateClasses} transition-shadow hover:shadow-md motion-reduce:transition-none`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {item.workstreamName && (
              <span className="text-[11px] font-medium uppercase tracking-wide text-[--color-blue-50] mb-1 block">
                {item.workstreamName}
              </span>
            )}
            <h3 className="font-medium font-[--font-display] text-sm text-[--color-gray-95] leading-snug">
              {rank != null && (
                <span className="text-[--color-gray-50] mr-1.5">{rank}.</span>
              )}
              {item.threadHeadline}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge className="bg-[--color-gray-10] text-[--color-gray-50] text-[10px] px-1.5 py-0">
              {MATCH_TYPE_LABEL[item.matchType]}
            </Badge>
          </div>
        </div>

        {item.summarySnippet && (
          <p className="mt-2 text-sm text-[--color-gray-95] leading-relaxed line-clamp-3">
            {item.summarySnippet}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 mt-3">
          <div>
            {item.sourceThreadUrl && (
              <a
                href={item.sourceThreadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[--color-blue-50] hover:underline focus-visible:ring-2 focus-visible:ring-[--color-blue-50] rounded"
                aria-label="View thread in Slack (opens in new tab)"
              >
                View in Slack →
              </a>
            )}
          </div>
          {!isPartialMatch && (
            <span className="text-[10px] text-[--color-gray-50] shrink-0">
              {Math.round(item.relevanceScore * 100)}% match
            </span>
          )}
        </div>

        {isPartialMatch && (
          <div className="mt-2">
            <Badge className="bg-[--color-yellow-10] text-[--color-yellow-70] text-[10px] px-1.5 py-0">
              Partial match — verify with source
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
