import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client.js';
import type {
  BlocklistListQuery,
  BlocklistListResponse,
  BlocklistEntryResponse,
  CreateBlocklistEntry,
  UpdateBlocklistEntry,
} from '@slack-thread-manager/shared';

const BLOCKLIST_KEY = ['admin', 'blocklist'] as const;

export function useBlocklist(query: BlocklistListQuery) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.category) params.set('category', query.category);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);

  const queryString = params.toString();
  const path = queryString ? `/admin/blocklist?${queryString}` : '/admin/blocklist';

  return useQuery({
    queryKey: [...BLOCKLIST_KEY, query],
    queryFn: () =>
      api.get<{ data: BlocklistListResponse }>(path).then((r) => r.data),
  });
}

export function useCreateBlocklistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateBlocklistEntry) =>
      api
        .post<{ data: BlocklistEntryResponse }>('/admin/blocklist', dto)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BLOCKLIST_KEY });
      toast.success('Blocklist entry added');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}

export function useUpdateBlocklistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: UpdateBlocklistEntry & { id: string }) =>
      api
        .patch<{ data: BlocklistEntryResponse }>(`/admin/blocklist/${id}`, dto)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BLOCKLIST_KEY });
      toast.success('Blocklist entry updated');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}

export function useDeleteBlocklistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/blocklist/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BLOCKLIST_KEY });
      toast.success('Blocklist entry removed');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}
