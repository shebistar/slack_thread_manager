import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import {
  classifiedTopics,
  threadEmbeddings,
  type SlackThread,
  type ThreadEmbedding,
} from '@slack-thread-manager/db';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { LlmService } from '../llm/llm.service.js';
import { PipelineStateService } from '../pipeline-state.service.js';

@Injectable()
export class EmbedderProcessor {
  private readonly logger = new Logger(EmbedderProcessor.name);

  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(PipelineStateService) private readonly pipelineStateService: PipelineStateService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async embedThread(thread: SlackThread, processingDate?: string): Promise<ThreadEmbedding> {
    const topic = await this.db
      .select()
      .from(classifiedTopics)
      .where(eq(classifiedTopics.threadId, thread.id))
      .then((rows) => rows[0]);

    if (!topic) {
      throw new Error(`No classified topic found for thread ${thread.id}`);
    }

    const inputText = this.buildEmbeddingInput(topic);

    if (!inputText) {
      throw new Error(`Empty embedding input for thread ${thread.id} — topic has no text content`);
    }

    const result = await this.llmService.embed(inputText);

    const expectedDim = this.configService.get<number>('EMBEDDING_DIMENSIONS') ?? 768;
    if (result.embedding.length !== expectedDim) {
      throw new Error(
        `Embedding dimension mismatch: got ${result.embedding.length}, expected ${expectedDim}`,
      );
    }

    const [row] = await this.db
      .insert(threadEmbeddings)
      .values({
        threadId: thread.id,
        embedding: result.embedding,
        modelVersion: result.modelVersion,
      })
      .onConflictDoUpdate({
        target: threadEmbeddings.threadId,
        set: {
          embedding: result.embedding,
          modelVersion: result.modelVersion,
          createdAt: sql`now()`,
        },
      })
      .returning();

    await this.pipelineStateService.transitionState(thread.id, 'embedded', processingDate);

    this.logger.log('Thread embedded', {
      threadId: thread.id,
      modelVersion: result.modelVersion,
      dimensions: result.embedding.length,
    });

    return row!;
  }

  private buildEmbeddingInput(topic: typeof classifiedTopics.$inferSelect): string {
    const parts: string[] = [topic.primaryTopic];

    const techSummary = topic.technicalSummary as Record<string, unknown> | null;
    const plainSummary = topic.plainSummary as Record<string, unknown> | null;

    if (techSummary) {
      const headline = techSummary.headline as string | undefined;
      const body = techSummary.body as string | undefined;
      if (headline) parts.push(headline);
      if (body) parts.push(body);
    }

    if (plainSummary) {
      const headline = plainSummary.headline as string | undefined;
      const body = plainSummary.body as string | undefined;
      if (headline) parts.push(headline);
      if (body) parts.push(body);
    }

    return parts.filter(Boolean).join('\n\n');
  }
}
