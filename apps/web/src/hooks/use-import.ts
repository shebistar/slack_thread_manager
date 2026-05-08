import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client.js';
import type { ImportSummary } from '@slack-thread-manager/shared';

interface ImportHistoryParams {
  channelId: string;
  slackTeamId: string;
  messages: Record<string, unknown>[];
}

export function useImportHistory() {
  return useMutation({
    mutationFn: ({ channelId, slackTeamId, messages }: ImportHistoryParams) =>
      api
        .post<{ data: ImportSummary }>(`/admin/channels/${channelId}/import`, {
          slackTeamId,
          messages,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      toast.success(
        `Import complete: ${data.threadsStored} threads, ${data.messagesStored} messages stored`,
      );
    },
    onError: (error: Error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });
}
