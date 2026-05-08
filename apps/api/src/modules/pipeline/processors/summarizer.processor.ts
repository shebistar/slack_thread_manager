import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  classifiedTopics,
  type ClassifiedTopic,
  type SlackThread,
} from '@slack-thread-manager/db';
import { summarizationResultSchema } from '@slack-thread-manager/shared';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { LlmService } from '../llm/llm.service.js';
import { PipelineStateService } from '../pipeline-state.service.js';
import {
  buildSummarizationPrompt,
  SUMMARIZE_PROMPT_VERSION,
} from '../llm/prompts/summarize.prompt.js';

export interface ParticipantRosterEntry {
  handle: string;
  role: string;
  displayName: string;
}

@Injectable()
export class SummarizerProcessor {
  private readonly logger = new Logger(SummarizerProcessor.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly pipelineStateService: PipelineStateService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async summarizeThread(
    thread: SlackThread,
    classifiedTopic: ClassifiedTopic,
    participantRoster: ParticipantRosterEntry[],
    workstreamName: string | null,
    processingDate?: string,
  ): Promise<ClassifiedTopic> {
    const prompt = buildSummarizationPrompt(
      JSON.stringify(thread.rawMessages),
      {
        primaryTopic: classifiedTopic.primaryTopic,
        secondaryTopics: classifiedTopic.secondaryTopics as string[],
        workstreamName,
      },
      participantRoster,
    );

    const validated = await this.callLlmWithRetry(prompt, thread.id);

    const [updated] = await this.db
      .update(classifiedTopics)
      .set({
        technicalSummary: validated.technical_summary,
        plainSummary: validated.plain_summary,
      })
      .where(eq(classifiedTopics.threadId, thread.id))
      .returning();

    if (!updated) {
      throw new Error(`classified_topics row not found for thread ${thread.id}`);
    }

    await this.pipelineStateService.transitionState(
      thread.id,
      'summarized',
      processingDate,
    );

    this.logger.log('Thread summarized', {
      threadId: thread.id,
      primaryTopic: classifiedTopic.primaryTopic,
      technicalHeadline: validated.technical_summary.headline,
    });

    return updated;
  }

  private async callLlmWithRetry(
    prompt: string,
    threadId: string,
  ): Promise<{
    technical_summary: { headline: string; body: string; key_decisions: string[]; action_items: string[] };
    plain_summary: { headline: string; body: string; key_decisions: string[]; action_items: string[] };
  }> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await this.llmService.complete(prompt, {
          promptVersion: SUMMARIZE_PROMPT_VERSION,
          temperature: 0.3,
        });

        let parsed: unknown;
        try {
          const cleaned = this.stripCodeFences(result.content);
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

        const validated = summarizationResultSchema.safeParse(parsed);
        if (!validated.success) {
          this.logger.error('LLM output failed Zod validation', {
            threadId,
            attempt,
            errors: validated.error.issues,
          });
          if (attempt < 2) continue;
          throw new Error(
            `Summarization output validation failed: ${validated.error.message}`,
          );
        }

        return validated.data;
      } catch (err) {
        if (attempt >= 2) throw err;
        this.logger.warn(`Summarization attempt ${attempt} failed, retrying`, {
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    throw new Error('Summarization failed after all attempts');
  }

  private stripCodeFences(content: string): string {
    const trimmed = content.trim();
    if (trimmed.startsWith('```')) {
      const firstNewline = trimmed.indexOf('\n');
      const lastFence = trimmed.lastIndexOf('```');
      if (lastFence > firstNewline) {
        return trimmed.slice(firstNewline + 1, lastFence).trim();
      }
    }
    return trimmed;
  }
}
