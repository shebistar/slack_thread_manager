import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { getLayoutVariant } from '@/lib/role-layout.js';
import { useTodayBriefing } from '@/hooks/use-briefings.js';
import type { BriefingWithItems, BriefingItem } from '@/hooks/use-briefings.js';
import { StatsBar } from '@/components/stats-bar/stats-bar.js';
import { BriefingCard } from '@/components/briefing-card/briefing-card.js';
import { WorkstreamFilter } from '@/components/workstream-filter/workstream-filter.js';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import type { UserRole } from '@slack-thread-manager/shared';

export const Route = createFileRoute('/briefings')({
  component: BriefingsPage,
});

function BriefingsPage() {
  const { user } = Route.useRouteContext();

  useEffect(() => {
    document.title = 'Daily Briefing — Slack Thread Manager';
  }, []);

  const layout = user ? getLayoutVariant(user.role as UserRole) : 'dashboard';

  if (layout === 'feed') {
    return <FeedLayout />;
  }

  if (layout === 'split-panel') {
    return (
      <div>
        <h1 className="sr-only">Daily Briefing</h1>
        <div className="flex items-center justify-center py-24">
          <p className="text-lg text-[--color-gray-50]">
            Coming soon — Intelligence Report layout
          </p>
        </div>
      </div>
    );
  }

  return <DashboardLayout />;
}

const ITEM_TYPE_PRIORITY: Record<string, number> = {
  cross_workstream: 0,
  orphaned_action: 1,
  standard: 2,
  gone_quiet: 3,
};

