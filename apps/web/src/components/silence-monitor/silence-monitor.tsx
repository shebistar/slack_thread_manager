import { Card, CardContent } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useSilenceAlerts, useDismissSilenceAlert } from '@/hooks/use-silence.js';
import type { SilenceAlertResponse } from '@slack-thread-manager/shared';

export function SilenceMonitor() {
  const { data, isLoading } = useSilenceAlerts();
  const dismissMutation = useDismissSilenceAlert();

  const alerts = data?.alerts ?? [];

  return (
    <Card>
      <div className="bg-[--color-yellow-10] border-b border-[--color-gray-20] px-4 py-3">
        <h2 id="silence-monitor-heading" className="text-[13px] font-medium text-[--color-gray-95]">
          Silence Monitor
        </h2>
      </div>
      <CardContent className="p-4">
        {isLoading ? (
          <SilenceMonitorSkeleton />
        ) : alerts.length === 0 ? (
          <SilenceMonitorEmpty />
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <SilenceItem
                key={alert.id}
                alert={alert}
                onDismiss={() => dismissMutation.mutate(alert.id)}
                isDismissing={dismissMutation.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SilenceItem({
  alert,
  onDismiss,
  isDismissing,
}: {
  alert: SilenceAlertResponse;
  onDismiss: () => void;
  isDismissing: boolean;
}) {
  return (
    <div className="bg-[--color-yellow-10] border-l-[3px] border-l-[--color-yellow-30] rounded-r-md p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-medium text-[--color-gray-95]">{alert.topicName}</h4>
          <p className="text-xs text-[--color-gray-50] mt-1">
            Quiet for {alert.silenceDays} {alert.silenceDays === 1 ? 'day' : 'days'}
            {' · '}{alert.participantCount} participant{alert.participantCount !== 1 ? 's' : ''}
            {alert.workstreamName && <>{' · '}<span className="text-[--color-blue-50]">{alert.workstreamName}</span></>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {alert.sourceThreadUrl && (
            <a
              href={alert.sourceThreadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[--color-blue-50] hover:underline focus-visible:ring-2 focus-visible:ring-[--color-blue-50] rounded"
              aria-label="View thread in Slack (opens in new tab)"
              onClick={(e) => e.stopPropagation()}
            >
              View in Slack →
            </a>
          )}
          <button
            type="button"
            onClick={onDismiss}
            disabled={isDismissing}
            className="text-xs text-[--color-gray-50] hover:text-[--color-gray-95] focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none rounded disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function SilenceMonitorEmpty() {
  return (
    <div className="flex items-center gap-2 rounded-md bg-[--color-green-10] p-3">
      <svg
        className="w-5 h-5 text-[--color-green-50] shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-sm text-[--color-gray-50]">All topics active — no silence detected</p>
    </div>
  );
}

function SilenceMonitorSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="border-l-[3px] border-l-[--color-yellow-30] rounded-r-md p-3">
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
