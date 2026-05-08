import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, sql, and, or, isNull, lt } from 'drizzle-orm';
import {
  slackThreads,
  pipelineFailures,
  type PipelineStateValue,
  type SlackThread,
} from '@slack-thread-manager/db';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { InvalidStateTransitionError } from './pipeline.errors.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  ingested: ['classified', 'failed', 'pending_retry'],
  classified: ['summarized', 'failed', 'pending_retry'],
  summarized: ['embedded', 'failed', 'pending_retry'],
  embedded: ['staged', 'failed', 'pending_retry'],
  staged: ['approved', 'failed', 'pending_retry'],
  approved: ['delivered', 'failed', 'pending_retry'],
  failed: ['ingested'],
  pending_retry: ['ingested'],
};

@Injectable()
export class PipelineStateService {
  private readonly logger = new Logger(PipelineStateService.name);

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  isValidTransition(from: string, to: string): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  async transitionState(
    threadId: string,
    targetState: PipelineStateValue,
    processingDate?: string,
  ): Promise<SlackThread> {
    return this.db.transaction(async (tx) => {
      const [thread] = await tx
        .select()
        .from(slackThreads)
        .where(eq(slackThreads.id, threadId));

      if (!thread) {
        throw new NotFoundException(`Thread ${threadId} not found`);
      }

      const currentState = thread.pipelineState ?? 'ingested';
      if (!this.isValidTransition(currentState, targetState)) {
        throw new InvalidStateTransitionError(threadId, currentState, targetState);
      }

      const updateSet: Record<string, unknown> = {
        pipelineState: targetState,
        updatedAt: sql`now()`,
      };

      if (processingDate) {
        updateSet.processingDate = processingDate;
      }

      const [updated] = await tx
        .update(slackThreads)
        .set(updateSet)
        .where(eq(slackThreads.id, threadId))
        .returning();

      this.logger.log('Pipeline state transition', {
        threadId,
        from: currentState,
        to: targetState,
        processingDate,
      });

      return updated!;
    });
  }

  async markFailed(
    threadId: string,
    stage: PipelineStateValue,
    error: Error,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(pipelineFailures).values({
      threadId,
      pipelineStage: stage,
      errorMessage: error.message,
      errorContext: context ?? {},
    });

    this.logger.warn('Pipeline failure recorded', {
      threadId,
      stage,
      error: error.message,
    });
  }

  async markPendingRetry(
    threadId: string,
    stage: PipelineStateValue,
    error: Error,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(slackThreads)
        .set({ pipelineState: 'pending_retry' as PipelineStateValue, updatedAt: sql`now()` })
        .where(eq(slackThreads.id, threadId));

      await tx.insert(pipelineFailures).values({
        threadId,
        pipelineStage: stage,
        errorMessage: error.message,
        errorContext: { retryable: true },
      });
    });

    this.logger.warn('Thread marked pending_retry', {
      threadId,
      stage,
      error: error.message,
    });
  }

  async getThreadsByState(
    state: PipelineStateValue,
    processingDate?: string,
  ): Promise<SlackThread[]> {
    if (processingDate) {
      return this.db
        .select()
        .from(slackThreads)
        .where(
          and(
            eq(slackThreads.pipelineState, state),
            or(
              isNull(slackThreads.processingDate),
              lt(slackThreads.processingDate, processingDate),
            ),
          ),
        );
    }

    return this.db
      .select()
      .from(slackThreads)
      .where(eq(slackThreads.pipelineState, state));
  }
}
