import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client.js';
import type {
  StagingQueueList,
  StagingQueueFilter,
  ReviewStagingItem,
  ApproveAllCleanRequest,
  ApproveAllCleanResponse,
  BatchSummary,
} from '@slack-thread-manager/shared';

const STAGING_KEY = ['admin', 'staging'] as const;

export function useStagingQueue(filters: StagingQueueFilter) {
  const params = new URLSearchParams();
  if (filters.view) params.set('view', filters.view);
  if (filters.workstreamId) params.set('workstreamId', filters.workstreamId);
  if (filters.batchId) params.set('batchId', filters.batchId);

  const queryString = params.toString();
  const path = queryString ? `/admin/staging?${queryString}` : '/admin/staging';

  return useQuery({
    queryKey: [...STAGING_KEY, filters],
    queryFn: () =>
      api.get<{ data: StagingQueueList }>(path).then((r) => r.data),
  });
}

export function useReviewStagingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReviewStagingItem['action'] }) =>
      api
        .post<{ data: { batchComplete: boolean; remainingPending: number } }>(
          `/admin/staging/${id}/review`,
          { action },
        )
        .then((r) => r.data),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: STAGING_KEY });
      const verb = data.batchComplete ? 'Briefings cleared for delivery' : 'Item reviewed';
      toast.success(verb);
    },
    onError: (error: Error) => {
      toast.error(`Review failed: ${error.message}`);
    },
  });
}

export function useApproveAllClean() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApproveAllCleanRequest) =>
      api
        .post<{ data: ApproveAllCleanResponse }>('/admin/staging/approve-all-clean', body)
        .then((r) => r.data),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: STAGING_KEY });
      if (data.batchComplete) {
        toast.success('Briefings cleared for delivery');
      } else {
        toast.success(`${data.approvedCount} clean items approved`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Bulk approval failed: ${error.message}`);
    },
  });
}

export function useBatchProgress(batchId: string | null) {
  return useQuery({
    queryKey: [...STAGING_KEY, 'batch', batchId],
    queryFn: () =>
      api
        .get<{ data: BatchSummary }>(`/admin/staging/batches/${batchId}`)
        .then((r) => r.data),
    enabled: !!batchId,
  });
}
