import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useWorkstreams } from '@/hooks/use-roster.js';
import {
  useRemoveWorkstreamThreshold,
  useSilenceThresholds,
  useUpdateGlobalThreshold,
  useUpsertWorkstreamThreshold,
} from '@/hooks/use-silence-thresholds.js';
import type { SilenceThresholdResponse } from '@slack-thread-manager/shared';

const NO_WORKSTREAM = '__no_workstream__';

function parseThresholdValue(value: string): { value: number | null; error: string | null } {
  if (!/^\d+$/.test(value)) {
    return { value: null, error: 'Threshold must be an integer between 1 and 30' };
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed < 1 || parsed > 30) {
    return { value: null, error: 'Threshold must be an integer between 1 and 30' };
  }
  return { value: parsed, error: null };
}

function formatLastModified(updatedAt: string): string {
  return new Date(updatedAt).toLocaleString();
}

export function SilenceThresholdsTabContent() {
  const { data, isLoading, error } = useSilenceThresholds();
  const { data: workstreams = [] } = useWorkstreams();
  const updateGlobalThreshold = useUpdateGlobalThreshold();
  const upsertWorkstreamThreshold = useUpsertWorkstreamThreshold();
  const removeWorkstreamThreshold = useRemoveWorkstreamThreshold();

  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newWorkstreamId, setNewWorkstreamId] = useState<string>(NO_WORKSTREAM);
  const [newThresholdValue, setNewThresholdValue] = useState('3');
  const [newThresholdError, setNewThresholdError] = useState<string | null>(null);

  const overrideIds = useMemo(
    () => new Set((data?.overrides ?? []).map((item) => item.workstreamId)),
    [data?.overrides],
  );

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load silence thresholds: {(error as Error).message}
      </div>
    );
  }

  const rows: SilenceThresholdResponse[] = data
    ? [data.global, ...data.overrides]
    : [];

  async function submitInlineEdit(row: SilenceThresholdResponse) {
    const value = editingValues[row.id] ?? String(row.thresholdDays);
    const parsed = parseThresholdValue(value);

    if (parsed.error || parsed.value === null) {
      setFieldErrors((current) => ({ ...current, [row.id]: parsed.error ?? 'Invalid threshold' }));
      return;
    }

    setFieldErrors((current) => ({ ...current, [row.id]: '' }));

    if (row.workstreamId) {
      await upsertWorkstreamThreshold.mutateAsync({
        workstreamId: row.workstreamId,
        thresholdDays: parsed.value,
      });
    } else {
      await updateGlobalThreshold.mutateAsync({
        thresholdDays: parsed.value,
      });
    }
  }

  async function submitNewOverride() {
    if (newWorkstreamId === NO_WORKSTREAM) {
      setNewThresholdError('Select a workstream');
      return;
    }

    const parsed = parseThresholdValue(newThresholdValue);
    if (parsed.error || parsed.value === null) {
      setNewThresholdError(parsed.error ?? 'Invalid threshold');
      return;
    }

    setNewThresholdError(null);
    await upsertWorkstreamThreshold.mutateAsync({
      workstreamId: newWorkstreamId,
      thresholdDays: parsed.value,
    });
    setAddDialogOpen(false);
    setNewWorkstreamId(NO_WORKSTREAM);
    setNewThresholdValue('3');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-[--color-gray-95]">
          Silence Threshold Configuration
        </h2>
        <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
          Add Workstream Override
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workstream</TableHead>
              <TableHead>Threshold (days)</TableHead>
              <TableHead>Last Modified</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, idx) => (
                  <TableRow key={idx}>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              : rows.map((row) => {
                  const rowValue = editingValues[row.id] ?? String(row.thresholdDays);
                  const validationError = fieldErrors[row.id];
                  return (
                    <TableRow key={row.id}>
                      <TableCell className={!row.workstreamId ? 'font-semibold' : ''}>
                        {row.workstreamName ?? 'Global Default'}
                      </TableCell>
                      <TableCell>
                        <div className="w-28">
                          <Input
                            aria-label={`Threshold for ${row.workstreamName ?? 'Global Default'}`}
                            value={rowValue}
                            onChange={(event) =>
                              setEditingValues((current) => ({
                                ...current,
                                [row.id]: event.target.value,
                              }))
                            }
                          />
                          {validationError ? (
                            <p className="pt-1 text-xs text-red-600">{validationError}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-[--color-gray-50]">
                        {formatLastModified(row.updatedAt)}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void submitInlineEdit(row)}
                        >
                          Save
                        </Button>
                        {row.workstreamId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-orange-400 text-orange-600 hover:bg-orange-50"
                            onClick={() =>
                              void removeWorkstreamThreshold.mutateAsync(row.workstreamId!)
                            }
                          >
                            Reset to Default
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled>
                            Global default cannot be reset
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            {!isLoading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  No threshold rows found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add workstream threshold override</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="silence-workstream">Workstream</Label>
              <Select value={newWorkstreamId} onValueChange={setNewWorkstreamId}>
                <SelectTrigger id="silence-workstream">
                  <SelectValue placeholder="Select workstream" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_WORKSTREAM}>Select workstream</SelectItem>
                  {workstreams
                    .filter((workstream) => !overrideIds.has(workstream.id))
                    .map((workstream) => (
                      <SelectItem key={workstream.id} value={workstream.id}>
                        {workstream.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="silence-threshold-days">Threshold days</Label>
              <Input
                id="silence-threshold-days"
                value={newThresholdValue}
                onChange={(event) => setNewThresholdValue(event.target.value)}
                placeholder="1-30"
              />
            </div>
            {newThresholdError ? (
              <p className="text-sm text-red-600">{newThresholdError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[--color-brand-red] text-white hover:opacity-90"
              onClick={() => void submitNewOverride()}
            >
              Save Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
