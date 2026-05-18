import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client.js';
import type { SilenceAlertListResponse, SilenceAlertResponse } from '@slack-thread-manager/shared';

export const silenceKeys = {
  all: ['silence'] as const,
  alerts: () => [...silenceKeys.all, 'alerts'] as const,
};

export function useSilenceAlerts() {
  return useQuery({
    queryKey: silenceKeys.alerts(),
    queryFn: () =>
      api
        .get<{ data: SilenceAlertListResponse }>('/silence/alerts')
        .then((r) => r.data),
  });
}

export function useDismissSilenceAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: string) =>
      api
        .patch<{ data: { id: string; status: string } }>(
          `/silence/alerts/${alertId}/dismiss`,
          {},
        )
        .then((r) => r.data),
    onMutate: async (alertId) => {
      await queryClient.cancelQueries({ queryKey: silenceKeys.alerts() });
      const previous = queryClient.getQueryData<SilenceAlertListResponse>(silenceKeys.alerts());

      if (previous) {
        queryClient.setQueryData<SilenceAlertListResponse>(silenceKeys.alerts(), {
          alerts: previous.alerts.filter((a: SilenceAlertResponse) => a.id !== alertId),
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(silenceKeys.alerts(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: silenceKeys.alerts() });
    },
  });
}
