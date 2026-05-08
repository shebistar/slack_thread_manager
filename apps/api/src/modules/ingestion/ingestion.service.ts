import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { slackChannels, slackThreads, threadMessages } from '@slack-thread-manager/db';
import { SlackClientService } from '../slack/slack-client.service.js';
import type { SlackMessage } from '../slack/slack-client.service.js';
import type { IngestionSummary } from '@slack-thread-manager/shared';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly slackTeamId: string;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly slackClient: SlackClientService,
    private readonly configService: ConfigService,
  ) {
    this.slackTeamId = this.configService.get<string>('SLACK_TEAM_ID', '');
  }

  async ingestAllChannels(): Promise<IngestionSummary> {
    if (!this.slackClient.isConfigured()) {
      this.logger.warn('Slack client not configured, skipping ingestion');
      return { channelsPolled: 0, threadsFound: 0, threadsStored: 0, errors: 0 };
    }

    if (!this.slackTeamId) {
      this.logger.warn('SLACK_TEAM_ID not configured, skipping ingestion');
      return { channelsPolled: 0, threadsFound: 0, threadsStored: 0, errors: 0 };
    }

    const activeChannels = await this.db.query.slackChannels.findMany({
      where: eq(slackChannels.isActive, true),
    });

    const summary: IngestionSummary = {
      channelsPolled: activeChannels.length,
      threadsFound: 0,
      threadsStored: 0,
      errors: 0,
    };

    for (const channel of activeChannels) {
      try {
        const result = await this.ingestChannel(channel.id, channel.slackChannelId, channel.name);
        summary.threadsFound += result.threadsFound;
        summary.threadsStored += result.threadsStored;
        summary.errors += result.errors;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Channel ingestion failed', { channelId: channel.slackChannelId, channelName: channel.name, error: msg });
        summary.errors++;
      }
    }

    this.logger.log('Ingestion complete', summary);
    return summary;
  }

  async ingestChannel(
    internalChannelId: string,
    slackChannelId: string,
    channelName: string,
  ): Promise<{ threadsFound: number; threadsStored: number; errors: number }> {
    this.logger.log('Ingesting channel', { channelId: slackChannelId, channelName });

    const result = { threadsFound: 0, threadsStored: 0, errors: 0 };
    let cursor: string | undefined;

    do {
      const history = await this.slackClient.fetchChannelHistory(slackChannelId, { cursor });

      const threadStarters = history.messages.filter(
        (m) => this.isThreadStarter(m),
      );
      result.threadsFound += threadStarters.length;

      for (const starter of threadStarters) {
        try {
          await this.ingestThread(internalChannelId, slackChannelId, starter);
          result.threadsStored++;
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('Thread ingestion failed', { threadTs: starter.ts, error: msg });
          result.errors++;
        }
      }

      cursor = history.hasMore ? history.nextCursor : undefined;
    } while (cursor);

    this.logger.log('Channel ingestion complete', { channelId: slackChannelId, ...result });
    return result;
  }

  async ingestThread(
    internalChannelId: string,
    slackChannelId: string,
    starterMessage: SlackMessage,
  ): Promise<void> {
    const threadTs = starterMessage.threadTs ?? starterMessage.ts;

    const replies = await this.fetchAllReplies(slackChannelId, threadTs);

    const allMessages = replies;
    const participantIds = this.extractParticipants(allMessages);
    const latestReplyTs = allMessages.length > 1
      ? allMessages[allMessages.length - 1].ts
      : null;

    await this.db.transaction(async (tx) => {
      const [upserted] = await tx
        .insert(slackThreads)
        .values({
          slackTeamId: this.slackTeamId,
          channelId: internalChannelId,
          threadTs,
          latestReplyTs,
          messageCount: allMessages.length,
          rawMessages: allMessages.map((m) => m.raw),
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

      if (allMessages.length > 0) {
        await tx.insert(threadMessages).values(
          allMessages.map((m) => ({
            threadId,
            messageTs: m.ts,
            userHandle: m.user || null,
            text: m.text,
            rawPayload: m.raw,
          })),
        );
      }
    });

    this.logger.log('Thread ingested', { threadTs, messageCount: allMessages.length });
  }

  private async fetchAllReplies(
    slackChannelId: string,
    threadTs: string,
  ): Promise<SlackMessage[]> {
    const allMessages: SlackMessage[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.slackClient.fetchThreadReplies(slackChannelId, threadTs, { cursor });
      allMessages.push(...result.messages);
      cursor = result.hasMore ? result.nextCursor : undefined;
    } while (cursor);

    return allMessages;
  }

  private isThreadStarter(message: SlackMessage): boolean {
    const raw = message.raw;
    const replyCount = raw.reply_count as number | undefined;
    if (replyCount && replyCount > 0) return true;
    if (message.threadTs && message.threadTs === message.ts) return true;
    return false;
  }

  private extractParticipants(messages: SlackMessage[]): string[] {
    const handles = new Set<string>();
    for (const m of messages) {
      if (m.user && m.user !== 'unknown') {
        handles.add(m.user);
      }
    }
    return [...handles];
  }
}
