/**
 * Parses plain text copied from Slack's UI into the SlackExportMessage format.
 *
 * Slack copy-paste format (varies slightly by platform):
 *
 *   DisplayName  12:30 PM
 *   Message text here
 *   that can span multiple lines
 *
 *   AnotherUser  1:45 PM
 *   Another message
 *
 * Also handles formats with dates:
 *   DisplayName  May 7th, 2026 at 12:30 PM
 *   Message text
 *
 * And bracket-prefixed formats:
 *   [12:30 PM] DisplayName: Message text
 */

interface ParsedMessage {
  ts: string;
  user: string;
  text: string;
  type: 'message';
}

const HEADER_RE =
  /^(.+?)\s{2,}(?:(\w+\s+\d+\w*,?\s+\d{4})\s+at\s+)?(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)$/;

const BRACKET_RE =
  /^\[(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\]\s+(.+?):\s+(.+)$/;

function makeSyntheticTs(index: number, baseEpoch: number): string {
  const epoch = baseEpoch + index;
  return `${epoch}.000${String(index).padStart(3, '0')}`;
}

function parseTimeToEpoch(timeStr: string, dateStr?: string): number {
  const now = new Date();
  const dateBase = dateStr ? new Date(dateStr) : now;
  if (isNaN(dateBase.getTime())) {
    return Math.floor(now.getTime() / 1000);
  }

  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  if (!match) return Math.floor(dateBase.getTime() / 1000);

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const period = match[4]?.toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  dateBase.setHours(hours, minutes, seconds, 0);
  return Math.floor(dateBase.getTime() / 1000);
}

export function parseSlackText(text: string): ParsedMessage[] {
  const lines = text.split('\n');
  const messages: ParsedMessage[] = [];
  const baseEpoch = Math.floor(Date.now() / 1000) - 86400;

  let currentUser: string | null = null;
  let currentTime: string | null = null;
  let currentDate: string | undefined;
  let currentTextLines: string[] = [];

  function flush() {
    if (currentUser && currentTextLines.length > 0) {
      const msgText = currentTextLines.join('\n').trim();
      if (msgText) {
        const epoch = currentTime
          ? parseTimeToEpoch(currentTime, currentDate)
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
    currentTime = null;
    currentDate = undefined;
    currentTextLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      if (currentUser && currentTextLines.length > 0) {
        flush();
      }
      continue;
    }

    const bracketMatch = line.match(BRACKET_RE);
    if (bracketMatch) {
      flush();
      const epoch = parseTimeToEpoch(bracketMatch[1]);
      messages.push({
        ts: makeSyntheticTs(messages.length, epoch),
        user: bracketMatch[2].trim(),
        text: bracketMatch[3].trim(),
        type: 'message',
      });
      continue;
    }

    const headerMatch = line.match(HEADER_RE);
    if (headerMatch) {
      flush();
      currentUser = headerMatch[1].trim();
      currentDate = headerMatch[2] || undefined;
      currentTime = headerMatch[3];
      continue;
    }

    if (currentUser) {
      currentTextLines.push(line);
    } else {
      currentUser = 'unknown';
      currentTextLines.push(line);
    }
  }

  flush();
  return messages;
}
