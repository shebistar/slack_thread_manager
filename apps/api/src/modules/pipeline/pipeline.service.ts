import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  classifiedTopics,
  users,
  workstreams,
} from '@slack-thread-manager/db';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { LlmPendingRetryError } from './llm/llm-provider.interface.js';
import { LlmService } from './llm/llm.service.js';
import { PipelineStateService } from './pipeline-state.service.js';
import { PipelineRunService } from './pipeline-run.service.js';
import { ClassifierProcessor } from './processors/classifier.processor.js';
import {
  SummarizerProcessor,
  type ParticipantRosterEntry,
} from './processors/summarizer.processor.js';
import { EmbedderProcessor } from './processors/embedder.processor.js';
import { CorrelatorProcessor, type CorrelationRunResult } from './processors/correlator.processor.js';
import { OrphanedActionDetectorProcessor, type OrphanedActionDetectionResult } from './processors/orphaned-action-detector.processor.js';

export interface PipelineRunResult {
  processed: number;
  failed: number;
  pendingRetry: number;
}

export type ClassificationRunResult = PipelineRunResult;
export type EmbeddingRunResult = PipelineRunResult;
export type { CorrelationRunResult };
export type { OrphanedActionDetectionResult };

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @Inject(ClassifierProcessor)
    private readonly classifierProcessor: ClassifierProcessor,
    @Inject(SummarizerProcessor)
    private readonly summarizerProcessor: SummarizerProcessor,
    @Inject(EmbedderProcessor)
    private readonly embedderProcessor: EmbedderProcessor,
    @Inject(CorrelatorProcessor)
    private readonly correlatorProcessor: CorrelatorProcessor,
    @Inject(OrphanedActionDetectorProcessor)
    private readonly orphanedActionDetector: OrphanedActionDetectorProcessor,
    @Inject(PipelineStateService)
    private readonly pipelineStateService: PipelineStateService,
    @Inject(PipelineRunService)
    private readonly pipelineRunService: PipelineRunService,
    @Inject(LlmService)
    private readonly llmService: LlmService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async runClassification(processingDate?: string): Promise<ClassificationRunResult> {
    const date = processingDate ?? new Date().toISOString().slice(0, 10);

    const threads = await this.pipelineStateService.getThreadsByState('ingested', date);
    if (threads.length === 0) {
      this.logger.log('No ingested threads to classify');
      return { processed: 0, failed: 0, pendingRetry: 0 };
    }

    const run = await this.pipelineRunService.startRun();
    this.llmService.resetBatchCounters();

    const workstreamRows = await this.db
      .select({ name: workstreams.name, id: workstreams.id })
      .from(workstreams);

    let processed = 0;
    let failed = 0;
    let pendingRetry = 0;

    for (const thread of threads) {
      try {
        const result = await this.classifierProcessor.classifyThread(
          thread,
          workstreamRows,
          date,
        );
        if (result) {
          processed++;
        } else {
          pendingRetry++;
        }
      } catch (err) {
        if (err instanceof LlmPendingRetryError) {
          await this.pipelineStateService.markPendingRetry(
            thread.id,
            'ingested',
            err,
          );
          pendingRetry++;
        } else {
          await this.pipelineStateService.markFailed(
            thread.id,
            'ingested',
            err instanceof Error ? err : new Error(String(err)),
          );
          failed++;
        }
      }
    }

    this.llmService.logBatchSummary();
    await this.pipelineRunService.completeRun(run.id, {
      threadsProcessed: processed,
      threadsFailed: failed,
      fallbackCount: 0,
    });

    this.logger.log('Classification batch completed', {
      processed,
      failed,
      pendingRetry,
      total: threads.length,
    });

    return { processed, failed, pendingRetry };
  }

  async runSummarization(processingDate?: string): Promise<PipelineRunResult> {
    const date = processingDate ?? new Date().toISOString().slice(0, 10);

    // No date filter: process ALL classified threads regardless of processing_date
    const threads = await this.pipelineStateService.getThreadsByState('classified');
    if (threads.length === 0) {
      this.logger.log('No classified threads to summarize');
      return { processed: 0, failed: 0, pendingRetry: 0 };
    }

    const run = await this.pipelineRunService.startRun();
    this.llmService.resetBatchCounters();

    const allUsers = await this.db
      .select({
        displayName: users.displayName,
        slackHandle: users.slackHandle,
        slackNicknames: users.slackNicknames,
        role: users.role,
      })
      .from(users);

    const workstreamRows = await this.db
      .select({ id: workstreams.id, name: workstreams.name })
      .from(workstreams);
    const workstreamMap = new Map(workstreamRows.map((r) => [r.id, r.name]));

    let processed = 0;
    let failed = 0;
    let pendingRetry = 0;

    for (const thread of threads) {
      try {
        const [topic] = await this.db
          .select()
          .from(classifiedTopics)
          .where(eq(classifiedTopics.threadId, thread.id));

        if (!topic) {
          this.logger.warn('No classification found for thread', { threadId: thread.id });
          await this.pipelineStateService.markFailed(
            thread.id,
            'classified',
            new Error('No classified_topics row found'),
          );
          failed++;
          continue;
        }

        const workstreamName = topic.workstreamId
          ? workstreamMap.get(topic.workstreamId) ?? null
          : null;

        const participantRoster = this.buildParticipantRoster(
          thread.participantIds ?? [],
          allUsers,
        );

        await this.summarizerProcessor.summarizeThread(
          thread,
          topic,
          participantRoster,
          workstreamName,
          date,
        );
        processed++;
      } catch (err) {
        if (err instanceof LlmPendingRetryError) {
          await this.pipelineStateService.markPendingRetry(
            thread.id,
            'classified',
            err,
          );
          pendingRetry++;
        } else {
          await this.pipelineStateService.markFailed(
            thread.id,
            'classified',
            err instanceof Error ? err : new Error(String(err)),
          );
          failed++;
        }
      }
    }

    this.llmService.logBatchSummary();
    await this.pipelineRunService.completeRun(run.id, {
      threadsProcessed: processed,
      threadsFailed: failed,
      fallbackCount: 0,
    });

    this.logger.log('Summarization batch completed', {
      processed,
      failed,
      pendingRetry,
      total: threads.length,
    });

    return { processed, failed, pendingRetry };
  }

  async runEmbedding(processingDate?: string): Promise<EmbeddingRunResult> {
    const date = processingDate ?? new Date().toISOString().slice(0, 10);

    // No date filter: process ALL summarized threads regardless of processing_date
    const threads = await this.pipelineStateService.getThreadsByState('summarized');
    if (threads.length === 0) {
      this.logger.log('No summarized threads to embed');
      return { processed: 0, failed: 0, pendingRetry: 0 };
    }

    const run = await this.pipelineRunService.startRun();
    this.llmService.resetBatchCounters();

    let processed = 0;
    let failed = 0;
    let pendingRetry = 0;

    for (const thread of threads) {
      try {
        await this.embedderProcessor.embedThread(thread, date);
        processed++;
      } catch (err) {
        if (err instanceof LlmPendingRetryError) {
          await this.pipelineStateService.markPendingRetry(
            thread.id,
            'summarized',
            err,
          );
          pendingRetry++;
        } else {
          await this.pipelineStateService.markFailed(
            thread.id,
            'summarized',
            err instanceof Error ? err : new Error(String(err)),
          );
          failed++;
        }
      }
    }

    this.llmService.logBatchSummary();
    await this.pipelineRunService.completeRun(run.id, {
      threadsProcessed: processed,
      threadsFailed: failed,
      fallbackCount: 0,
    });

    this.logger.log('Embedding batch completed', {
      processed,
      failed,
      pendingRetry,
      total: threads.length,
    });

    return { processed, failed, pendingRetry };
  }

  async runCorrelation(): Promise<CorrelationRunResult> {
    return this.correlatorProcessor.runBatchCorrelation();
  }

  async runOrphanedActionDetection(): Promise<OrphanedActionDetectionResult> {
    return this.orphanedActionDetector.runDetection();
  }

  private buildParticipantRoster(
    participantIds: string[],
    allUsers: Array<{
      displayName: string;
      slackHandle: string;
      slackNicknames: string[] | null;
      role: string;
    }>,
  ): ParticipantRosterEntry[] {
    return participantIds.map((handle) => {
      const user = allUsers.find(
        (u) =>
          u.slackHandle === handle ||
          u.slackNicknames?.some(
            (n) => n.toLowerCase() === handle.toLowerCase(),
          ),
      );
      return user
        ? { handle, role: user.role, displayName: user.displayName }
        : { handle, role: 'unknown', displayName: handle };
    });
  }
}
