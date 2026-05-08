import { useRef, useState } from 'react';
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
import { useChannels } from '@/hooks/use-channels.js';
import { useImportHistory } from '@/hooks/use-import.js';
import type { ImportSummary } from '@slack-thread-manager/shared';

export function ImportForm() {
  const { data: channels = [], isLoading: channelsLoading } = useChannels();
  const importMutation = useImportHistory();

  const [channelId, setChannelId] = useState('');
  const [slackTeamId, setSlackTeamId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [lastResult, setLastResult] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeChannels = channels.filter((c) => c.isActive);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) {
      setSelectedFiles(Array.from(files));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLastResult(null);

    const allMessages: Record<string, unknown>[] = [];

    for (const file of selectedFiles) {
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          allMessages.push(...parsed);
        } else {
          throw new Error(`${file.name} is not a JSON array`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Parse error';
        importMutation.reset();
        setLastResult(null);
        alert(`Failed to parse ${file.name}: ${msg}`);
        return;
      }
    }

    const result = await importMutation.mutateAsync({
      channelId,
      slackTeamId,
      messages: allMessages,
    });
    setLastResult(result);
  }

  const canSubmit =
    channelId && slackTeamId.trim() && selectedFiles.length > 0 && !importMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-[--color-gray-95]">
          Import Slack History
        </h2>
        <p className="text-sm text-[--color-gray-50] mt-1">
          Upload JSON files from a Slack workspace export to populate thread
          data. Select the target channel, provide your Slack Team ID, and
          choose one or more daily JSON files.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="channel">Target Channel</Label>
          {channelsLoading ? (
            <p className="text-sm text-[--color-gray-50]">Loading channels...</p>
          ) : activeChannels.length === 0 ? (
            <p className="text-sm text-[--color-gray-50]">
              No active channels found. Add a channel in the Channels tab first.
            </p>
          ) : (
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger id="channel">
                <SelectValue placeholder="Select a channel" />
              </SelectTrigger>
              <SelectContent>
                {activeChannels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    #{ch.name} ({ch.slackChannelId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="teamId">Slack Team ID</Label>
          <Input
            id="teamId"
            placeholder="T01ABC123"
            value={slackTeamId}
            onChange={(e) => setSlackTeamId(e.target.value)}
          />
          <p className="text-xs text-[--color-gray-50]">
            Find this in your Slack workspace URL or admin settings (starts with T).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="files">Export JSON Files</Label>
          <Input
            ref={fileInputRef}
            id="files"
            type="file"
            accept=".json"
            multiple
            onChange={handleFileChange}
            className="cursor-pointer"
          />
          {selectedFiles.length > 0 && (
            <p className="text-xs text-[--color-gray-50]">
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}{' '}
              selected:{' '}
              {selectedFiles.map((f) => f.name).join(', ')}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={!canSubmit}
          className="bg-[--color-brand-red] text-white hover:opacity-90"
        >
          {importMutation.isPending ? 'Importing...' : 'Import History'}
        </Button>
      </form>

      {lastResult && (
        <div className="rounded-md border border-[--color-gray-20] bg-[--color-gray-5] p-4 max-w-lg">
          <h3 className="text-sm font-medium text-[--color-gray-95] mb-2">
            Import Results
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-[--color-gray-50]">Threads found</dt>
            <dd className="text-[--color-gray-95] font-medium">{lastResult.threadsFound}</dd>
            <dt className="text-[--color-gray-50]">Threads stored</dt>
            <dd className="text-[--color-gray-95] font-medium">{lastResult.threadsStored}</dd>
            <dt className="text-[--color-gray-50]">Messages stored</dt>
            <dd className="text-[--color-gray-95] font-medium">{lastResult.messagesStored}</dd>
            <dt className="text-[--color-gray-50]">Skipped</dt>
            <dd className="text-[--color-gray-95] font-medium">{lastResult.skipped}</dd>
            {lastResult.errors > 0 && (
              <>
                <dt className="text-[--color-gray-50]">Errors</dt>
                <dd className="text-red-600 font-medium">{lastResult.errors}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      <div className="rounded-md border border-[--color-gray-20] p-4 max-w-lg">
        <h3 className="text-sm font-medium text-[--color-gray-95] mb-2">
          How to Export from Slack
        </h3>
        <ol className="text-sm text-[--color-gray-50] space-y-1 list-decimal list-inside">
          <li>Go to your Slack workspace admin: Settings &amp; Administration &gt; Workspace settings</li>
          <li>Click &quot;Import/Export Data&quot; then the &quot;Export&quot; tab</li>
          <li>Choose a date range and start the export</li>
          <li>Download and unzip the ZIP file when ready</li>
          <li>Find the channel folder (e.g., <code className="text-xs bg-[--color-gray-10] px-1 rounded">general/</code>)</li>
          <li>Select the daily JSON files (e.g., <code className="text-xs bg-[--color-gray-10] px-1 rounded">2026-05-01.json</code>) and upload them above</li>
        </ol>
      </div>
    </div>
  );
}
