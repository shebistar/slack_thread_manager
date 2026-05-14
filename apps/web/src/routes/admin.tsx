import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { Button } from '@/components/ui/button.js';
import { Badge } from '@/components/ui/badge.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { isAdmin } from '@/lib/role-layout.js';
import { RosterTable } from '@/components/roster/roster-table.js';
import { MemberFormDialog } from '@/components/roster/member-form-dialog.js';
import { ChannelsTable } from '@/components/channels/channels-table.js';
import { ChannelFormDialog } from '@/components/channels/channel-form-dialog.js';
import { StagingReviewItem } from '@/components/staging/staging-review-item.js';
import { StagingFilters } from '@/components/staging/staging-filters.js';
import { BlocklistTable } from '@/components/blocklist/blocklist-table.js';
import { BlocklistFormDialog } from '@/components/blocklist/blocklist-form-dialog.js';
import {
  useRosterMembers,
  useWorkstreams,
  useCreateRosterMember,
  useUpdateRosterMember,
  useDeleteRosterMember,
} from '@/hooks/use-roster.js';
import {
  useChannels,
  useCreateChannel,
  useUpdateChannel,
  useToggleChannel,
  useDeleteChannel,
} from '@/hooks/use-channels.js';
import type { ChannelWithWorkstream } from '@/hooks/use-channels.js';
import {
  useStagingQueue,
  useReviewStagingItem,
  useApproveAllClean,
} from '@/hooks/use-staging.js';
import {
  useBlocklist,
  useCreateBlocklistEntry,
  useUpdateBlocklistEntry,
  useDeleteBlocklistEntry,
} from '@/hooks/use-blocklist.js';
import { ImportForm } from '@/components/admin/import-form.js';
import type {
  RosterMember,
  StagingQueueFilter,
  BlocklistEntryResponse,
  BlocklistCategory,
  BlocklistListQuery,
} from '@slack-thread-manager/shared';

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.user)) {
      throw redirect({ to: '/access-denied' });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  useEffect(() => {
    document.title = 'Admin — Slack Thread Manager';
  }, []);

  return (
    <div className="py-6">
      <h1 className="text-2xl font-medium text-[--color-gray-95] mb-6">
        Administration
      </h1>
      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="staging">Staging</TabsTrigger>
          <TabsTrigger value="blocklist">Blocklist</TabsTrigger>
          <TabsTrigger value="import">Import History</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>
        <TabsContent value="roster" className="mt-6">
          <RosterTabContent />
        </TabsContent>
        <TabsContent value="channels" className="mt-6">
          <ChannelsTabContent />
        </TabsContent>
        <TabsContent value="staging" className="mt-6">
          <StagingTabContent />
        </TabsContent>
        <TabsContent value="blocklist" className="mt-6">
          <BlocklistTabContent />
        </TabsContent>
        <TabsContent value="import" className="mt-6">
          <ImportForm />
        </TabsContent>
        <TabsContent value="system" className="mt-6">
          <p className="text-sm text-[--color-gray-50]">
            System health and pipeline status coming in future stories.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RosterTabContent() {
  const { data: members = [], isLoading, error } = useRosterMembers();
  const { data: workstreams = [], error: workstreamsError } = useWorkstreams();
  const createMember = useCreateRosterMember();
  const updateMember = useUpdateRosterMember();
  const deleteMember = useDeleteRosterMember();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<RosterMember | undefined>(undefined);

  function openAdd() {
    setEditingMember(undefined);
    setDialogOpen(true);
  }

  function openEdit(member: RosterMember) {
    setEditingMember(member);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-[--color-gray-95]">Team Roster</h2>
        <Button
          className="bg-[--color-brand-red] text-white hover:opacity-90"
          onClick={openAdd}
        >
          Add Member
        </Button>
      </div>

      {workstreamsError && (
        <p className="text-sm text-red-600">
          Failed to load workstreams: {(workstreamsError as Error).message}
        </p>
      )}

      <RosterTable
        members={members}
        isLoading={isLoading}
        error={error as Error | null}
        onEdit={openEdit}
        onDelete={(id) => deleteMember.mutate(id)}
      />

      <MemberFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        member={editingMember}
        workstreams={workstreams}
        onSubmitCreate={(dto) => createMember.mutateAsync(dto)}
        onSubmitUpdate={(dto) => updateMember.mutateAsync(dto)}
      />
    </div>
  );
}

function ChannelsTabContent() {
  const { data: channels = [], isLoading, error } = useChannels();
  const { data: workstreams = [], error: workstreamsError } = useWorkstreams();
  const createChannel = useCreateChannel();
  const updateChannel = useUpdateChannel();
  const toggleChannel = useToggleChannel();
  const deleteChannel = useDeleteChannel();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<
    ChannelWithWorkstream | undefined
  >(undefined);

  function openAdd() {
    setEditingChannel(undefined);
    setDialogOpen(true);
  }

  function openEdit(channel: ChannelWithWorkstream) {
    setEditingChannel(channel);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-[--color-gray-95]">
          Channel Configuration
        </h2>
        <Button variant="outline" onClick={openAdd}>
          Add Channel
        </Button>
      </div>

      {workstreamsError && (
        <p className="text-sm text-red-600">
          Failed to load workstreams: {(workstreamsError as Error).message}
        </p>
      )}

      <ChannelsTable
        channels={channels}
        isLoading={isLoading}
        error={error as Error | null}
        onEdit={openEdit}
        onToggle={(id) => toggleChannel.mutate(id)}
        onDelete={(id) => deleteChannel.mutate(id)}
      />

      <ChannelFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        channel={editingChannel}
        workstreams={workstreams}
        onSubmitCreate={(dto) => createChannel.mutateAsync(dto)}
        onSubmitUpdate={(dto) => updateChannel.mutateAsync(dto)}
      />
    </div>
  );
}

function StagingTabContent() {
  const { data: workstreams = [] } = useWorkstreams();
  const [filters, setFilters] = useState<StagingQueueFilter>({ view: 'all' });
  const { data: queue, isLoading, error } = useStagingQueue(filters);
  const reviewItem = useReviewStagingItem();
  const approveAllClean = useApproveAllClean();
  const createBlocklist = useCreateBlocklistEntry();

  const [blocklistDialogOpen, setBlocklistDialogOpen] = useState(false);
  const [blocklistPrefill, setBlocklistPrefill] = useState<
    { term: string; category?: BlocklistCategory; replacement?: string } | undefined
  >(undefined);

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Failed to load staging queue: {(error as Error).message}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-[--color-gray-95]">
            Staging Review
          </h2>
          {queue && (
            <Badge variant="secondary">
              {queue.counts.pending} pending
            </Badge>
          )}
          {queue && queue.counts.flagged > 0 && (
            <Badge variant="destructive">
              {queue.counts.flagged} flagged
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          disabled={approveAllClean.isPending || !queue || queue.items.filter((i) => i.flags.length === 0).length === 0}
          onClick={() => approveAllClean.mutate({
            batchId: filters.batchId,
            workstreamId: filters.workstreamId,
          })}
        >
          Approve all clean
        </Button>
      </div>

      <StagingFilters
        filters={filters}
        onFiltersChange={setFilters}
        workstreams={workstreams.map((ws) => ({ id: ws.id, name: ws.name }))}
        batches={queue?.batchSummary ?? []}
      />

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {queue && queue.items.length === 0 && (
        <p className="text-sm text-[--color-gray-50] py-8 text-center">
          No pending items match the current filters.
        </p>
      )}

      {queue && queue.items.length > 0 && (
        <div className="space-y-3">
          {queue.items.map((item) => (
            <StagingReviewItem
              key={item.id}
              item={item}
              onApprove={(id) => reviewItem.mutate({ id, action: 'approve' })}
              onReject={(id) => reviewItem.mutate({ id, action: 'reject' })}
              onAddToBlocklist={(req) => {
                setBlocklistPrefill(req);
                setBlocklistDialogOpen(true);
              }}
              isReviewing={reviewItem.isPending}
            />
          ))}
        </div>
      )}

      <BlocklistFormDialog
        open={blocklistDialogOpen}
        onOpenChange={setBlocklistDialogOpen}
        prefill={blocklistPrefill}
        onSubmitCreate={(dto) => createBlocklist.mutateAsync(dto)}
      />
    </div>
  );
}

function BlocklistTabContent() {
  const [query, setQuery] = useState<BlocklistListQuery>({
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const { data: blocklist, isLoading, error } = useBlocklist(query);
  const createEntry = useCreateBlocklistEntry();
  const updateEntry = useUpdateBlocklistEntry();
  const deleteEntry = useDeleteBlocklistEntry();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<BlocklistEntryResponse | undefined>(undefined);

  function openAdd() {
    setEditingEntry(undefined);
    setDialogOpen(true);
  }

  function openEdit(entry: BlocklistEntryResponse) {
    setEditingEntry(entry);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-[--color-gray-95]">
            Anonymization Blocklist
          </h2>
          {blocklist && (
            <Badge variant="secondary">
              {blocklist.total} {blocklist.total === 1 ? 'entry' : 'entries'}
            </Badge>
          )}
        </div>
        <Button
          className="bg-[--color-brand-red] text-white hover:opacity-90"
          onClick={openAdd}
        >
          Add Entry
        </Button>
      </div>

      <BlocklistTable
        entries={blocklist?.items ?? []}
        isLoading={isLoading}
        error={error as Error | null}
        search={query.search ?? ''}
        onSearchChange={(search) =>
          setQuery((q) => ({ ...q, search: search || undefined }))
        }
        categoryFilter={query.category}
        onCategoryFilterChange={(category) =>
          setQuery((q) => ({ ...q, category }))
        }
        sortBy={query.sortBy ?? 'createdAt'}
        sortOrder={query.sortOrder ?? 'desc'}
        onSortChange={(sortBy, sortOrder) =>
          setQuery((q) => ({ ...q, sortBy, sortOrder }))
        }
        onEdit={openEdit}
        onDelete={(id) => deleteEntry.mutate(id)}
      />

      <BlocklistFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editingEntry}
        onSubmitCreate={(dto) => createEntry.mutateAsync(dto)}
        onSubmitUpdate={(dto) => updateEntry.mutateAsync(dto)}
      />
    </div>
  );
}
