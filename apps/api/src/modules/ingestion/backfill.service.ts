import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { slackChannels } from '@slack-thread-manager/db';
import { IngestionService } from './ingestion.service.js';

interface BackfillJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  channelsTotal: number;
  channelsProcessed: number;
  threadsStored: number;
  errors: number;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

@Injectable()
export class BackfillService {
  private readonly logger = new Logger(BackfillService.name);
  private readonly jobs = new Map<string, BackfillJobStatus>();

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly ingestionService: IngestionService,
  ) {}

  startBackfill(options: { channelId?: string; oldestTs: string }): { jobId: string } {
    const jobId = randomUUID();
    this.jobs.set(jobId, {
      jobId,
      status: 'pending',
      channelsTotal: 0,
      channelsProcessed: 0,
      threadsStored: 0,
      errors: 0,
      startedAt: new Date(),
    });
    void this.runBackfill(jobId, options);
    return { jobId };
  }

  getBackfillStatus(jobId: string): BackfillJobStatus | undefined {
    return this.jobs.get(jobId);
  }

  private async runBackfill(
    jobId: string,
    options: { channelId?: string; oldestTs: string },
  ): Promise<void> {
    const job = this.jobs.get(jobId)!;

    try {
      // Yield to the caller so startBackfill() returns the jobId with status 'pending' before we transition
      await Promise.resolve();
      job.status = 'running';
      this.logger.log('Backfill started', { jobId, options });

      let targets: Array<{ id: string; slackChannelId: string; name: string }>;

      if (options.channelId) {
        const channel = await this.db.query.slackChannels.findFirst({
          where: eq(slackChannels.id, options.channelId),
        });
        if (!channel) {
          job.status = 'failed';
          job.errorMessage = 'Channel not found';
          this.logger.error('Backfill failed', { jobId, error: job.errorMessage });
          return;
        }
        targets = [channel];
      } else {
        targets = await this.db.query.slackChannels.findMany({
          where: eq(slackChannels.isActive, true),
        });
      }

      job.channelsTotal = targets.length;

      for (const channel of targets) {
        try {
          const result = await this.ingestionService.ingestChannel(
            channel.id,
            channel.slackChannelId,
            channel.name,
            options.oldestTs,
          );
          job.threadsStored += result.threadsStored;
          job.errors += result.errors;
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('Backfill channel failed', { jobId, channelName: channel.name, error: msg });
          job.errors++;
        }

        job.channelsProcessed++;
        this.logger.log('Backfill progress', {
          jobId,
          channelName: channel.name,
          totalThreadsStored: job.threadsStored,
          channelsProcessed: job.channelsProcessed,
          channelsTotal: job.channelsTotal,
        });
      }

      job.status = 'complete';
      job.completedAt = new Date();
      this.logger.log('Backfill complete', {
        jobId,
        threadsStored: job.threadsStored,
        errors: job.errors,
        channelsProcessed: job.channelsProcessed,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      job.status = 'failed';
      job.errorMessage = msg;
      this.logger.error('Backfill failed', { jobId, error: msg });
    }
  }
}
