import { useState } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';
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
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
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
import type { BlocklistEntryResponse, BlocklistCategory } from '@slack-thread-manager/shared';

type SortKey = 'term' | 'category' | 'createdAt';
type SortDir = 'asc' | 'desc';

interface BlocklistTableProps {
  entries: BlocklistEntryResponse[];
  isLoading: boolean;
  error: Error | null;
  search: string;
  onSearchChange: (search: string) => void;
  categoryFilter: BlocklistCategory | undefined;
  onCategoryFilterChange: (category: BlocklistCategory | undefined) => void;
  sortBy: SortKey;
  sortOrder: SortDir;
  onSortChange: (sortBy: SortKey, sortOrder: SortDir) => void;
  onEdit: (entry: BlocklistEntryResponse) => void;
  onDelete: (id: string) => void;
}

const CATEGORY_LABELS: Record<BlocklistCategory, string> = {
  company_name: 'Company',
  person_name: 'Person',
  url: 'URL',
  account_id: 'Account ID',
  infrastructure: 'Infrastructure',
};

const CATEGORY_COLORS: Record<BlocklistCategory, string> = {
  company_name: 'bg-blue-100 text-blue-800',
  person_name: 'bg-purple-100 text-purple-800',
  url: 'bg-amber-100 text-amber-800',
  account_id: 'bg-cyan-100 text-cyan-800',
  infrastructure: 'bg-emerald-100 text-emerald-800',
};

export { CATEGORY_LABELS };

export function BlocklistTable({
  entries,
  isLoading,
  error,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  sortBy,
  sortOrder,
  onSortChange,
  onEdit,
  onDelete,
}: BlocklistTableProps) {
  function handleSort(key: SortKey) {
    if (sortBy === key) {
      onSortChange(key, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(key, 'asc');
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortBy !== col) return null;
    return sortOrder === 'asc' ? (
      <ChevronUp className="inline h-3 w-3 ml-1" />
    ) : (
      <ChevronDown className="inline h-3 w-3 ml-1" />
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        Failed to load blocklist: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-40" />
          <Input
            placeholder="Search terms…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter ?? '__all__'}
          onValueChange={(val) =>
            onCategoryFilterChange(val === '__all__' ? undefined : val as BlocklistCategory)
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('term')}
              >
                Term
                <SortIcon col="term" />
              </TableHead>
              <TableHead>Replacement</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('category')}
              >
                Category
                <SortIcon col="category" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('createdAt')}
              >
                Created
                <SortIcon col="createdAt" />
              </TableHead>
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
              : entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {entry.term}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-gray-60">
                      {entry.replacement}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={CATEGORY_COLORS[entry.category]}
                      >
                        {CATEGORY_LABELS[entry.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-[--color-gray-50]">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(entry)}
                      >
                        Edit
                      </Button>
                      <RemoveButton entry={entry} onDelete={onDelete} />
                    </TableCell>
                  </TableRow>
                ))}
            {!isLoading && entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground py-6"
                >
                  No blocklist entries found. Click &quot;Add Entry&quot; to get
                  started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RemoveButton({
  entry,
  onDelete,
}: {
  entry: BlocklistEntryResponse;
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
          <AlertDialogTitle>Remove blocklist entry</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove the term{' '}
            <strong className="font-mono">{entry.term}</strong>? This term will
            no longer be filtered in future pipeline runs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onDelete(entry.id)}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
