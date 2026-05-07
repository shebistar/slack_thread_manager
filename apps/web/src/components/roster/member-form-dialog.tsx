import { useState, useEffect, useRef } from 'react';
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
  createRosterMemberSchema,
  updateRosterMemberSchema,
  UserRole,
} from '@slack-thread-manager/shared';
import type { RosterMember, Workstream, CreateRosterMember, UpdateRosterMember } from '@slack-thread-manager/shared';

const ROLES = UserRole.options;

interface MemberFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: RosterMember;
  workstreams: Workstream[];
  onSubmitCreate?: (dto: CreateRosterMember) => Promise<unknown>;
  onSubmitUpdate?: (dto: UpdateRosterMember & { id: string }) => Promise<unknown>;
}

interface FormState {
  email: string;
  displayName: string;
  slackHandle: string;
  nicknames: string;
  role: string;
  workstreamIds: string[];
}

function getInitialState(member?: RosterMember): FormState {
  return {
    email: member?.email ?? '',
    displayName: member?.displayName ?? '',
    slackHandle: member?.slackHandle ?? '',
    nicknames: member?.slackNicknames.join(', ') ?? '',
    role: member?.role ?? '',
    workstreamIds: member?.workstreams.map((ws) => ws.id) ?? [],
  };
}

export function MemberFormDialog({
  open,
  onOpenChange,
  member,
  workstreams,
  onSubmitCreate,
  onSubmitUpdate,
}: MemberFormDialogProps) {
  const isEdit = !!member;
  const [form, setForm] = useState<FormState>(() => getInitialState(member));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setForm(getInitialState(member));
      setFieldErrors({});
      setSubmitError(null);
      setSubmitting(false);
      setWsOpen(false);
    }
  }, [open, member]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) {
        setWsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggleWorkstream(id: string) {
    setForm((prev) => ({
      ...prev,
      workstreamIds: prev.workstreamIds.includes(id)
        ? prev.workstreamIds.filter((w) => w !== id)
        : [...prev.workstreamIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setSubmitError(null);

    const nicknames = form.nicknames
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      if (isEdit && onSubmitUpdate) {
        const result = updateRosterMemberSchema.safeParse({
          displayName: form.displayName || undefined,
          slackHandle: form.slackHandle || undefined,
          slackNicknames: nicknames,
          role: form.role || undefined,
          workstreamIds: form.workstreamIds,
        });
        if (!result.success) {
          const errors: Record<string, string> = {};
          for (const issue of result.error.errors) {
            const field = issue.path[0] as string;
            errors[field] = issue.message;
          }
          setFieldErrors(errors);
          return;
        }
        await onSubmitUpdate({ id: member!.id, ...result.data });
      } else if (onSubmitCreate) {
        const result = createRosterMemberSchema.safeParse({
          email: form.email,
          displayName: form.displayName,
          slackHandle: form.slackHandle,
          slackNicknames: nicknames,
          role: form.role,
          workstreamIds: form.workstreamIds,
        });
        if (!result.success) {
          const errors: Record<string, string> = {};
          for (const issue of result.error.errors) {
            const field = issue.path[0] as string;
            errors[field] = issue.message;
          }
          setFieldErrors(errors);
          return;
        }
        await onSubmitCreate(result.data);
      }
      onOpenChange(false);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-[520px]"
          onInteractOutside={(e) => e.preventDefault()}
        >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Member' : 'Add Member'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          {/* Email */}
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              disabled={isEdit}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@company.com"
            />
            {fieldErrors.email && (
              <p className="text-sm text-red-500">{fieldErrors.email}</p>
            )}
          </div>

          {/* Display Name */}
          <div className="space-y-1">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="Alice Chen"
            />
            {fieldErrors.displayName && (
              <p className="text-sm text-red-500">{fieldErrors.displayName}</p>
            )}
          </div>

          {/* Slack Handle */}
          <div className="space-y-1">
            <Label htmlFor="slackHandle">Slack Handle</Label>
            <Input
              id="slackHandle"
              value={form.slackHandle}
              onChange={(e) => setForm((f) => ({ ...f, slackHandle: e.target.value }))}
              placeholder="alice.chen"
            />
            {fieldErrors.slackHandle && (
              <p className="text-sm text-red-500">{fieldErrors.slackHandle}</p>
            )}
          </div>

          {/* Nicknames */}
          <div className="space-y-1">
            <Label htmlFor="nicknames">Nicknames (comma-separated)</Label>
            <Input
              id="nicknames"
              value={form.nicknames}
              onChange={(e) => setForm((f) => ({ ...f, nicknames: e.target.value }))}
              placeholder="alice, ali"
            />
          </div>

          {/* Role */}
          <div className="space-y-1">
            <Label htmlFor="role">Role</Label>
            <Select
              value={form.role}
              onValueChange={(val) => setForm((f) => ({ ...f, role: val }))}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.role && (
              <p className="text-sm text-red-500">{fieldErrors.role}</p>
            )}
          </div>

          {/* Workstreams */}
          <div className="space-y-1" ref={wsRef}>
            <Label>Workstreams</Label>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left"
              onClick={() => setWsOpen((o) => !o)}
            >
              <span>
                {form.workstreamIds.length === 0
                  ? 'Select workstreams…'
                  : workstreams
                      .filter((ws) => form.workstreamIds.includes(ws.id))
                      .map((ws) => ws.name)
                      .join(', ')}
              </span>
              <span className="ml-2 text-muted-foreground text-xs">▼</span>
            </button>
            {wsOpen && (
              <div className="z-10 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto p-2 space-y-1">
                {workstreams.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">No workstreams available</p>
                )}
                {workstreams.map((ws) => (
                  <label
                    key={ws.id}
                    className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer rounded hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={form.workstreamIds.includes(ws.id)}
                      onChange={() => toggleWorkstream(ws.id)}
                      className="h-4 w-4"
                    />
                    {ws.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-red-500">{submitError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="bg-[--color-brand-red] text-white hover:opacity-90">
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
