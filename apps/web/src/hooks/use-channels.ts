import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client.js';
import type { CreateChannel, UpdateChannel } from '@slack-thread-manager/shared';

export interface ChannelWithWorkstream {
  id: string;
  slackChannelId: string;
  name: string;
  workstreamId: string | null;
  isActive: boolean;
  createdAt: string;
  workstreamName: string | null;
}

export function useChannels() {
  return useQuery({
    queryKey: ['admin', 'channels'],
    queryFn: () =>
      api
        .get<{ data: ChannelWithWorkstream[] }>('/admin/channels')
        .then((r) => r.data),
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateChannel) =>
      api
        .post<{ data: ChannelWithWorkstream }>('/admin/channels', dto)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'channels'] });
      toast.success('Channel added');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: UpdateChannel & { id: string }) =>
      api
        .patch<{ data: ChannelWithWorkstream }>(`/admin/channels/${id}`, dto)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'channels'] });
      toast.success('Channel updated');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}

export function useToggleChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .patch<{ data: ChannelWithWorkstream }>(
          `/admin/channels/${id}/toggle`,
          {},
        )
        .then((r) => r.data),
    onSuccess: (_data, _id) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'channels'] });
      toast.success('Channel status toggled');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/channels/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'channels'] });
      toast.success('Channel removed');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}
