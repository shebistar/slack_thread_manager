import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog.js';
import type { RosterMember } from '@slack-thread-manager/shared';

type SortKey = 'displayName' | 'email' | 'slackHandle' | 'role' | 'workstreams';
type SortDir = 'asc' | 'desc';

interface RosterTableProps {
  members: RosterMember[];
  isLoading: boolean;
  error: Error | null;
  onEdit: (member: RosterMember) => void;
  onDelete: (id: string) => void;
}

export function RosterTable({ members, isLoading, error, onEdit, onDelete }: RosterTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('displayName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = [...members].sort((a, b) => {
    let aVal: string;
    let bVal: string;
    if (sortKey === 'workstreams') {
      aVal = a.workstreams.map((ws) => ws.name).join(', ');
      bVal = b.workstreams.map((ws) => ws.name).join(', ');
    } else {
      aVal = String(a[sortKey] ?? '');
      bVal = String(b[sortKey] ?? '');
    }
    const cmp = aVal.localeCompare(bVal);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="inline h-3 w-3 ml-1" />
    ) : (
      <ChevronDown className="inline h-3 w-3 ml-1" />
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        Failed to load roster: {error.message}
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {(
              [
                ['displayName', 'Display Name'],
                ['email', 'Email'],
                ['slackHandle', 'Slack Handle'],
                ['role', 'Role'],
                ['workstreams', 'Workstreams'],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <TableHead
                key={key}
                className="cursor-pointer select-none"
                onClick={() => handleSort(key)}
              >
                {label}
                <SortIcon col={key} />
              </TableHead>
            ))}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : sorted.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.displayName}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>@{member.slackHandle}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{member.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {member.workstreams.map((ws) => ws.name).join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(member)}
                    >
                      Edit
                    </Button>
                    <RemoveButton member={member} onDelete={onDelete} />
                  </TableCell>
                </TableRow>
              ))}
          {!isLoading && sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                No team members yet. Click "Add Member" to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function RemoveButton({
  member,
  onDelete,
}: {
  member: RosterMember;
  onDelete: (id: string) => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-orange-400 text-orange-600 hover:bg-orange-50"
        >
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove team member</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove <strong>{member.displayName}</strong>? This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onDelete(member.id)}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
