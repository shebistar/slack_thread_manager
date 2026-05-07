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
  createChannelSchema,
  updateChannelSchema,
} from '@slack-thread-manager/shared';
import type {
  CreateChannel,
  UpdateChannel,
  Workstream,
} from '@slack-thread-manager/shared';
import type { ChannelWithWorkstream } from '@/hooks/use-channels.js';

interface ChannelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel?: ChannelWithWorkstream;
  workstreams: Workstream[];
  onSubmitCreate?: (dto: CreateChannel) => Promise<unknown>;
  onSubmitUpdate?: (dto: UpdateChannel & { id: string }) => Promise<unknown>;
}

interface FormState {
  slackChannelId: string;
  name: string;
  workstreamId: string;
  isActive: boolean;
}

function getInitialState(channel?: ChannelWithWorkstream): FormState {
  return {
    slackChannelId: channel?.slackChannelId ?? '',
    name: channel?.name ?? '',
    workstreamId: channel?.workstreamId ?? '',
    isActive: channel?.isActive ?? true,
  };
}

export function ChannelFormDialog({
  open,
  onOpenChange,
  channel,
  workstreams,
  onSubmitCreate,
  onSubmitUpdate,
}: ChannelFormDialogProps) {
  const isEdit = !!channel;
  const [form, setForm] = useState<FormState>(() => getInitialState(channel));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(getInitialState(channel));
      setFieldErrors({});
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open, channel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setSubmitError(null);

    setSubmitting(true);
    try {
      if (isEdit && onSubmitUpdate) {
        const result = updateChannelSchema.safeParse({
          name: form.name || undefined,
          workstreamId: form.workstreamId || undefined,
          isActive: form.isActive,
        });
        if (!result.success) {
          const errors: Record<string, string> = {};
          for (const issue of result.error.errors) {
            errors[issue.path[0] as string] = issue.message;
          }
          setFieldErrors(errors);
          return;
        }
        await onSubmitUpdate({ id: channel!.id, ...result.data });
      } else if (onSubmitCreate) {
        const result = createChannelSchema.safeParse({
          slackChannelId: form.slackChannelId,
          name: form.name,
          workstreamId: form.workstreamId,
          isActive: form.isActive,
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
          setSubmitError('A channel with this Slack ID already exists');
        } else if (msg.includes('400')) {
          try {
            const parsed = JSON.parse(msg.replace(/^API 400: /, ''));
            if (parsed.details) {
              const errors: Record<string, string> = {};
              for (const d of parsed.details as { field: string; message: string }[]) {
                errors[d.field] = d.message;
              }
              setFieldErrors(errors);
              return;
            }
          } catch {
            // not parseable, fall through
          }
          setSubmitError(msg);
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
            {isEdit ? 'Edit Channel' : 'Add Channel'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="slackChannelId">Slack Channel ID</Label>
            <Input
              id="slackChannelId"
              value={form.slackChannelId}
              disabled={isEdit}
              onChange={(e) =>
                setForm((f) => ({ ...f, slackChannelId: e.target.value }))
              }
              placeholder="C01ABC123"
            />
            {fieldErrors.slackChannelId && (
              <p className="text-sm text-red-500">
                {fieldErrors.slackChannelId}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="channelName">Channel Name</Label>
            <Input
              id="channelName"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="vm-migration-general"
            />
            {fieldErrors.name && (
              <p className="text-sm text-red-500">{fieldErrors.name}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="workstream">Workstream</Label>
            <Select
              value={form.workstreamId}
              onValueChange={(val) =>
                setForm((f) => ({ ...f, workstreamId: val }))
              }
            >
              <SelectTrigger id="workstream">
                <SelectValue placeholder="Select workstream…" />
              </SelectTrigger>
              <SelectContent>
                {workstreams.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.workstreamId && (
              <p className="text-sm text-red-500">
                {fieldErrors.workstreamId}
              </p>
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
                  : 'Add Channel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
