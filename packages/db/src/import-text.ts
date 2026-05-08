#!/usr/bin/env tsx
/**
 * Parses a Slack copy-paste text file and imports messages into the database.
 *
 * Usage:
 *   pnpm --filter @slack-thread-manager/db import-text <file> <channel-id> <slack-team-id>
 *
 * Example:
 *   pnpm --filter @slack-thread-manager/db import-text ../../text 153c4abb-... T01ABC123
 */
import { readFileSync } from 'fs';
import { eq, sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { slackChannels, slackThreads, threadMessages } from './schema/index.js';

// ---- Slack text parser (mirrors frontend logic) ----

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
  return `${baseEpoch + index}.000${String(index).padStart(3, '0')}`;
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

function parseSlackText(text: string): ParsedMessage[] {
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
        const epoch = currentTimeStr ? parseTimeToEpoch(currentTimeStr) : baseEpoch + messages.length;
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

    if (SKIP_LINE_RE.test(line)) { i++; continue; }
    if (currentUser) currentTextLines.push(line);
    i++;
  }
  flush();
  return messages;
}

// ---- Thread grouping (all messages go into one thread per user-sequence) ----

function groupIntoThreads(messages: ParsedMessage[]): Map<string, ParsedMessage[]> {
  const threads = new Map<string, ParsedMessage[]>();
  for (const msg of messages) {
    const threadTs = msg.ts;
    threads.set(threadTs, [msg]);
  }
  return threads;
}

// ---- Main ----

async function main() {
  const [filePath, channelId, slackTeamId] = process.argv.slice(2);

  if (!filePath || !channelId || !slackTeamId) {
    console.error('Usage: import-text <file> <channel-id> <slack-team-id>');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL env var is required');
    process.exit(1);
  }

  const text = readFileSync(filePath, 'utf-8');
  const parsed = parseSlackText(text);
  console.log(`Parsed ${parsed.length} messages from ${filePath}`);

  if (parsed.length === 0) {
    console.log('No messages to import.');
    process.exit(0);
  }

  const db = createDb(databaseUrl);

  const channel = await db.query.slackChannels.findFirst({
    where: eq(slackChannels.id, channelId),
  });

  if (!channel) {
    console.error(`Channel ${channelId} not found in database`);
    await db.close();
    process.exit(1);
  }

  console.log(`Importing into channel: ${channel.name} (${channel.slackChannelId})`);

  const threads = groupIntoThreads(parsed);
  let threadsStored = 0;
  let messagesStored = 0;
  let errors = 0;

  for (const [threadTs, messages] of threads) {
    try {
      const sorted = [...messages].sort((a, b) => a.ts.localeCompare(b.ts));
      const participantIds = [...new Set(sorted.map((m) => m.user).filter((u) => u !== 'unknown'))];
      const latestReplyTs = sorted.length > 1 ? sorted[sorted.length - 1].ts : null;

      await db.transaction(async (tx) => {
        const [upserted] = await tx
          .insert(slackThreads)
          .values({
            slackTeamId,
            channelId,
            threadTs,
            latestReplyTs,
            messageCount: sorted.length,
            rawMessages: sorted as unknown as Record<string, unknown>[],
            participantIds,
          })
          .onConflictDoUpdate({
            target: [slackThreads.slackTeamId, slackThreads.channelId, slackThreads.threadTs],
            set: {
              updatedAt: sql`now()`,
              messageCount: sql`excluded.message_count`,
              latestReplyTs: sql`excluded.latest_reply_ts`,
              rawMessages: sql`excluded.raw_messages`,
              participantIds: sql`excluded.participant_ids`,
            },
          })
          .returning({ id: slackThreads.id });

        if (!upserted) throw new Error(`Upsert returned no row for threadTs=${threadTs}`);
        const threadId = upserted.id;

        await tx.delete(threadMessages).where(eq(threadMessages.threadId, threadId));

        if (sorted.length > 0) {
          await tx.insert(threadMessages).values(
            sorted.map((m) => ({
              threadId,
              messageTs: m.ts,
              userHandle: m.user || null,
              text: m.text,
              rawPayload: m as unknown as Record<string, unknown>,
            })),
          );
        }
      });

      threadsStored++;
      messagesStored += sorted.length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Failed thread ${threadTs}: ${msg}`);
      errors++;
    }
  }

  console.log('\n=== Import Summary ===');
  console.log(`Threads found:  ${threads.size}`);
  console.log(`Threads stored: ${threadsStored}`);
  console.log(`Messages stored: ${messagesStored}`);
  console.log(`Errors:         ${errors}`);

  await db.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
