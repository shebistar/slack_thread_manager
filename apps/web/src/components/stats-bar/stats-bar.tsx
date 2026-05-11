import { Skeleton } from '@/components/ui/skeleton.js';
import type { BriefingWithItems } from '@/hooks/use-briefings.js';

interface StatCellProps {
  value: number;
  label: string;
  colorClass: string;
}

function StatCell({ value, label, colorClass }: StatCellProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-4 px-3"
      role="status"
      aria-label={`${label}: ${value}`}
    >
      <span
        className={`font-[--font-display] text-[32px] font-medium leading-tight ${colorClass}`}
      >
        {value}
      </span>
      <span className="text-xs text-[--color-gray-50] mt-1">{label}</span>
    </div>
  );
}

function StatsBarSkeleton() {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 bg-white rounded-lg border border-[--color-gray-20] shadow-sm divide-x divide-[--color-gray-20]">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center justify-center py-4 px-3">
          <Skeleton className="h-9 w-12 mb-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

interface StatsBarProps {
  data: BriefingWithItems | null | undefined;
  isLoading: boolean;
}

export function StatsBar({ data, isLoading }: StatsBarProps) {
  if (isLoading) return <StatsBarSkeleton />;

  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-[--color-gray-20] shadow-sm py-6 text-center text-sm text-[--color-gray-50]">
        No briefing data
      </div>
    );
  }

  const { briefing, items } = data;
  const goneQuietCount = items.filter((i) => i.itemType === 'gone_quiet').length;
  const flagsRaisedCount = items.filter((i) =>
    ['cross_workstream', 'orphaned_action'].includes(i.itemType),
  ).length;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 bg-white rounded-lg border border-[--color-gray-20] shadow-sm divide-x divide-[--color-gray-20]">
      <StatCell
        value={briefing.threadCount}
        label="Threads Processed"
        colorClass="text-[--color-blue-50]"
      />
      <StatCell
        value={briefing.workstreamCount}
        label="Active Workstreams"
        colorClass="text-[--color-green-50]"
      />
      <StatCell
        value={goneQuietCount}
        label="Gone Quiet"
        colorClass="text-[--color-gray-95] bg-[--color-yellow-30] rounded px-2"
      />
      <StatCell
        value={flagsRaisedCount}
        label="Flags Raised"
        colorClass="text-[--color-brand-red]"
      />
    </div>
  );
}
