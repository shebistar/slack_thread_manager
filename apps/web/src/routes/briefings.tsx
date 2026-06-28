import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { getLayoutVariant } from '@/lib/role-layout.js';
import { useTodayBriefing, useMarkItemRead } from '@/hooks/use-briefings.js';
import type { BriefingWithItems, BriefingItem } from '@/hooks/use-briefings.js';
import { useSilenceAlerts } from '@/hooks/use-silence.js';
import { StatsBar } from '@/components/stats-bar/stats-bar.js';
import { EnrichmentPanel } from '@/components/enrichment-panel/enrichment-panel.js';
import { BriefingCard } from '@/components/briefing-card/briefing-card.js';
import { BackfillSection } from '@/components/backfill-section/backfill-section.js';
import { WorkstreamFilter } from '@/components/workstream-filter/workstream-filter.js';
import { BriefingPageFrame } from '@/components/briefing-page-frame/briefing-page-frame.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { SilenceMonitor } from '@/components/silence-monitor/silence-monitor.js';
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
    return <SplitPanelLayout />;
  }

  return <DashboardLayout />;
}

const ITEM_TYPE_PRIORITY: Record<string, number> = {
  backfill: -1,
  cross_workstream: 0,
  orphaned_action: 1,
  gone_quiet: 1.5,
  standard: 2,
};

function normalizeItemType(itemType: string): string {
  return itemType.toLowerCase();
}

function sortByItemPriority(items: BriefingItem[]): BriefingItem[] {
  return [...items].sort(
    (a, b) =>
      (ITEM_TYPE_PRIORITY[normalizeItemType(a.itemType)] ?? 99) -
      (ITEM_TYPE_PRIORITY[normalizeItemType(b.itemType)] ?? 99),
  );
}

export function partitionItems(items: BriefingItem[]): {
  backfillItems: BriefingItem[];
  dailyItems: BriefingItem[];
} {
  const backfillItems: BriefingItem[] = [];
  const dailyItems: BriefingItem[] = [];
  for (const item of items) {
    if (normalizeItemType(item.itemType) === 'backfill') {
      backfillItems.push(item);
    } else {
      dailyItems.push(item);
    }
  }
  return { backfillItems, dailyItems };
}

