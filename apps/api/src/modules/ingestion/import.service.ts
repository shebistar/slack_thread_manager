import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { slackChannels, slackThreads, threadMessages } from '@slack-thread-manager/db';
import type { SlackExportMessage, ImportSummary } from '@slack-thread-manager/shared';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async importMessages(
    channelId: string,
    slackTeamId: string,
    rawMessages: SlackExportMessage[],
  ): Promise<ImportSummary> {
    const channel = await this.db.query.slackChannels.findFirst({
      where: eq(slackChannels.id, channelId),
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const threads = this.groupIntoThreads(rawMessages);
    const summary: ImportSummary = {
      threadsFound: threads.size,
      threadsStored: 0,
      messagesStored: 0,
      skipped: 0,
      errors: 0,
    };

    this.logger.log('Starting import', {
      channelId,
      channelName: channel.name,
      totalMessages: rawMessages.length,
      threadsFound: threads.size,
    });

    for (const [threadTs, messages] of threads) {
      try {
        const msgCount = await this.upsertThread(channelId, slackTeamId, threadTs, messages);
        summary.threadsStored++;
        summary.messagesStored += msgCount;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Thread import failed', { threadTs, error: msg });
        summary.errors++;
      }
    }

    this.logger.log('Import complete', {
      channelId,
      channelName: channel.name,
      ...summary,
    });

    return summary;
  }

  groupIntoThreads(messages: SlackExportMessage[]): Map<string, SlackExportMessage[]> {
    const threads = new Map<string, SlackExportMessage[]>();

    for (const msg of messages) {
      if (msg.type && msg.type !== 'message') continue;
      if (msg.subtype === 'channel_join' || msg.subtype === 'channel_leave') continue;

      const threadTs = msg.thread_ts ?? msg.ts;

      const existing = threads.get(threadTs);
      if (existing) {
        existing.push(msg);
      } else {
        threads.set(threadTs, [msg]);
      }
    }

    return threads;
  }

  private async upsertThread(
    channelId: string,
    slackTeamId: string,
    threadTs: string,
    messages: SlackExportMessage[],
  ): Promise<number> {
    const sorted = [...messages].sort((a, b) => a.ts.localeCompare(b.ts));

    const participantIds = this.extractParticipants(sorted);
    const latestReplyTs = sorted.length > 1 ? sorted[sorted.length - 1].ts : null;

    await this.db.transaction(async (tx) => {
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

      if (!upserted) {
        throw new Error(`Thread upsert returned no row for threadTs=${threadTs}`);
      }
      const threadId = upserted.id;

      await tx.delete(threadMessages).where(eq(threadMessages.threadId, threadId));

      if (sorted.length > 0) {
        await tx.insert(threadMessages).values(
          sorted.map((m) => ({
            threadId,
            messageTs: m.ts,
            userHandle: m.user || null,
            text: m.text ?? '',
            rawPayload: m as unknown as Record<string, unknown>,
          })),
        );
      }
    });

    return sorted.length;
  }

  private extractParticipants(messages: SlackExportMessage[]): string[] {
    const ids = new Set<string>();
    for (const m of messages) {
      if (m.user && m.user !== 'unknown') {
        ids.add(m.user);
      }
    }
    return [...ids];
  }
}