function FeedLayout() {
  const { data, isLoading, isError, error } = useTodayBriefing();
  const [selectedWorkstream, setSelectedWorkstream] = useState<string | null>(null);

  const workstreams = useMemo(() => {
    if (!data?.items) return [];
    const names = new Set<string>();
    for (const item of data.items) {
      if (item.workstreamName) names.add(item.workstreamName);
    }
    return Array.from(names).sort();
  }, [data?.items]);

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    const items = selectedWorkstream
      ? data.items.filter((i) => i.workstreamName === selectedWorkstream)
      : data.items;
    return [...items].sort(
      (a, b) => (ITEM_TYPE_PRIORITY[a.itemType] ?? 99) - (ITEM_TYPE_PRIORITY[b.itemType] ?? 99),
    );
  }, [data?.items, selectedWorkstream]);

  const featuredItem = filteredItems[0] ?? null;
  const standardItems = filteredItems.slice(1);

  if (!isLoading && isError) {
    return (
      <div>
        <h1 className="sr-only">Daily Briefing</h1>
        <div className="rounded-md border border-[--color-brand-red] bg-white px-4 py-6 text-center">
          <p className="text-lg text-[--color-gray-95]">Unable to load your briefing right now.</p>
          <p className="mt-2 text-sm text-[--color-gray-50]">
            {error instanceof Error ? error.message : 'Please try again shortly.'}
          </p>
        </div>
      </div>
    );
  }

  if (!isLoading && data === null) {
    return (
      <div>
        <h1 className="sr-only">Daily Briefing</h1>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg text-[--color-gray-50]">
            Your first briefing hasn't been generated yet.
          </p>
          <p className="text-sm text-[--color-gray-50] mt-2">
            Check Admin → System Health to verify scheduling is active.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="sr-only">Daily Briefing</h1>

      {isLoading ? (
        <FreshnessTimestampSkeleton />
      ) : data ? (
        <FreshnessTimestamp data={data} />
      ) : null}

      {isLoading ? (
        <FeedSkeleton />
      ) : data ? (
        <div className="mt-6 space-y-6">
          <WorkstreamFilter
            workstreams={workstreams}
            selectedWorkstream={selectedWorkstream}
            onSelect={setSelectedWorkstream}
          />

          {filteredItems.length === 0 ? (
            <FeedEmptyState hasFilter={selectedWorkstream !== null} />
          ) : (
            <>
              {featuredItem && (
                <FeedFeaturedCard item={featuredItem} />
              )}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {standardItems.map((item) => (
                  <BriefingCard
                    key={item.id}
                    headline={item.headline}
                    workstreamName={item.workstreamName}
                    sourceThreadUrl={item.sourceThreadUrl}
                    itemType={item.itemType}
                    variant="standard"
                    summaryText={item.summaryText}
                    messageCount={item.messageCount}
                    participantCount={item.participantCount}
                    latestActivityAt={item.latestActivityAt}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FeedFeaturedCard({ item }: { item: BriefingItem }) {
  return (
    <div className="w-full">
      <BriefingCard
        headline={item.headline}
        workstreamName={item.workstreamName}
        sourceThreadUrl={item.sourceThreadUrl}
        itemType={item.itemType}
        variant="standard"
        summaryText={item.summaryText}
        messageCount={item.messageCount}
        participantCount={item.participantCount}
        latestActivityAt={item.latestActivityAt}
      />
    </div>
  );
}

function FeedEmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-lg text-[--color-gray-50]">
        {hasFilter
          ? 'No items match the selected workstream.'
          : 'No briefing items for your assigned workstreams today.'}
      </p>
      <p className="text-sm text-[--color-gray-50] mt-2">
        {hasFilter
          ? 'Try selecting "All Workstreams" or check back after the next batch.'
          : 'Check Admin → System Health to verify scheduling is active.'}
      </p>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="mt-6 space-y-4">
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function DashboardLayout() {
  const { data, isLoading, isError, error } = useTodayBriefing();

  if (!isLoading && isError) {
    return (
      <div>
        <h1 className="sr-only">Daily Briefing</h1>
        <div className="rounded-md border border-[--color-brand-red] bg-white px-4 py-6 text-center">
          <p className="text-lg text-[--color-gray-95]">Unable to load your briefing right now.</p>
          <p className="mt-2 text-sm text-[--color-gray-50]">
            {error instanceof Error ? error.message : 'Please try again shortly.'}
          </p>
        </div>
      </div>
    );
  }

  if (!isLoading && data === null) {
    return (
      <div>
        <h1 className="sr-only">Daily Briefing</h1>
        <StatsBar data={null} isLoading={false} />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg text-[--color-gray-50]">
            Your first briefing hasn't been generated yet.
          </p>
          <p className="text-sm text-[--color-gray-50] mt-2">
            Check Admin → System Health to verify scheduling is active.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="sr-only">Daily Briefing</h1>

      <StatsBar data={data} isLoading={isLoading} />

      {isLoading ? (
        <FreshnessTimestampSkeleton />
      ) : data ? (
        <FreshnessTimestamp data={data} />
      ) : null}

      {isLoading ? (
        <PanelsSkeleton />
      ) : data ? (
        <DashboardPanels data={data} />
      ) : null}
    </div>
  );
}

function FreshnessTimestamp({ data }: { data: BriefingWithItems }) {
  const { briefing } = data;
  const generatedAt = new Date(briefing.generatedAt);
  const now = new Date();
  const ageMs = now.getTime() - generatedAt.getTime();
  const isStale = ageMs > 24 * 60 * 60 * 1000;
  const isToday = generatedAt.toDateString() === now.toDateString();

  const timeStr = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(generatedAt);
  const dateStr = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(generatedAt);

  const nextBatchTime = data.nextBatchScheduledAt
    ? new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(data.nextBatchScheduledAt))
    : null;

  return (
    <div className="mt-3 space-y-2">
      <span
        className="text-xs text-[--color-gray-50]"
        role="status"
        aria-label="Briefing freshness"
      >
        {isToday ? 'Generated today' : `Generated on ${dateStr}`} at {timeStr} from {briefing.threadCount} threads across {briefing.workstreamCount} workstreams
      </span>

      {isStale && (
        <div
          className="rounded-md border border-[--color-yellow-30] bg-[--color-yellow-10] px-4 py-3 text-sm text-[--color-gray-95]"
          role="alert"
        >
          Briefing data is from{' '}
          {dateStr}
          . Next batch scheduled at {nextBatchTime ?? '4:00 AM'}.
        </div>
      )}
    </div>
  );
}

function FreshnessTimestampSkeleton() {
  return (
    <div className="mt-3">
      <Skeleton className="h-4 w-80" />
    </div>
  );
}

function DashboardPanels({ data }: { data: BriefingWithItems }) {
  const { items } = data;

  const workstreamStats = useMemo(() => {
    const map = new Map<string, { count: number; latestActivityAt: string | null }>();
    items.forEach((item) => {
      const name = item.workstreamName ?? 'Unassigned';
      const existing = map.get(name) ?? { count: 0, latestActivityAt: null };
      let latestActivityAt = existing.latestActivityAt;
      if (item.latestActivityAt) {
        if (!latestActivityAt || new Date(item.latestActivityAt) > new Date(latestActivityAt)) {
          latestActivityAt = item.latestActivityAt;
        }
      }
      map.set(name, { count: existing.count + 1, latestActivityAt });
    });
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([name, value]) => ({ name, count: value.count, latestActivityAt: value.latestActivityAt }));
  }, [items]);

  const decisionItems = useMemo(
    () => items.filter((i) => ['cross_workstream', 'orphaned_action', 'standard'].includes(i.itemType)),
    [items],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
      <section aria-labelledby="workstream-status-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="workstream-status-heading">Workstream Status</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {workstreamStats.length === 0 ? (
              <p className="px-6 py-4 text-sm text-[--color-gray-50]">No workstreams</p>
            ) : (
              <table className="w-full">
                <thead className="sr-only">
                  <tr>
                    <th>Workstream</th>
                    <th>Threads</th>
                    <th>Latest activity</th>
                  </tr>
                </thead>
                <tbody>
                  {workstreamStats.map((ws) => (
                    <tr
                      key={ws.name}
                      className="border-b border-[--color-gray-20] last:border-b-0"
                    >
                      <td className="px-6 py-3 text-sm font-medium text-[--color-gray-95]">
                        {ws.name}
                      </td>
                      <td className="px-6 py-3 text-sm text-[--color-gray-50] text-right tabular-nums">
                        {ws.count} {ws.count === 1 ? 'thread' : 'threads'}
                      </td>
                      <td className="px-6 py-3 text-sm text-[--color-gray-50] text-right">
                        {ws.latestActivityAt
                          ? new Intl.DateTimeFormat(undefined, {
                            dateStyle: 'medium',
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(new Date(ws.latestActivityAt))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="key-decisions-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="key-decisions-heading">Key Decisions</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {decisionItems.length === 0 ? (
              <p className="text-sm text-[--color-gray-50]">No decisions in this briefing</p>
            ) : (
              decisionItems.map((item) => (
                <BriefingCard
                  key={item.id}
                  headline={item.headline}
                  workstreamName={item.workstreamName}
                  sourceThreadUrl={item.sourceThreadUrl}
                  itemType={item.itemType}
                  variant="compact"
                />
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function PanelsSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-36" />
        </CardHeader>
        <CardContent>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="py-3">
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
