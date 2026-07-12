import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import type { BriefingWithItems } from '@/hooks/use-briefings.js';

interface BriefingPageFrameProps {
  title: string;
  layoutLabel: string;
  briefingData: BriefingWithItems | null | undefined;
  isLoading: boolean;
  children: ReactNode;
}

function formatFreshness(data: BriefingWithItems): string {
  const countStr = `${data.briefing.threadCount} threads across ${data.briefing.workstreamCount} workstreams`;

  const generatedDate = new Date(data.briefing.generatedAt);
  if (isNaN(generatedDate.getTime())) {
    return countStr;
  }

  const timeStr = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(generatedDate);

  const now = new Date();
  const isToday =
    generatedDate.getFullYear() === now.getFullYear() &&
    generatedDate.getMonth() === now.getMonth() &&
    generatedDate.getDate() === now.getDate();

  const dateLabel = isToday
    ? `today at ${timeStr}`
    : `on ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(generatedDate)} at ${timeStr}`;

  return `Generated ${dateLabel} · ${countStr}`;
}

export function BriefingPageFrame({
  title,
  layoutLabel,
  briefingData,
  isLoading,
  children,
}: BriefingPageFrameProps) {
  return (
    <div>
      <div className="bg-white border-b-[3px] border-b-[--color-brand-red] px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-[--font-display] text-xl font-medium text-[--color-gray-95]">
            {title}
          </h1>
          <Badge className="px-2.5 py-1 bg-[--color-teal-10] text-[--color-teal-50] rounded text-[11px] font-medium">
            {layoutLabel}
          </Badge>
        </div>
        {isLoading && (
          <Skeleton className="h-4 w-64 mt-2" />
        )}
        {!isLoading && briefingData && (
          <p className="text-[13px] text-[--color-gray-50] mt-1">
            {formatFreshness(briefingData)}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
