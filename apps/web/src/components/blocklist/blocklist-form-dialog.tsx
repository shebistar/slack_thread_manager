import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import { Button } from '@/components/ui/button.js';
import {
  createBlocklistEntrySchema,
  updateBlocklistEntrySchema,
} from '@slack-thread-manager/shared';
import type {
  CreateBlocklistEntry,
  UpdateBlocklistEntry,
  BlocklistEntryResponse,
  BlocklistCategory,
} from '@slack-thread-manager/shared';
import { CATEGORY_LABELS } from './blocklist-table.js';

interface BlocklistFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: BlocklistEntryResponse;
  prefill?: { term: string; category?: BlocklistCategory; replacement?: string };
  onSubmitCreate?: (dto: CreateBlocklistEntry) => Promise<unknown>;
  onSubmitUpdate?: (dto: UpdateBlocklistEntry & { id: string }) => Promise<unknown>;
}

interface FormState {
  term: string;
  replacement: string;
  category: BlocklistCategory;
}

function getInitialState(
  entry?: BlocklistEntryResponse,
  prefill?: BlocklistFormDialogProps['prefill'],
): FormState {
  if (entry) {
    return {
      term: entry.term,
      replacement: entry.replacement,
      category: entry.category,
    };
  }
  if (prefill) {
    return {
      term: prefill.term,
      replacement: prefill.replacement ?? `[${(prefill.category ?? 'REDACTED').toUpperCase()}]`,
      category: prefill.category ?? 'company_name',
    };
  }
  return { term: '', replacement: '', category: 'company_name' };
}

export function BlocklistFormDialog({
  open,
  onOpenChange,
  entry,
  prefill,
  onSubmitCreate,
  onSubmitUpdate,
}: BlocklistFormDialogProps) {
  const isEdit = !!entry;
  const [form, setForm] = useState<FormState>(() => getInitialState(entry, prefill));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(getInitialState(entry, prefill));
      setFieldErrors({});
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open, entry, prefill]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setSubmitError(null);
    setSubmitting(true);

    try {
      if (isEdit && onSubmitUpdate) {
        const result = updateBlocklistEntrySchema.safeParse({
          term: form.term !== entry!.term ? form.term : undefined,
          replacement: form.replacement !== entry!.replacement ? form.replacement : undefined,
          category: form.category !== entry!.category ? form.category : undefined,
        });
        if (!result.success) {
          const errors: Record<string, string> = {};
          for (const issue of result.error.errors) {
            errors[issue.path[0] as string] = issue.message;
          }
          setFieldErrors(errors);
          return;
        }
        await onSubmitUpdate({ id: entry!.id, ...result.data });
      } else if (onSubmitCreate) {
        const result = createBlocklistEntrySchema.safeParse({
          term: form.term,
          replacement: form.replacement,
          category: form.category,
        });
        if (!result.success) {
          const errors: Record<string, string> = {};
          for (const issue of result.error.errors) {
            errors[issue.path[0] as string] = issue.message;
          }
          setFieldErrors(errors);
          return;
        }
        await onSubmitCreate(result.data);
      }
      onOpenChange(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes('409') || msg.toLowerCase().includes('conflict')) {
          setSubmitError('A blocklist entry with this term already exists');
        } else {
          setSubmitError(msg);
        }
      } else {
        setSubmitError('An unexpected error occurred');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px]"
        onInteractOutside={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Blocklist Entry' : 'Add Blocklist Entry'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="blocklist-term">Term</Label>
            <Input
              id="blocklist-term"
              value={form.term}
              onChange={(e) =>
                setForm((f) => ({ ...f, term: e.target.value }))
              }
              placeholder="e.g. Acme Corp"
            />
            {fieldErrors.term && (
              <p className="text-sm text-red-500">{fieldErrors.term}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="blocklist-replacement">Replacement</Label>
            <Input
              id="blocklist-replacement"
              value={form.replacement}
              onChange={(e) =>
                setForm((f) => ({ ...f, replacement: e.target.value }))
              }
              placeholder="e.g. [COMPANY]"
            />
            {fieldErrors.replacement && (
              <p className="text-sm text-red-500">{fieldErrors.replacement}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="blocklist-category">Category</Label>
            <Select
              value={form.category}
              onValueChange={(val) =>
                setForm((f) => ({ ...f, category: val as BlocklistCategory }))
              }
            >
              <SelectTrigger id="blocklist-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.category && (
              <p className="text-sm text-red-500">{fieldErrors.category}</p>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-red-500">{submitError}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-[--color-brand-red] text-white hover:opacity-90"
            >
              {submitting
                ? 'Saving…'
                : isEdit
                  ? 'Save Changes'
                  : 'Add Entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