export function FeedLayout() {
  const { data, isLoading, isError, error } = useTodayBriefing();
  const { data: silenceAlerts } = useSilenceAlerts();
  const [selectedWorkstream, setSelectedWorkstream] = useState<string | null>(null);
  const markItemRead = useMarkItemRead();

  const alertsByThreadId = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of silenceAlerts?.alerts ?? []) m.set(a.threadId, a.silenceDays);
    return m;
  }, [silenceAlerts?.alerts]);

  const sortedItems = useMemo(() => {
    if (!data?.items) return [];
    return sortByItemPriority(data.items);
  }, [data?.items]);

  const { backfillItems, dailyItems } = useMemo(
    () => partitionItems(sortedItems),
    [sortedItems],
  );

  const workstreams = useMemo(() => {
    if (dailyItems.length === 0) return [];
    const names = new Set<string>();
    for (const item of dailyItems) {
      if (item.workstreamName) names.add(item.workstreamName);
    }
    return Array.from(names).sort();
  }, [dailyItems]);

  const filteredDailyItems = useMemo(
    () =>
      selectedWorkstream
        ? dailyItems.filter((i) => i.workstreamName === selectedWorkstream)
        : dailyItems,
    [dailyItems, selectedWorkstream],
  );

  const featuredItem = filteredDailyItems[0] ?? null;
  const standardItems = filteredDailyItems.slice(1);

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
        <FeedEmptyState hasFilter={false} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="sr-only">Daily Briefing</h1>

      <BriefingPageFrame
        title="Daily Briefing"
        layoutLabel="Filtered Brief"
        briefingData={data}
        isLoading={isLoading}
      >
        {isLoading ? (
          <FeedSkeleton />
        ) : data ? (
          <div className="space-y-0">
            {backfillItems.length > 0 && (
              <div className="px-6 pt-6">
                <BackfillSection
                  items={backfillItems}
                  readItemIds={data.readItemIds ?? []}
                  onMarkRead={(id) => markItemRead.mutate(id)}
                  variant="feed"
                  showDailyEmptyState={selectedWorkstream === null && dailyItems.length === 0}
                />
              </div>
            )}

            <div className="bg-[--color-gray-10] border-b border-[--color-gray-20] px-6 py-3">
              <WorkstreamFilter
                workstreams={workstreams}
                selectedWorkstream={selectedWorkstream}
                onSelect={setSelectedWorkstream}
              />
            </div>

            <div className="p-6 space-y-4">
              {filteredDailyItems.length === 0 ? (
                backfillItems.length > 0 && selectedWorkstream === null && dailyItems.length === 0 ? null : (
                  <FeedEmptyState hasFilter={selectedWorkstream !== null} />
                )
              ) : (
                <>
                  {featuredItem && (
                    <FeedFeaturedCard
                      item={featuredItem}
                      silenceDays={alertsByThreadId.get(featuredItem.threadId) ?? null}
                      isRead={(data.readItemIds ?? []).includes(featuredItem.id)}
                      onExpandChange={() => markItemRead.mutate(featuredItem.id)}
                    />
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
                        isRead={(data.readItemIds ?? []).includes(item.id)}
                        onExpandChange={() => markItemRead.mutate(item.id)}
                        silenceDays={alertsByThreadId.get(item.threadId) ?? null}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </BriefingPageFrame>
    </div>
  );
}

function FeedFeaturedCard({ item, silenceDays, isRead, onExpandChange }: { item: BriefingItem; silenceDays?: number | null; isRead?: boolean; onExpandChange?: () => void }) {
  return (
    <div className="border-l-[3px] border-l-[--color-brand-red] rounded-lg">
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
        isRead={isRead}
        onExpandChange={onExpandChange ? () => onExpandChange() : undefined}
        silenceDays={silenceDays}
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

export function SplitPanelLayout() {
  const { data, isLoading, isError, error } = useTodayBriefing();
  const { data: silenceAlerts } = useSilenceAlerts();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const markItemRead = useMarkItemRead();

  const alertsByThreadId = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of silenceAlerts?.alerts ?? []) m.set(a.threadId, a.silenceDays);
    return m;
  }, [silenceAlerts?.alerts]);

  const sortedItems = useMemo(() => {
    if (!data?.items) return [];
    return sortByItemPriority(data.items);
  }, [data?.items]);

  const { backfillItems, dailyItems } = useMemo(
    () => partitionItems(sortedItems),
    [sortedItems],
  );

  useEffect(() => {
    if (selectedItemId && sortedItems.length > 0 && !sortedItems.some((i) => i.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [selectedItemId, sortedItems]);

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
            Your first briefing hasn&apos;t been generated yet.
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

      <BriefingPageFrame
        title="Daily Briefing — Intelligence Report"
        layoutLabel="Lead Architect View"
        briefingData={data}
        isLoading={isLoading}
      >
        {isLoading ? (
          <SplitPanelSkeleton />
        ) : data ? (
          <div className="mt-6 flex flex-col xl:flex-row gap-6">
            <div className="flex-1 min-w-0 space-y-4" role="listbox" aria-label="Briefing topics">
              {backfillItems.length > 0 && (
                <BackfillSection
                  items={backfillItems}
                  readItemIds={data.readItemIds ?? []}
                  onMarkRead={(id) => markItemRead.mutate(id)}
                  variant="split-panel"
                  selectedItemId={selectedItemId}
                  onSelectItem={(id) => {
                    const isDeselect = selectedItemId === id;
                    setSelectedItemId(isDeselect ? null : id);
                    if (!isDeselect) markItemRead.mutate(id);
                  }}
                  showDailyEmptyState={dailyItems.length === 0}
                />
              )}

              {dailyItems.length === 0 ? (
                backfillItems.length > 0 ? null : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-lg text-[--color-gray-50]">No briefing items today.</p>
                    <p className="text-sm text-[--color-gray-50] mt-2">
                      Check back after the next batch run.
                    </p>
                  </div>
                )
              ) : (
                dailyItems.map((item) => (
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
                    selected={selectedItemId === item.id}
                    isRead={(data.readItemIds ?? []).includes(item.id)}
                    onSelect={() => {
                      const isDeselect = selectedItemId === item.id;
                      setSelectedItemId(isDeselect ? null : item.id);
                      if (!isDeselect) markItemRead.mutate(item.id);
                    }}
                    silenceDays={alertsByThreadId.get(item.threadId) ?? null}
                  />
                ))
              )}
            </div>

            <EnrichmentPanel
              threadId={selectedItemId ? (sortedItems.find((i) => i.id === selectedItemId)?.threadId ?? null) : null}
              isOpen={sidePanelOpen}
              onToggle={() => setSidePanelOpen((prev) => !prev)}
            />
          </div>
        ) : null}
      </BriefingPageFrame>
    </div>
  );
}

function SplitPanelSkeleton() {
  return (
    <div className="mt-6 flex flex-col xl:flex-row gap-6">
      <div className="flex-1 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
      <div className="xl:w-[360px] shrink-0">
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function DashboardLayout() {
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

      <BriefingPageFrame
        title="Briefing Dashboard"
        layoutLabel="Executive Scan"
        briefingData={data}
        isLoading={isLoading}
      >
        <StatsBar data={data} isLoading={isLoading} />

        {isLoading ? (
          <PanelsSkeleton />
        ) : data ? (
          <DashboardPanels data={data} />
        ) : null}
      </BriefingPageFrame>
    </div>
  );
}

function DashboardPanels({ data }: { data: BriefingWithItems }) {
  const { backfillItems, dailyItems } = useMemo(
    () => partitionItems(sortByItemPriority(data.items)),
    [data.items],
  );

  const workstreamStats = useMemo(() => {
    const map = new Map<string, { count: number; messageCount: number; hasQuiet: boolean; latestActivityAt: string | null }>();
    dailyItems.forEach((item) => {
      const name = item.workstreamName ?? 'Unassigned';
      const existing = map.get(name) ?? { count: 0, messageCount: 0, hasQuiet: false, latestActivityAt: null };
      let latestActivityAt = existing.latestActivityAt;
      if (item.latestActivityAt) {
        if (!latestActivityAt || new Date(item.latestActivityAt) > new Date(latestActivityAt)) {
          latestActivityAt = item.latestActivityAt;
        }
      }
      map.set(name, {
        count: existing.count + 1,
        messageCount: existing.messageCount + (item.messageCount ?? 0),
        hasQuiet: existing.hasQuiet || item.itemType === 'gone_quiet',
        latestActivityAt,
      });
    });
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([name, value]) => ({ name, ...value }));
  }, [dailyItems]);

  const decisionItems = useMemo(
    () =>
      dailyItems.filter((i) =>
        ['cross_workstream', 'orphaned_action', 'standard'].includes(normalizeItemType(i.itemType)),
      ),
    [dailyItems],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 mt-6">
      <div className="space-y-6">
        {backfillItems.length > 0 && (
          <BackfillSection
            items={backfillItems}
            readItemIds={[]}
            onMarkRead={() => {}}
            variant="dashboard"
            showDailyEmptyState={dailyItems.length === 0}
          />
        )}

        <section aria-labelledby="workstream-status-heading">
          <Card>
            <div className="flex items-center justify-between bg-[--color-gray-10] border-b border-[--color-gray-20] px-4 py-3">
              <h2 id="workstream-status-heading" className="text-[13px] font-medium text-[--color-gray-95]">Workstream Status</h2>
              <span className="text-[11px] text-[--color-gray-30]">Last 24h</span>
            </div>
            <CardContent className="p-0">
              {workstreamStats.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[--color-gray-50]">No workstreams</p>
              ) : (
                <div>
                  {workstreamStats.map((ws) => (
                    <div
                      key={ws.name}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-[--color-gray-10] last:border-b-0"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${ws.hasQuiet ? 'bg-[--color-yellow-30]' : 'bg-[--color-green-50]'}`}
                        aria-label={ws.hasQuiet ? 'Quiet' : 'Active'}
                      />
                      <span className="text-sm font-medium text-[--color-gray-95] flex-1">{ws.name}</span>
                      <span className="text-xs text-[--color-gray-50]">
                        {ws.count} {ws.count === 1 ? 'thread' : 'threads'} · {ws.messageCount} messages
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="key-decisions-heading">
          <Card>
            <div className="bg-[--color-gray-10] border-b border-[--color-gray-20] px-4 py-3">
              <h2 id="key-decisions-heading" className="text-[13px] font-medium text-[--color-gray-95]">Key Decisions</h2>
            </div>
            <CardContent className="p-4">
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

      <div className="space-y-6">
        <section aria-labelledby="silence-monitor-heading">
          <SilenceMonitor />
        </section>
      </div>
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
