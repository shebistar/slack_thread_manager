import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { slackChannels } from '@slack-thread-manager/db';
import { IngestionService } from './ingestion.service.js';
import { SlackClientService } from '../slack/slack-client.service.js';

const DEFAULT_CRON = '0 */4 * * *';

@Injectable()
export class PollingJob {
  private readonly logger = new Logger(PollingJob.name);
  private lastBatchRun: Date | null = null;
  private lastBatchStatus: 'success' | 'failed' | 'never' = 'never';

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly ingestionService: IngestionService,
    private readonly slackClient: SlackClientService,
  ) {}

  getLastBatchRun(): Date | null {
    return this.lastBatchRun;
  }

  getLastBatchStatus(): 'success' | 'failed' | 'never' {
    return this.lastBatchStatus;
  }

  @Cron(DEFAULT_CRON, { name: 'ingestion-polling' })
  async handlePollingCron(): Promise<void> {
    if (!this.slackClient.isConfigured()) {
      this.logger.warn('Slack client not configured, skipping batch poll');
      return;
    }

    const startTime = Date.now();
    const summary = { channelsPolled: 0, threadsFound: 0, threadsStored: 0, threadsUpdated: 0, errors: 0 };

    let activeChannels: Awaited<ReturnType<typeof this.db.query.slackChannels.findMany>>;
    try {
      activeChannels = await this.db.query.slackChannels.findMany({
        where: eq(slackChannels.isActive, true),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Batch polling aborted — failed to load active channels', { error: msg });
      this.lastBatchRun = new Date();
      this.lastBatchStatus = 'failed';
      return;
    }

    this.logger.log('Batch polling started', { channelCount: activeChannels.length, schedule: DEFAULT_CRON });

    let hasAnyFailure = false;

    for (const channel of activeChannels) {
      const watermark = channel.lastPolledTs
        ? String(channel.lastPolledTs.getTime() / 1000)
        : undefined;

      this.logger.log('Polling channel', {
        channelId: channel.slackChannelId,
        channelName: channel.name,
        lastPolledTs: channel.lastPolledTs?.toISOString() ?? null,
      });

      // Phase 1: ingest new threads since last watermark
      try {
        const result = await this.ingestionService.ingestChannel(
          channel.id,
          channel.slackChannelId,
          channel.name,
          watermark,
        );

        summary.threadsFound += result.threadsFound;
        summary.threadsStored += result.threadsStored;
        summary.errors += result.errors;
        summary.channelsPolled++;

        if (result.errors > 0) {
          hasAnyFailure = true;
          this.logger.warn('Channel polled with partial errors, watermark NOT advanced', {
            channelId: channel.slackChannelId,
            channelName: channel.name,
            errors: result.errors,
          });
        } else {
          try {
            await this.db
              .update(slackChannels)
              .set({ lastPolledTs: sql`now()` })
              .where(eq(slackChannels.id, channel.id));

            const newWatermark = new Date().toISOString();
            this.logger.log('Channel polled successfully, watermark advanced', {
              channelId: channel.slackChannelId,
              channelName: channel.name,
              threadsFound: result.threadsFound,
              threadsStored: result.threadsStored,
              newWatermark,
            });
          } catch (updateError: unknown) {
            hasAnyFailure = true;
            const updateMsg = updateError instanceof Error ? updateError.message : 'Unknown error';
            this.logger.error('Watermark update failed after successful ingest', {
              channelId: channel.slackChannelId,
              channelName: channel.name,
              error: updateMsg,
            });
          }
        }
      } catch (error: unknown) {
        hasAnyFailure = true;
        summary.errors++;
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Channel polling failed, watermark NOT advanced', {
          channelId: channel.slackChannelId,
          channelName: channel.name,
          error: msg,
        });
      }

      // Phase 2: update detection — always runs, independent of Phase 1 outcome
      try {
        const updateResult = await this.ingestionService.detectUpdatedThreads(
          channel.id,
          channel.slackChannelId,
        );
        summary.threadsUpdated += updateResult.threadsUpdated;
        this.logger.log('Update detection complete', {
          channelId: channel.slackChannelId,
          channelName: channel.name,
          ...updateResult,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Update detection failed, continuing', {
          channelId: channel.slackChannelId,
          channelName: channel.name,
          error: msg,
        });
        // Intentionally NOT setting hasAnyFailure — Phase 2 errors are independent of watermark advance
      }
    }

    const durationMs = Date.now() - startTime;
    this.lastBatchRun = new Date();
    this.lastBatchStatus = hasAnyFailure ? 'failed' : 'success';

    this.logger.log('Batch polling complete', { ...summary, durationMs });
  }
}
