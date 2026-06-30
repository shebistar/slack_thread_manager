import { type KeyboardEvent, useState } from 'react';
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
  selected?: boolean;
  onSelect?: () => void;
  isRead?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  silenceDays?: number | null;
  isPartialMatch?: boolean;
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

interface CardStateInput {
  isRead: boolean;
  selected: boolean;
  isQuiet: boolean;
  isOrphaned: boolean;
  isPartialMatch: boolean;
  isNew: boolean;
  isSelectable: boolean;
}

interface CardStateOutput {
  cardClasses: string;
  leftBorder: string;
  opacity: string;
}

export function getCardStateClasses(input: CardStateInput): CardStateOutput {
  const { isRead, selected, isQuiet, isOrphaned, isPartialMatch, isNew, isSelectable } = input;

  let leftBorder = '';
  let cardClasses = '';
  let opacity = '';

  // Full border: selected overrides everything
  if (selected) {
    cardClasses = 'border-state-selected-border bg-state-selected-bg';
  } else if (!isRead) {
    // Left border priority: gone-quiet > orphaned > unread > partial-match > newly-surfaced
    if (isQuiet) {
      leftBorder = 'border-l-2 border-l-state-gone-quiet-border';
      cardClasses = 'bg-state-gone-quiet-bg';
    } else if (isOrphaned) {
      leftBorder = 'border-l-2 border-l-state-gone-quiet-border';
    } else if (!isPartialMatch) {
      // Normal unread: blue left border (not a semantic "state" token — it's the generic unread accent)
      leftBorder = 'border-l-2 border-l-[--color-blue-50]';
    } else {
      // partial-match (lower priority than unread-standard)
      leftBorder = 'border-l-2 border-l-state-partial-match-border';
      cardClasses = 'bg-state-partial-match-bg';
    }

    // newly-surfaced: only if no higher-priority border was set
    if (isNew && leftBorder === '') {
      leftBorder = 'border-l-2 border-l-[--color-green-50]';
    }
  } else {
    // isRead cases with no selection
    // No left border for read cards. Quiet/orphaned lose their border when read.
  }

  // Opacity: read + not selected → dimmed
  if (isRead && !selected) {
    opacity = 'opacity-60';
  }

  // Focus ring for selectable cards
  if (isSelectable) {
    cardClasses += ' focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none';
  }

  return { cardClasses: cardClasses.trim(), leftBorder, opacity };
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
  selected,
  onSelect,
  isRead,
  onExpandChange,
  silenceDays,
  isPartialMatch,
}: BriefingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isSelectable = !!onSelect;

  if (variant === 'standard' || variant === 'featured') {
    const isOrphaned = itemType === 'orphaned_action';
    const isCrossWorkstream = itemType === 'cross_workstream';
    const isQuiet = itemType === 'gone_quiet' || silenceDays != null;
    const isHistorical = itemType === 'backfill';
    const isNew = !isRead;

    const state = getCardStateClasses({
      isRead: !!isRead,
      selected: !!selected,
      isQuiet,
      isOrphaned,
      isPartialMatch: !!isPartialMatch,
      isNew,
      isSelectable,
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSelectable && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onSelect();
      }
    };

    return (
      <Card
        className={`transition-shadow hover:shadow-md transition-opacity duration-200 ease-out motion-reduce:transition-none ${state.leftBorder} ${state.cardClasses} ${state.opacity}`}
        {...(isSelectable
          ? {
              role: 'option',
              tabIndex: 0,
              onClick: onSelect,
              onKeyDown: handleKeyDown,
              'aria-selected': !!selected,
              style: { cursor: 'pointer' },
            }
          : {})}
      >
        <CardContent className="p-4">
          {!isSelectable ? (
            <button
              type="button"
              className="w-full text-left focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none rounded"
              onClick={() => {
                const next = !expanded;
                setExpanded(next);
                if (next && onExpandChange) onExpandChange(next);
              }}
              aria-expanded={expanded}
            >
              <StandardCardHeader
                workstreamName={workstreamName}
                headline={headline}
                participantCount={participantCount}
                messageCount={messageCount}
                latestActivityAt={latestActivityAt}
                isCrossWorkstream={isCrossWorkstream}
                isOrphaned={isOrphaned}
                isQuiet={isQuiet}
                isHistorical={isHistorical}
                silenceDays={silenceDays}
                isNew={isNew}
                isPartialMatch={isPartialMatch}
                showChevron
                expanded={expanded}
              />
            </button>
          ) : (
            <StandardCardHeader
              workstreamName={workstreamName}
              headline={headline}
              participantCount={participantCount}
              messageCount={messageCount}
              latestActivityAt={latestActivityAt}
              isCrossWorkstream={isCrossWorkstream}
              isOrphaned={isOrphaned}
              isQuiet={isQuiet}
              isHistorical={isHistorical}
              silenceDays={silenceDays}
              isNew={isNew}
              isPartialMatch={isPartialMatch}
              showChevron={false}
              expanded={false}
            />
          )}

          {summaryText && (
            <p
              className={`mt-3 text-sm text-[--color-gray-95] leading-relaxed whitespace-pre-line ${
                isSelectable
                  ? ''
                  : `transition-[max-height] duration-200 ease-out motion-reduce:transition-none ${
                      expanded ? 'max-h-96' : 'max-h-10 overflow-hidden'
                    }`
              }`}
            >
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
        </CardContent>
      </Card>
    );
  }

  // compact variant (default)
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[--color-gray-20] last:border-b-0 transition-colors hover:bg-[--color-gray-05] motion-reduce:transition-none">
      <div className="flex-1 min-w-0">
        <p className="font-medium font-[--font-display] text-sm text-[--color-gray-95] truncate">
          {headline}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {workstreamName && (
            <span className="text-[11px] font-medium uppercase tracking-wide text-[--color-blue-50]">
              {workstreamName}
            </span>
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

function StandardCardHeader({
  workstreamName,
  headline,
  participantCount,
  messageCount,
  latestActivityAt,
  isCrossWorkstream,
  isOrphaned,
  isQuiet,
  isHistorical,
  silenceDays,
  isNew,
  isPartialMatch,
  showChevron,
  expanded,
}: {
  workstreamName: string | null;
  headline: string;
  participantCount?: number | null;
  messageCount?: number | null;
  latestActivityAt?: string | null;
  isCrossWorkstream: boolean;
  isOrphaned: boolean;
  isQuiet: boolean;
  isHistorical: boolean;
  silenceDays?: number | null;
  isNew?: boolean;
  isPartialMatch?: boolean;
  showChevron: boolean;
  expanded: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        {workstreamName && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-[--color-blue-50] mb-1 block">
            {workstreamName}
          </span>
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
          <Badge className="bg-[--color-yellow-10] text-[--color-yellow-70] text-[10px] px-1.5 py-0">
            {silenceDays != null ? `Quiet for ${silenceDays} day${silenceDays !== 1 ? 's' : ''}` : 'Gone Quiet'}
          </Badge>
        )}
        {!isCrossWorkstream && !isOrphaned && !isQuiet && isHistorical && (
          <Badge className="bg-[--color-gray-20] text-[--color-gray-50] text-[10px] px-1.5 py-0">
            Historical
          </Badge>
        )}
        {!isCrossWorkstream && !isOrphaned && !isQuiet && isNew && (
          <Badge className="bg-[--color-green-10] text-[--color-green-50] text-[10px] px-1.5 py-0">
            New
          </Badge>
        )}
        {isPartialMatch && (
          <Badge className="bg-[--color-yellow-10] text-[--color-yellow-70] text-[10px] px-1.5 py-0">
            Partial match — verify with source
          </Badge>
        )}
        {showChevron && (
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
        )}
      </div>
    </div>
  );
}
