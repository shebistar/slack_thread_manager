import { useState } from 'react';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent } from '@/components/ui/card.js';

export type BriefingCardVariant = 'compact' | 'standard' | 'featured';

interface BriefingCardProps {
  headline: string;
  workstreamName: string | null;
  sourceThreadUrl: string | null;
  itemType: string;
  variant?: BriefingCardVariant;
  summaryText?: string;
  messageCount?: number | null;
  participantCount?: number | null;
  latestActivityAt?: string | null;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function BriefingCard({
  headline,
  workstreamName,
  sourceThreadUrl,
  itemType,
  variant = 'compact',
  summaryText,
  messageCount,
  participantCount,
  latestActivityAt,
}: BriefingCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (variant === 'standard') {
    const isOrphaned = itemType === 'orphaned_action';
    const isCrossWorkstream = itemType === 'cross_workstream';
    const isQuiet = itemType === 'gone_quiet';

    return (
      <Card
        className={`transition-shadow hover:shadow-md ${
          isQuiet ? 'border-l-2 border-l-[--color-yellow-30] bg-[--color-yellow-10]' : ''
        } ${isOrphaned ? 'border-l-2 border-l-[--color-yellow-30]' : ''}`}
      >
        <CardContent className="p-4">
          <button
            type="button"
            className="w-full text-left focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none rounded"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {workstreamName && (
                  <Badge className="bg-[--color-blue-50] text-white text-[10px] px-1.5 py-0 mb-1">
                    {workstreamName}
                  </Badge>
                )}
                <h3 className="font-medium font-[--font-display] text-sm text-[--color-gray-95] leading-snug">
                  {headline}
                </h3>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-[--color-gray-50]">
                  {participantCount != null && (
                    <span>{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
                  )}
                  {messageCount != null && (
                    <span>{messageCount} message{messageCount !== 1 ? 's' : ''}</span>
                  )}
                  {latestActivityAt && <span>{formatRelativeTime(latestActivityAt)}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {isCrossWorkstream && (
                  <Badge className="bg-[--color-brand-red] text-white text-[10px] px-1.5 py-0">
                    Cross-workstream
                  </Badge>
                )}
                {isOrphaned && (
                  <Badge className="bg-[--color-yellow-30] text-[--color-gray-95] text-[10px] px-1.5 py-0">
                    Orphaned action
                  </Badge>
                )}
                {isQuiet && (
                  <Badge className="bg-[--color-yellow-30] text-[--color-gray-95] text-[10px] px-1.5 py-0">
                    Gone Quiet
                  </Badge>
                )}
                <svg
                  className={`w-4 h-4 text-[--color-gray-50] transition-transform duration-200 ease-out motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </button>

          <div
            className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none ${
              expanded ? 'max-h-[500px] opacity-100 mt-3' : 'max-h-0 opacity-0'
            }`}
          >
            {summaryText && (
              <p className="text-sm text-[--color-gray-95] leading-relaxed whitespace-pre-line">
                {summaryText}
              </p>
            )}
            {sourceThreadUrl && (
              <a
                href={sourceThreadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-[--color-blue-50] hover:underline focus-visible:ring-2 focus-visible:ring-[--color-blue-50] rounded"
                aria-label="View thread in Slack (opens in new tab)"
                onClick={(e) => e.stopPropagation()}
              >
                View in Slack →
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'featured') {
    return <div className="py-2 text-sm text-[--color-gray-50]">Featured variant — coming in Story 5.4</div>;
  }

  // compact variant (default)
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[--color-gray-20] last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium font-[--font-display] text-sm text-[--color-gray-95] truncate">
          {headline}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {workstreamName && (
            <Badge
              className="bg-[--color-blue-50] text-white text-[10px] px-1.5 py-0"
            >
              {workstreamName}
            </Badge>
          )}
          {itemType === 'cross_workstream' && (
            <Badge className="bg-[--color-brand-red] text-white text-[10px] px-1.5 py-0">
              Cross-workstream
            </Badge>
          )}
          {itemType === 'orphaned_action' && (
            <Badge className="bg-[--color-yellow-30] text-[--color-gray-95] text-[10px] px-1.5 py-0">
              Orphaned action
            </Badge>
          )}
        </div>
      </div>
      {sourceThreadUrl && (
        <a
          href={sourceThreadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-[--color-blue-50] hover:underline focus-visible:ring-2 focus-visible:ring-[--color-blue-50] rounded"
          aria-label="View thread in Slack (opens in new tab)"
        >
          View in Slack →
        </a>
      )}
    </div>
  );
}
