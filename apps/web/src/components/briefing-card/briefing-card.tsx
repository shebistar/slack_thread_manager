import { Badge } from '@/components/ui/badge.js';

export type BriefingCardVariant = 'compact' | 'standard' | 'featured';

interface BriefingCardProps {
  headline: string;
  workstreamName: string | null;
  sourceThreadUrl: string | null;
  itemType: string;
  variant?: BriefingCardVariant;
}

export function BriefingCard({
  headline,
  workstreamName,
  sourceThreadUrl,
  itemType,
  variant = 'compact',
}: BriefingCardProps) {
  if (variant === 'standard') {
    return <div className="py-2 text-sm text-[--color-gray-50]">Standard variant — coming in Story 5.3</div>;
  }
  if (variant === 'featured') {
    return <div className="py-2 text-sm text-[--color-gray-50]">Featured variant — coming in Story 5.4</div>;
  }

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
