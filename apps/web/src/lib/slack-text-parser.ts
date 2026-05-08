/**
 * Parses plain text copied from Slack's UI into the import message format.
 *
 * Primary format (two-line header — name then indented timestamp):
 *
 *   Raffaele Spazzoli
 *     10:38
 *   [bsod] This is the message text
 *   that can span multiple lines
 *
 * Secondary format (inline bracket timestamp):
 *
 *   Stefanie Chiras  [12:50 PM]
 *   Hi Anne! That is wonderful news!
 */

interface ParsedMessage {
  ts: string;
  user: string;
  text: string;
  type: 'message';
}

const INDENTED_TIME_RE = /^\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?)\s*$/;

const INLINE_BRACKET_RE = /^(.+?)\s+\[(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\]\s*$/;

const SKIP_LINE_RE = /^(?:image\.png|.*\.(?:png|jpg|jpeg|gif|svg|mp4|mov)|:[\w+-]+:|\s*)$/;

function isNameLine(line: string, nextLine: string | undefined): boolean {
  if (!line.trim() || line.startsWith(' ') || line.startsWith('\t')) return false;
  if (!nextLine) return false;
  return INDENTED_TIME_RE.test(nextLine);
}

function makeSyntheticTs(index: number, baseEpoch: number): string {
  const epoch = baseEpoch + index;
  return `${epoch}.000${String(index).padStart(3, '0')}`;
}

function parseTimeToEpoch(timeStr: string): number {
  const now = new Date();
  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  if (!match) return Math.floor(now.getTime() / 1000);

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const period = match[4]?.toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  const base = new Date(now);
  base.setHours(hours, minutes, seconds, 0);
  return Math.floor(base.getTime() / 1000);
}

export function parseSlackText(text: string): ParsedMessage[] {
  const lines = text.split('\n');
  const messages: ParsedMessage[] = [];
  const baseEpoch = Math.floor(Date.now() / 1000) - 86400;

  let currentUser: string | null = null;
  let currentTimeStr: string | null = null;
  let currentTextLines: string[] = [];

  function flush() {
    if (currentUser && currentTextLines.length > 0) {
      const msgText = currentTextLines.join('\n').trim();
      if (msgText) {
        const epoch = currentTimeStr
          ? parseTimeToEpoch(currentTimeStr)
          : baseEpoch + messages.length;
        messages.push({
          ts: makeSyntheticTs(messages.length, epoch),
          user: currentUser,
          text: msgText,
          type: 'message',
        });
      }
    }
    currentUser = null;
    currentTimeStr = null;
    currentTextLines = [];
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : undefined;

    const inlineBracket = line.match(INLINE_BRACKET_RE);
    if (inlineBracket) {
      flush();
      currentUser = inlineBracket[1].trim();
      currentTimeStr = inlineBracket[2];
      i++;
      continue;
    }

    if (isNameLine(line, nextLine)) {
      flush();
      currentUser = line.trim();
      const timeMatch = nextLine!.match(INDENTED_TIME_RE);
      currentTimeStr = timeMatch ? timeMatch[1].trim() : null;
      i += 2;
      continue;
    }

    if (SKIP_LINE_RE.test(line)) {
      i++;
      continue;
    }

    if (currentUser) {
      currentTextLines.push(line);
    }

    i++;
  }

  flush();
  return messages;
}
