import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge.js';
import { BriefingCard } from '@/components/briefing-card/briefing-card.js';
import type { BriefingItem } from '@/hooks/use-briefings.js';

type BackfillSectionVariant = 'feed' | 'split-panel' | 'dashboard';

interface BackfillSectionProps {
  items: BriefingItem[];
  readItemIds: string[];
  onMarkRead: (id: string) => void;
  variant: BackfillSectionVariant;
  showDailyEmptyState?: boolean;
  selectedItemId?: string | null;
  onSelectItem?: (id: string) => void;
}

function getWorkstreamLabel(items: BriefingItem[]): string {
  const names = Array.from(
    new Set(items.map((item) => item.workstreamName).filter((name): name is string => Boolean(name))),
  );

  if (names.length === 0) {
    return 'your workstreams';
  }

  return names.join(', ');
}

export function BackfillSection({
  items,
  readItemIds,
  onMarkRead,
  variant,
  showDailyEmptyState = false,
  selectedItemId,
  onSelectItem,
}: BackfillSectionProps) {
  const sectionId = `backfill-section-${variant}`;
  const workstreamLabel = useMemo(() => getWorkstreamLabel(items), [items]);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby={sectionId} className="space-y-4">
      <div className="bg-[--color-teal-10] border border-[--color-teal-50]/20 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 id={sectionId} className="text-sm font-medium text-[--color-gray-95]">
            Since you joined: Key context from {workstreamLabel}
          </h2>
          <Badge className="bg-[--color-teal-50] text-white text-[10px] px-1.5 py-0">
            Onboarding
          </Badge>
        </div>

        <div className="space-y-3">
          {items.map((item) => {
            const isDashboard = variant === 'dashboard';
            const isSelectable = variant === 'split-panel' && onSelectItem;
            return (
              <BriefingCard
                key={item.id}
                headline={item.headline}
                workstreamName={item.workstreamName}
                sourceThreadUrl={item.sourceThreadUrl}
                itemType={item.itemType}
                variant={isDashboard ? 'compact' : 'standard'}
                summaryText={item.summaryText}
                messageCount={item.messageCount}
                participantCount={item.participantCount}
                latestActivityAt={item.latestActivityAt}
                isRead={isDashboard ? false : readItemIds.includes(item.id)}
                selected={isSelectable ? selectedItemId === item.id : false}
                onSelect={
                  isSelectable
                    ? () => {
                        onSelectItem(item.id);
                      }
                    : undefined
                }
                onExpandChange={
                  isDashboard
                    ? undefined
                    : () => {
                        onMarkRead(item.id);
                      }
                }
              />
            );
          })}
        </div>
      </div>

      <div className="border-t border-[--color-gray-20] my-6" />
      <h3 className="text-[13px] font-medium text-[--color-gray-50] uppercase tracking-wide">
        Today&apos;s Briefing
      </h3>
      {showDailyEmptyState && (
        <p className="text-sm text-[--color-gray-50]">
          No new briefing items for today. Check back after the next batch.
        </p>
      )}
    </section>
  );
}
