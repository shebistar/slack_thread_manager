import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Textarea } from '@/components/ui/textarea.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import { useChannels } from '@/hooks/use-channels.js';
import { useImportHistory } from '@/hooks/use-import.js';
import { parseSlackText } from '@/lib/slack-text-parser.js';
import type { ImportSummary } from '@slack-thread-manager/shared';

export function ImportForm() {
  const { data: channels = [], isLoading: channelsLoading } = useChannels();
  const importMutation = useImportHistory();

  const [channelId, setChannelId] = useState('');
  const [slackTeamId, setSlackTeamId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [inputMode, setInputMode] = useState<string>('paste');
  const [lastResult, setLastResult] = useState<ImportSummary | null>(null);
  const [parsePreview, setParsePreview] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeChannels = channels.filter((c) => c.isActive);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) {
      setSelectedFiles(Array.from(files));
    }
  }

  function handleTextChange(text: string) {
    setPastedText(text);
    if (text.trim()) {
      const parsed = parseSlackText(text);
      setParsePreview(parsed.length);
    } else {
      setParsePreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLastResult(null);

    let allMessages: Record<string, unknown>[] = [];

    if (inputMode === 'paste') {
      const parsed = parseSlackText(pastedText);
      if (parsed.length === 0) {
        alert('No messages could be parsed from the pasted text. Check the format and try again.');
        return;
      }
      allMessages = parsed as unknown as Record<string, unknown>[];
    } else {
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
          alert(`Failed to parse ${file.name}: ${msg}`);
          return;
        }
      }
    }

    const result = await importMutation.mutateAsync({
      channelId,
      slackTeamId,
      messages: allMessages,
    });
    setLastResult(result);
  }

  const canSubmitPaste = channelId && slackTeamId.trim() && pastedText.trim() && !importMutation.isPending;
  const canSubmitFile = channelId && slackTeamId.trim() && selectedFiles.length > 0 && !importMutation.isPending;
  const canSubmit = inputMode === 'paste' ? canSubmitPaste : canSubmitFile;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-[--color-gray-95]">
          Import Slack History
        </h2>
        <p className="text-sm text-[--color-gray-50] mt-1">
          Populate thread data by pasting messages copied from Slack or uploading
          JSON export files. Select the target channel and provide your Slack Team ID.
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

        <Tabs value={inputMode} onValueChange={setInputMode}>
          <TabsList className="w-full">
            <TabsTrigger value="paste" className="flex-1">Paste Text</TabsTrigger>
            <TabsTrigger value="file" className="flex-1">Upload JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="mt-3 space-y-2">
            <Label htmlFor="pasteArea">Paste Messages from Slack</Label>
            <Textarea
              id="pasteArea"
              placeholder={`Copy messages from Slack and paste here. Expected format:\n\nJohn Doe  10:30 AM\nHey team, here's the update on the migration\n\nJane Smith  10:32 AM\nThanks John! What's the timeline?`}
              value={pastedText}
              onChange={(e) => handleTextChange(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            {parsePreview !== null && (
              <p className="text-xs text-[--color-gray-50]">
                {parsePreview} message{parsePreview !== 1 ? 's' : ''} detected
              </p>
            )}
          </TabsContent>

          <TabsContent value="file" className="mt-3 space-y-2">
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
          </TabsContent>
        </Tabs>

        <Button
          type="submit"
          disabled={!canSubmit}
          className="bg-[--color-brand-red] text-white hover:opacity-90"
        >
          {importMutation.isPending ? 'Importing...' : 'Import History'}
        </Button>
      </form>

      {lastResult && (
        <div className="rounded-md border border-[--color-gray-20] bg-gray-05 p-4 max-w-lg">
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
          How to Get Messages into the App
        </h3>
        <div className="space-y-3 text-sm text-[--color-gray-50]">
          <div>
            <p className="font-medium text-gray-70 mb-1">Option 1: Copy &amp; Paste (easiest)</p>
            <ol className="space-y-0.5 list-decimal list-inside">
              <li>Open the Slack channel in your browser or desktop app</li>
              <li>Scroll up to load the messages you want</li>
              <li>Select the messages (click and drag, or Ctrl+A in the message area)</li>
              <li>Copy (Ctrl+C) and paste into the text area above</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-gray-70 mb-1">Option 2: Workspace Export (admin only)</p>
            <ol className="space-y-0.5 list-decimal list-inside">
              <li>Go to Slack admin: Settings &amp; Administration &gt; Workspace settings</li>
              <li>Click &quot;Import/Export Data&quot; then the &quot;Export&quot; tab</li>
              <li>Download and unzip the ZIP file</li>
              <li>Upload the daily JSON files from the channel folder</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
