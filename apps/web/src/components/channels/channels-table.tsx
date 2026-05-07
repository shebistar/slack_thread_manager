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
import type { ChannelWithWorkstream } from '@/hooks/use-channels.js';

type SortKey = 'name' | 'slackChannelId' | 'workstreamName' | 'isActive';
type SortDir = 'asc' | 'desc';

interface ChannelsTableProps {
  channels: ChannelWithWorkstream[];
  isLoading: boolean;
  error: Error | null;
  onEdit: (channel: ChannelWithWorkstream) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ChannelsTable({
  channels,
  isLoading,
  error,
  onEdit,
  onToggle,
  onDelete,
}: ChannelsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = [...channels].sort((a, b) => {
    let aVal: string;
    let bVal: string;
    if (sortKey === 'isActive') {
      aVal = a.isActive ? 'Active' : 'Inactive';
      bVal = b.isActive ? 'Active' : 'Inactive';
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
        Failed to load channels: {error.message}
      </div>
    );
  }

  const columns: [SortKey, string][] = [
    ['name', 'Channel Name'],
    ['slackChannelId', 'Slack Channel ID'],
    ['workstreamName', 'Workstream'],
    ['isActive', 'Status'],
  ];

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(([key, label]) => (
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
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : sorted.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell className="font-medium">{channel.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {channel.slackChannelId}
                  </TableCell>
                  <TableCell>{channel.workstreamName}</TableCell>
                  <TableCell>
                    <Badge
                      variant={channel.isActive ? 'default' : 'secondary'}
                      className={
                        channel.isActive
                          ? 'bg-green-100 text-green-800 hover:bg-green-100'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-100'
                      }
                    >
                      {channel.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(channel)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onToggle(channel.id)}
                    >
                      {channel.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <RemoveButton channel={channel} onDelete={onDelete} />
                  </TableCell>
                </TableRow>
              ))}
          {!isLoading && sorted.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-sm text-muted-foreground py-6"
              >
                No channels configured yet. Click &quot;Add Channel&quot; to get
                started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function RemoveButton({
  channel,
  onDelete,
}: {
  channel: ChannelWithWorkstream;
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
          <AlertDialogTitle>Remove channel</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove{' '}
            <strong>{channel.name}</strong> ({channel.slackChannelId})? This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onDelete(channel.id)}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
