import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { slackThreads, stagingQueue, type PipelineStateValue } from '@slack-thread-manager/db';
import type { Database } from '@slack-thread-manager/db';
import type { AnonymizationResult, StagingResult } from '@slack-thread-manager/shared';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import { PipelineStateService } from '../pipeline-state.service.js';

@Injectable()
export class StagingQueueService {
  private readonly logger = new Logger(StagingQueueService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(PipelineStateService)
    private readonly pipelineStateService: PipelineStateService,
  ) {}

  async stageResults(results: AnonymizationResult[]): Promise<StagingResult> {
    if (results.length === 0) {
      this.logger.log('No results to stage');
      return { threadsStaged: 0, threadsFailed: 0, batchId: null };
    }

    const startTime = Date.now();
    const batchId = randomUUID();
    let threadsStaged = 0;
    let threadsFailed = 0;

    for (const result of results) {
      try {
        await this.db.transaction(async (tx) => {
          // Claim the transition first to prevent concurrent duplicate staging rows.
          const [claimedThread] = await tx
            .update(slackThreads)
            .set({
              pipelineState: 'staged' as PipelineStateValue,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(slackThreads.id, result.threadId),
                eq(slackThreads.pipelineState, 'embedded'),
              ),
            )
            .returning({ id: slackThreads.id });

          if (!claimedThread) {
            const [existingThread] = await tx
              .select({ id: slackThreads.id, pipelineState: slackThreads.pipelineState })
              .from(slackThreads)
              .where(eq(slackThreads.id, result.threadId));

            if (!existingThread) {
              throw new Error(`Thread ${result.threadId} not found`);
            }

            throw new Error(
              `Thread ${result.threadId} in state '${existingThread.pipelineState}', expected 'embedded'`,
            );
          }

          await tx.insert(stagingQueue).values({
            threadId: result.threadId,
            batchId,
            originalContent: result.originalContent,
            anonymizedContent: result.anonymizedContent,
            flags: result.flags,
            status: 'pending',
          });
        });

        threadsStaged++;
      } catch (err) {
        this.logger.error('Failed to stage thread', {
          threadId: result.threadId,
          error: err instanceof Error ? err.message : String(err),
        });
        const stageError = err instanceof Error ? err : new Error(String(err));
        try {
          await this.pipelineStateService.markFailed(
            result.threadId,
            'embedded',
            stageError,
          );
        } catch (failureWriteErr) {
          this.logger.warn('Failed to persist staging failure in pipeline_failures', {
            threadId: result.threadId,
            error: failureWriteErr instanceof Error ? failureWriteErr.message : String(failureWriteErr),
          });
        }
        threadsFailed++;
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log('Staging completed', { threadsStaged, threadsFailed, batchId, durationMs });

    return { threadsStaged, threadsFailed, batchId };
  }

  async getApprovedThreadIds(): Promise<string[]> {
    const rows = await this.db
      .select({ threadId: stagingQueue.threadId })
      .from(stagingQueue)
      .where(eq(stagingQueue.status, 'approved'));
    return rows.map((r) => r.threadId);
  }
}
