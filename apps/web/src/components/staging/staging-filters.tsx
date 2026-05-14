import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import type { StagingQueueFilter, BatchSummary } from '@slack-thread-manager/shared';

interface Workstream {
  id: string;
  name: string;
}

interface StagingFiltersProps {
  filters: StagingQueueFilter;
  onFiltersChange: (filters: StagingQueueFilter) => void;
  workstreams: Workstream[];
  batches: BatchSummary[];
}

export function StagingFilters({
  filters,
  onFiltersChange,
  workstreams,
  batches,
}: StagingFiltersProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select
        value={filters.view ?? 'all'}
        onValueChange={(view) =>
          onFiltersChange({ ...filters, view: view as 'all' | 'flagged' })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="View" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All pending</SelectItem>
          <SelectItem value="flagged">Flagged only</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.workstreamId ?? '__all__'}
        onValueChange={(val) =>
          onFiltersChange({
            ...filters,
            workstreamId: val === '__all__' ? undefined : val,
          })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Workstream" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All workstreams</SelectItem>
          {workstreams.map((ws) => (
            <SelectItem key={ws.id} value={ws.id}>
              {ws.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {batches.length > 0 && (
        <Select
          value={filters.batchId ?? '__all__'}
          onValueChange={(val) =>
            onFiltersChange({
              ...filters,
              batchId: val === '__all__' ? undefined : val,
            })
          }
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All batches</SelectItem>
            {batches.map((b) => (
              <SelectItem key={b.batchId} value={b.batchId}>
                {new Date(b.createdAt).toLocaleString()} ({b.total} items)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
