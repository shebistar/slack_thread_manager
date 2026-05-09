import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CpuModelProvider } from './providers/cpu-model.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import {
  LlmPendingRetryError,
  type LlmCompletionOptions,
  type LlmCompletionResult,
  type LlmEmbedResult,
} from './llm-provider.interface.js';

export interface LlmCompleteResult extends LlmCompletionResult {
  usedFallback: boolean;
  promptVersion?: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private batchTotal = 0;
  private batchFallback = 0;

  constructor(
    @Inject(CpuModelProvider) private readonly primary: CpuModelProvider,
    @Inject(GeminiProvider) private readonly fallback: GeminiProvider,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompleteResult> {
    this.batchTotal++;

    // Try primary (CPU model) — up to 2 attempts
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await this.primary.complete(prompt, options);
        this.logCall('cpu-model', result, options?.promptVersion);
        return { ...result, usedFallback: false, promptVersion: options?.promptVersion };
      } catch (err: unknown) {
        this.logger.warn(`CPU model attempt ${attempt} failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Both CPU attempts failed → try fallback (Gemini Pro) — up to 2 attempts
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await this.fallback.complete(prompt, options);
        this.batchFallback++;
        this.logCall('gemini', result, options?.promptVersion);
        return { ...result, usedFallback: true, promptVersion: options?.promptVersion };
      } catch (err: unknown) {
        this.logger.warn(`Gemini attempt ${attempt} failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // All 4 attempts exhausted
    this.logger.error('All LLM providers failed', { prompt: prompt.slice(0, 80) });
    throw new LlmPendingRetryError('All LLM providers failed after retries', 'all');
  }

  async embed(text: string): Promise<LlmEmbedResult> {
    return this.primary.embed(text);
  }

  resetBatchCounters(): void {
    this.batchTotal = 0;
    this.batchFallback = 0;
  }

  logBatchSummary(): void {
    if (this.batchTotal === 0) return;

    const rate = this.batchFallback / this.batchTotal;
    const threshold =
      this.configService.get<number>('LLM_FALLBACK_RATE_THRESHOLD') ?? 0.5;

    if (rate > threshold) {
      this.logger.warn('LLM fallback rate exceeded threshold', {
        'llm.fallback_rate': rate,
        batchFallback: this.batchFallback,
        batchTotal: this.batchTotal,
        threshold,
      });
    } else {
      this.logger.log('LLM batch summary', {
        batchTotal: this.batchTotal,
        batchFallback: this.batchFallback,
        rate,
      });
    }
  }

  private logCall(
    provider: string,
    result: LlmCompletionResult,
    promptVersion?: string,
  ): void {
    this.logger.log('LLM call', {
      provider,
      modelVersion: result.modelVersion,
      promptVersion,
      latencyMs: result.latencyMs,
      success: result.success,
    });
  }
}
