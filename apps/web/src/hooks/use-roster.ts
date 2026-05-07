import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client.js';
import type { RosterMember, Workstream, CreateRosterMember, UpdateRosterMember } from '@slack-thread-manager/shared';

export function useRosterMembers() {
  return useQuery({
    queryKey: ['admin', 'roster'],
    queryFn: () =>
      api.get<{ data: RosterMember[] }>('/admin/roster').then((r) => r.data),
  });
}

export function useWorkstreams() {
  return useQuery({
    queryKey: ['admin', 'workstreams'],
    queryFn: () =>
      api.get<{ data: Workstream[] }>('/admin/roster/workstreams').then((r) => r.data),
  });
}

export function useCreateRosterMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRosterMember) =>
      api.post<{ data: RosterMember }>('/admin/roster', dto).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'roster'] });
      toast.success('Member added');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}

export function useUpdateRosterMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: UpdateRosterMember & { id: string }) =>
      api
        .patch<{ data: RosterMember }>(`/admin/roster/${id}`, dto)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'roster'] });
      toast.success('Member updated');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}

export function useDeleteRosterMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<void>(`/admin/roster/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'roster'] });
      toast.success('Member removed');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}
