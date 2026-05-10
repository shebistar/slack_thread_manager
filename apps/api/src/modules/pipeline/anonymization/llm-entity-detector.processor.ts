import { Inject, Injectable, Logger } from '@nestjs/common';
import { anonymizationBlocklist } from '@slack-thread-manager/db';
import type { Database } from '@slack-thread-manager/db';
import type {
  AnonymizationResult,
  LlmEntityMatch,
  LlmEntityDetectionResponse,
  SummaryShape,
} from '@slack-thread-manager/shared';
import { llmEntityDetectionResponseSchema } from '@slack-thread-manager/shared';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import { LlmService } from '../llm/llm.service.js';
import {
  buildEntityDetectionPrompt,
  DETECT_ENTITIES_PROMPT_VERSION,
} from '../llm/prompts/detect-entities.prompt.js';

export interface LlmEntityDetectionResult {
  threadsProcessed: number;
  entitiesDetected: number;
  results: AnonymizationResult[];
}

function extractTextContent(content: {
  technicalSummary: SummaryShape;
  plainSummary: SummaryShape;
}): string {
  const parts: string[] = [];
  for (const summary of [content.technicalSummary, content.plainSummary]) {
    parts.push(summary.headline, summary.body);
    parts.push(...summary.key_decisions, ...summary.action_items);
  }
  return parts.join('\n');
}

function stripMarkdownFences(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

@Injectable()
export class LlmEntityDetectorProcessor {
  private readonly logger = new Logger(LlmEntityDetectorProcessor.name);

  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async runDetection(
    blocklistResults: AnonymizationResult[],
  ): Promise<LlmEntityDetectionResult> {
    if (blocklistResults.length === 0) {
      this.logger.log('No blocklist results to process');
      return { threadsProcessed: 0, entitiesDetected: 0, results: [] };
    }

    const startTime = Date.now();

    const blocklistEntries = await this.db
      .select()
      .from(anonymizationBlocklist);

    const knownTerms = blocklistEntries.map((e) => e.term);
    const knownTermsLower = new Set(knownTerms.map((t) => t.toLowerCase()));

    this.llmService.resetBatchCounters();

    const enhancedResults: AnonymizationResult[] = [];
    let totalEntities = 0;

    for (const result of blocklistResults) {
      try {
        const contentText = extractTextContent(result.originalContent);
        const prompt = buildEntityDetectionPrompt(contentText, knownTerms);

        const entities = await this.callLlmWithRetry(
          prompt,
          result.threadId,
        );

        if (!entities) {
          enhancedResults.push(result);
          continue;
        }

        const newEntities = entities.filter(
          (e) => !knownTermsLower.has(e.entity_text.toLowerCase()),
        );

        const llmFlags: LlmEntityMatch[] = newEntities.map((e) => ({
          term: e.entity_text,
          replacement: e.suggested_replacement,
          category: e.entity_type,
          source: 'LLM' as const,
          confidence: e.confidence,
        }));

        totalEntities += llmFlags.length;

        enhancedResults.push({
          ...result,
          flags: [...result.flags, ...llmFlags],
        });
      } catch (err) {
        this.logger.error('Error processing thread for LLM entity detection', {
          threadId: result.threadId,
          error: err instanceof Error ? err.message : String(err),
        });
        enhancedResults.push(result);
      }
    }

    this.llmService.logBatchSummary();

    const durationMs = Date.now() - startTime;
    this.logger.log('LLM entity detection completed', {
      threadsProcessed: blocklistResults.length,
      entitiesDetected: totalEntities,
      durationMs,
    });

    return {
      threadsProcessed: blocklistResults.length,
      entitiesDetected: totalEntities,
      results: enhancedResults,
    };
  }

  private async callLlmWithRetry(
    prompt: string,
    threadId: string,
  ): Promise<LlmEntityDetectionResponse | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await this.llmService.complete(prompt, {
          promptVersion: DETECT_ENTITIES_PROMPT_VERSION,
          temperature: 0.2,
        });

        let parsed: unknown;
        try {
          const cleaned = stripMarkdownFences(result.content);
          parsed = JSON.parse(cleaned);
        } catch {
          this.logger.error('LLM returned malformed JSON for entity detection', {
            threadId,
            attempt,
            contentLength: result.content.length,
          });
          if (attempt < 2) continue;
          return null;
        }

        const validated = llmEntityDetectionResponseSchema.safeParse(parsed);
        if (!validated.success) {
          this.logger.error('LLM entity detection output failed Zod validation', {
            threadId,
            attempt,
            errors: validated.error.issues,
          });
          if (attempt < 2) continue;
          return null;
        }

        return validated.data;
      } catch (err) {
        this.logger.warn(`Entity detection attempt ${attempt} failed`, {
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (attempt >= 2) return null;
      }
    }

    return null;
  }
}
