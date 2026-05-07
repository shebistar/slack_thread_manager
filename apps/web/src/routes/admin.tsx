import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { Button } from '@/components/ui/button.js';
import { isAdmin } from '@/lib/role-layout.js';
import { RosterTable } from '@/components/roster/roster-table.js';
import { MemberFormDialog } from '@/components/roster/member-form-dialog.js';
import { ChannelsTable } from '@/components/channels/channels-table.js';
import { ChannelFormDialog } from '@/components/channels/channel-form-dialog.js';
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
import type { RosterMember } from '@slack-thread-manager/shared';

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
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>
        <TabsContent value="roster" className="mt-6">
          <RosterTabContent />
        </TabsContent>
        <TabsContent value="channels" className="mt-6">
          <ChannelsTabContent />
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
  const { data: workstreams = [] } = useWorkstreams();
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
  const { data: workstreams = [] } = useWorkstreams();
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
