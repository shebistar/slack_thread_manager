import { Inject, Injectable, Logger } from '@nestjs/common';
import { workstreams } from '@slack-thread-manager/db';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { LlmPendingRetryError } from './llm/llm-provider.interface.js';
import { LlmService } from './llm/llm.service.js';
import { PipelineStateService } from './pipeline-state.service.js';
import { PipelineRunService } from './pipeline-run.service.js';
import { ClassifierProcessor } from './processors/classifier.processor.js';

export interface ClassificationRunResult {
  processed: number;
  failed: number;
  pendingRetry: number;
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @Inject(ClassifierProcessor)
    private readonly classifierProcessor: ClassifierProcessor,
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
}
