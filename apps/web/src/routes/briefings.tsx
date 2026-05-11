import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { getLayoutVariant } from '@/lib/role-layout.js';
import { useTodayBriefing } from '@/hooks/use-briefings.js';
import type { BriefingWithItems } from '@/hooks/use-briefings.js';
import { StatsBar } from '@/components/stats-bar/stats-bar.js';
import { BriefingCard } from '@/components/briefing-card/briefing-card.js';
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
    return (
      <div>
        <h1 className="sr-only">Daily Briefing</h1>
        <div className="flex items-center justify-center py-24">
          <p className="text-lg text-[--color-gray-50]">
            Coming soon — Filtered Brief layout
          </p>
        </div>
      </div>
    );
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

function DashboardLayout() {
  const { data, isLoading } = useTodayBriefing();

  if (!isLoading && !data) {
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

  const timeStr = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(generatedAt);

  return (
    <div className="mt-3 space-y-2">
      <span
        className="text-xs text-[--color-gray-50]"
        role="status"
        aria-label="Briefing freshness"
      >
        Generated today at {timeStr} from {briefing.threadCount} threads across{' '}
        {briefing.workstreamCount} workstreams
      </span>

      {isStale && (
        <div
          className="rounded-md border border-[--color-yellow-30] bg-[--color-yellow-10] px-4 py-3 text-sm text-[--color-gray-95]"
          role="alert"
        >
          Briefing data is from{' '}
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
          }).format(generatedAt)}
          . Next batch scheduled at the configured generation time.
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
    const map = new Map<string, number>();
    items.forEach((item) => {
      const name = item.workstreamName ?? 'Unassigned';
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));
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
