import { useEffect, useRef, useState } from 'react';
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

const TEAM_ID_STORAGE_KEY = 'stm-last-team-id';

function readStoredTeamId(): string {
  try {
    return localStorage.getItem(TEAM_ID_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStoredTeamId(teamId: string): void {
  try {
    localStorage.setItem(TEAM_ID_STORAGE_KEY, teamId);
  } catch {
    // Ignore quota / private-mode failures; import still succeeds.
  }
}

export function ImportForm() {
  const { data: channels = [], isLoading: channelsLoading } = useChannels();
  const importMutation = useImportHistory();

  const [channelId, setChannelId] = useState('');
  const [slackTeamId, setSlackTeamId] = useState(() => readStoredTeamId());
  const [teamIdExpanded, setTeamIdExpanded] = useState(() => !readStoredTeamId());
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [inputMode, setInputMode] = useState<string>('paste');
  const [lastResult, setLastResult] = useState<ImportSummary | null>(null);
  const [parsePreview, setParsePreview] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeChannels = channels.filter((c) => c.isActive);

  useEffect(() => {
    const active = channels.filter((c) => c.isActive);
    if (active.length === 0) return;
    if (!channelId || !active.some((c) => c.id === channelId)) {
      setChannelId(active[0].id);
    }
  }, [channels, channelId]);

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
    writeStoredTeamId(slackTeamId.trim());
    setTeamIdExpanded(false);
    setLastResult(result);
  }

  const hasChannel = Boolean(channelId);
  const hasTeamId = Boolean(slackTeamId.trim());
  const hasPasteText = Boolean(pastedText.trim());
  const hasFiles = selectedFiles.length > 0;

  const canSubmitPaste = hasChannel && hasTeamId && hasPasteText && !importMutation.isPending;
  const canSubmitFile = hasChannel && hasTeamId && hasFiles && !importMutation.isPending;
  const canSubmit = inputMode === 'paste' ? canSubmitPaste : canSubmitFile;

  const submitLabel = (() => {
    if (importMutation.isPending) return 'Importing...';
    if (inputMode === 'paste' && parsePreview != null && parsePreview > 0) {
      return `Import ${parsePreview} message${parsePreview !== 1 ? 's' : ''}`;
    }
    return 'Import History';
  })();

  const submitClassName =
    canSubmit || importMutation.isPending
      ? 'bg-[--color-brand-red] text-white hover:opacity-90 disabled:opacity-100'
      : 'bg-[--color-gray-20] text-[--color-gray-50] hover:bg-[--color-gray-20] disabled:opacity-100';

  const validationMessages: string[] = [];
  if (!hasChannel) validationMessages.push('Select a target channel above');
  if (!hasTeamId) validationMessages.push('Enter your Slack Team ID');
  if (inputMode === 'paste' && !hasPasteText) {
    validationMessages.push('Paste messages from Slack above');
  }
  if (inputMode === 'file' && !hasFiles) {
    validationMessages.push('Select a JSON export file above');
  }

  function renderSubmitBlock() {
    return (
      <div className="space-y-2 pt-1">
        <Button
          type="submit"
          disabled={!canSubmit}
          className={submitClassName}
          data-testid="import-submit"
        >
          {submitLabel}
        </Button>
        {validationMessages.length > 0 && !importMutation.isPending && (
          <ul className="space-y-0.5 text-sm text-[--color-gray-50]" data-testid="import-validation">
            {validationMessages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const selectedChannel = activeChannels.find((c) => c.id === channelId);

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
          ) : activeChannels.length === 1 && selectedChannel ? (
            <p
              id="channel"
              data-testid="channel-readonly"
              className="inline-flex items-center rounded-md bg-[--color-gray-10] px-3 py-2 text-sm font-medium text-[--color-gray-95]"
            >
              #{selectedChannel.name}
              <span className="ml-2 text-[--color-gray-50] font-normal">
                ({selectedChannel.slackChannelId})
              </span>
            </p>
          ) : (
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger id="channel" data-testid="channel-select">
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
          {!teamIdExpanded && hasTeamId ? (
            <div
              className="flex items-center justify-between gap-3 rounded-md border border-[--color-gray-20] px-3 py-2"
              data-testid="team-id-collapsed"
            >
              <p className="text-sm text-[--color-gray-95]">
                <span className="text-[--color-gray-50]">Team ID:</span>{' '}
                <span className="font-mono">{slackTeamId}</span>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTeamIdExpanded(true)}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input
                id="teamId"
                data-testid="team-id-input"
                placeholder="T01ABC123 — find this in your Slack workspace URL"
                value={slackTeamId}
                onChange={(e) => setSlackTeamId(e.target.value)}
              />
              <p className="text-xs text-[--color-gray-50]">
                Find this in your Slack workspace URL or admin settings (starts with T).
              </p>
            </>
          )}
        </div>

        <Tabs value={inputMode} onValueChange={setInputMode}>
          <TabsList className="w-full">
            <TabsTrigger value="paste" className="flex-1">Paste Text</TabsTrigger>
            <TabsTrigger value="file" className="flex-1">Upload JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="mt-3 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="pasteArea">Paste Messages from Slack</Label>
              <Textarea
                id="pasteArea"
                placeholder={`Copy messages from Slack and paste here. Expected format:\n\nJohn Doe  10:30 AM\nHey team, here's the update on the migration\n\nJane Smith  10:32 AM\nThanks John! What's the timeline?`}
                value={pastedText}
                onChange={(e) => handleTextChange(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              {parsePreview !== null && parsePreview > 0 && (
                <p
                  className="rounded-md bg-[--color-green-10] px-3 py-2 text-sm font-medium text-[--color-green-50]"
                  data-testid="parse-preview-success"
                >
                  {parsePreview} message{parsePreview !== 1 ? 's' : ''} detected
                </p>
              )}
              {parsePreview === 0 && (
                <p
                  className="rounded-md bg-[--color-yellow-10] px-3 py-2 text-sm text-[--color-gray-70]"
                  data-testid="parse-preview-warning"
                >
                  No messages detected. Paste Slack messages in the format: name on one line,
                  timestamp on the next (or &quot;Name [time]&quot;), then the message body.
                </p>
              )}
            </div>
            {renderSubmitBlock()}
          </TabsContent>

          <TabsContent value="file" className="mt-3 space-y-3">
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
            {renderSubmitBlock()}
          </TabsContent>
        </Tabs>
      </form>

      {lastResult && (
        <div
          className="rounded-md border border-[--color-gray-20] bg-gray-05 p-4 max-w-lg"
          data-testid="import-results"
        >
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
