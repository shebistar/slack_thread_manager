import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, desc, sql } from 'drizzle-orm';
import { pipelineRuns, type PipelineRun } from '@slack-thread-manager/db';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';

@Injectable()
export class PipelineRunService {
  private readonly logger = new Logger(PipelineRunService.name);

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async startRun(): Promise<PipelineRun> {
    const [run] = await this.db
      .insert(pipelineRuns)
      .values({})
      .returning();

    this.logger.log('Pipeline run started', { runId: run!.id });
    return run!;
  }

  async completeRun(
    runId: string,
    stats: {
      threadsProcessed: number;
      threadsFailed: number;
      fallbackCount: number;
    },
  ): Promise<PipelineRun> {
    const [updated] = await this.db
      .update(pipelineRuns)
      .set({
        completedAt: sql`now()`,
        threadsProcessed: stats.threadsProcessed,
        threadsFailed: stats.threadsFailed,
        fallbackCount: stats.fallbackCount,
      })
      .where(eq(pipelineRuns.id, runId))
      .returning();

    if (!updated) {
      throw new Error(`Pipeline run ${runId} not found`);
    }

    this.logger.log('Pipeline run completed', {
      runId,
      ...stats,
      durationMs: updated.completedAt!.getTime() - updated.startedAt.getTime(),
    });

    return updated;
  }

  async getLatestRuns(limit = 10): Promise<PipelineRun[]> {
    return this.db
      .select()
      .from(pipelineRuns)
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(limit);
  }
}
