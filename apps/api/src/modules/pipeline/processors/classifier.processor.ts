import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  classifiedTopics,
  type ClassifiedTopic,
  type SlackThread,
} from '@slack-thread-manager/db';
import { classificationResultSchema } from '@slack-thread-manager/shared';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { LlmService } from '../llm/llm.service.js';
import { PipelineStateService } from '../pipeline-state.service.js';
import {
  buildClassificationPrompt,
  CLASSIFY_PROMPT_VERSION,
} from '../llm/prompts/classify.prompt.js';

export interface WorkstreamMap {
  name: string;
  id: string;
}

@Injectable()
export class ClassifierProcessor {
  private readonly logger = new Logger(ClassifierProcessor.name);

  constructor(
    @Inject(LlmService)
    private readonly llmService: LlmService,
    @Inject(PipelineStateService)
    private readonly pipelineStateService: PipelineStateService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async classifyThread(
    thread: SlackThread,
    workstreamMaps: WorkstreamMap[],
    processingDate?: string,
  ): Promise<ClassifiedTopic | null> {
    const workstreamNames = workstreamMaps.map((w) => w.name);
    const prompt = buildClassificationPrompt(
      JSON.stringify(thread.rawMessages),
      workstreamNames,
    );

    const { data: parsed, modelVersion } = await this.callLlmWithRetry(prompt, thread.id);

    const resolvedWorkstreamId = this.resolveWorkstreamId(
      parsed.workstream_id,
      workstreamMaps,
    );

    const threshold =
      this.configService.get<number>('CLASSIFICATION_CONFIDENCE_THRESHOLD') ?? 0.6;

    if (parsed.confidence_score < threshold) {
      this.logger.warn('Classification confidence below threshold', {
        threadId: thread.id,
        confidence: parsed.confidence_score,
        threshold,
        primaryTopic: parsed.primary_topic,
      });
      await this.pipelineStateService.markPendingRetry(
        thread.id,
        'ingested',
        new Error(
          `Classification confidence ${parsed.confidence_score} below threshold ${threshold}`,
        ),
      );
      return null;
    }

    const [topic] = await this.db
      .insert(classifiedTopics)
      .values({
        threadId: thread.id,
        primaryTopic: parsed.primary_topic,
        secondaryTopics: parsed.secondary_topics,
        workstreamId: resolvedWorkstreamId,
        confidence: parsed.confidence_score,
        modelVersion,
        promptVersion: CLASSIFY_PROMPT_VERSION,
      })
      .returning();

    if (!topic) {
      throw new Error(`DB insert returned no row for thread ${thread.id}`);
    }

    await this.pipelineStateService.transitionState(
      thread.id,
      'classified',
      processingDate,
    );

    this.logger.log('Thread classified', {
      threadId: thread.id,
      primaryTopic: parsed.primary_topic,
      confidence: parsed.confidence_score,
      workstreamId: resolvedWorkstreamId,
    });

    return topic;
  }

  private async callLlmWithRetry(
    prompt: string,
    threadId: string,
  ): Promise<{ data: { primary_topic: string; secondary_topics: string[]; workstream_id: string | null; confidence_score: number }; modelVersion: string }> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await this.llmService.complete(prompt, {
          promptVersion: CLASSIFY_PROMPT_VERSION,
          temperature: 0.2,
        });

        let parsed: unknown;
        try {
          const cleaned = this.stripMarkdownFences(result.content);
          parsed = JSON.parse(cleaned);
        } catch {
          this.logger.error('LLM returned malformed JSON', {
            threadId,
            attempt,
            content: result.content.slice(0, 200),
          });
          if (attempt < 2) continue;
          throw new Error('LLM returned malformed JSON after retry');
        }

        const validated = classificationResultSchema.safeParse(parsed);
        if (!validated.success) {
          this.logger.error('LLM output failed Zod validation', {
            threadId,
            attempt,
            errors: validated.error.issues,
          });
          if (attempt < 2) continue;
          throw new Error(
            `Classification output validation failed: ${validated.error.message}`,
          );
        }

        return { data: validated.data, modelVersion: result.modelVersion };
      } catch (err) {
        if (attempt >= 2) throw err;
        this.logger.warn(`Classification attempt ${attempt} failed, retrying`, {
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    throw new Error('Classification failed after all attempts');
  }

  private stripMarkdownFences(content: string): string {
    const trimmed = content.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
    return fenceMatch ? fenceMatch[1].trim() : trimmed;
  }

  private resolveWorkstreamId(
    llmWorkstreamName: string | null,
    workstreamMaps: WorkstreamMap[],
  ): string | null {
    if (!llmWorkstreamName) return null;

    const lower = llmWorkstreamName.toLowerCase();
    const match = workstreamMaps.find((w) => w.name.toLowerCase() === lower);
    return match?.id ?? null;
  }
}
