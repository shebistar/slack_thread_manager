import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import type { StagingQueueItem } from '@slack-thread-manager/shared';

interface StagingReviewItemProps {
  item: StagingQueueItem;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isReviewing: boolean;
}

export function StagingReviewItem({
  item,
  onApprove,
  onReject,
  isReviewing,
}: StagingReviewItemProps) {
  const isFlagged = item.flags.length > 0;

  return (
    <div className="rounded-lg border border-[--color-gray-20] bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isFlagged && (
            <Badge variant="destructive" className="text-xs">
              Flagged
            </Badge>
          )}
          {item.workstream && (
            <Badge variant="secondary" className="text-xs">
              {item.workstream.name}
            </Badge>
          )}
          <span className="text-xs text-[--color-gray-50]">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
        <span className="text-xs font-mono text-[--color-gray-40]">
          {item.id.slice(0, 8)}
        </span>
      </div>

      {isFlagged && (
        <div className="space-y-1">
          {item.flags.map((flag, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 text-xs"
            >
              <Badge
                variant="outline"
                className="border-red-200 text-red-700 bg-red-50"
              >
                {flag.source === 'BLOCKLIST' ? 'Blocklist match' : 'LLM entity detection'}
              </Badge>
              <span className="font-mono bg-red-50 text-red-800 px-1 rounded">
                {flag.term}
              </span>
              <span className="text-[--color-gray-50]">→</span>
              <span className="font-mono bg-green-50 text-green-800 px-1 rounded">
                {flag.replacement}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[--color-gray-60] uppercase tracking-wide">
            Original
          </p>
          <div className="text-sm text-[--color-gray-80] bg-[--color-gray-05] rounded p-2 max-h-32 overflow-y-auto">
            <HighlightedContent
              text={item.originalContent.plainSummary.body}
              flags={item.flags}
            />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-[--color-gray-60] uppercase tracking-wide">
            Anonymized
          </p>
          <div className="text-sm text-[--color-gray-80] bg-[--color-gray-05] rounded p-2 max-h-32 overflow-y-auto">
            {item.anonymizedContent.plainSummary.body}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[--color-gray-10]">
        <Button
          variant="outline"
          size="sm"
          disabled={isReviewing}
          onClick={() => onReject(item.id)}
          className="text-red-600 border-red-200 hover:bg-red-50"
        >
          Reject
        </Button>
        <Button
          size="sm"
          disabled={isReviewing}
          onClick={() => onApprove(item.id)}
          className="bg-green-600 text-white hover:bg-green-700"
        >
          Approve
        </Button>
      </div>
    </div>
  );
}

function HighlightedContent({
  text,
  flags,
}: {
  text: string;
  flags: StagingQueueItem['flags'];
}) {
  if (flags.length === 0) return <>{text}</>;

  const terms = flags.map((f) => f.term).filter(Boolean);
  if (terms.length === 0) return <>{text}</>;

  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = terms.some(
          (t) => t.toLowerCase() === part.toLowerCase(),
        );
        return isMatch ? (
          <mark key={i} className="bg-red-100 text-red-900 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}
