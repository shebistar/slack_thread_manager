import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client.js';
import type {
  SilenceThresholdListResponse,
  SilenceThresholdResponse,
  UpdateGlobalThreshold,
  UpsertWorkstreamThreshold,
} from '@slack-thread-manager/shared';

const SILENCE_THRESHOLDS_KEY = ['admin', 'silence', 'thresholds'] as const;

export function useSilenceThresholds() {
  return useQuery({
    queryKey: SILENCE_THRESHOLDS_KEY,
    queryFn: () =>
      api
        .get<{ data: SilenceThresholdListResponse }>('/admin/silence/thresholds')
        .then((r) => r.data),
  });
}

export function useUpdateGlobalThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateGlobalThreshold) =>
      api
        .put<{ data: SilenceThresholdResponse }>(
          '/admin/silence/thresholds/global',
          dto,
        )
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SILENCE_THRESHOLDS_KEY });
      toast.success('Global silence threshold updated');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}

export function useUpsertWorkstreamThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpsertWorkstreamThreshold) =>
      api
        .put<{ data: SilenceThresholdResponse }>(
          '/admin/silence/thresholds/workstream',
          dto,
        )
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SILENCE_THRESHOLDS_KEY });
      toast.success('Workstream threshold saved');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}

export function useRemoveWorkstreamThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workstreamId: string) =>
      api.delete<void>(`/admin/silence/thresholds/workstream/${workstreamId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SILENCE_THRESHOLDS_KEY });
      toast.success('Workstream threshold reset to global default');
    },
    onError: (error: Error) => {
      toast.error(`Operation failed: ${error.message}`);
    },
  });
}
