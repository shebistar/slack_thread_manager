import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmEmbedResult,
  LlmProviderInterface,
} from '../llm-provider.interface.js';

@Injectable()
export class GeminiProvider implements LlmProviderInterface {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly genAI: GoogleGenerativeAI;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const modelName = this.configService.get<string>('GEMINI_MODEL_NAME') ?? 'gemini-2.5-flash';
    const timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS') ?? 30_000;
    const maxRetries = 3;

    const model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxTokens !== undefined && { maxOutputTokens: options.maxTokens }),
      },
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const start = Date.now();
        const result = await this.withTimeout(model.generateContent(prompt), timeoutMs);
        return {
          content: result.response.text(),
          modelVersion: modelName,
          latencyMs: Date.now() - start,
          success: true,
        };
      } catch (err: unknown) {
        const retryDelayMs = this.extract429RetryDelay(err);
        if (retryDelayMs !== null && attempt < maxRetries) {
          this.logger.warn(`Gemini 429 rate limit — waiting ${retryDelayMs}ms before retry`, {
            attempt,
            retryDelayMs,
          });
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        throw err;
      }
    }

    // Should not be reached
    throw new Error('Gemini complete: exhausted retries');
  }

  private extract429RetryDelay(err: unknown): number | null {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('429')) return null;

    // Parse "retryDelay":"22s" or "retryDelay":"22.5s" from the error JSON
    const match = msg.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
    if (match) {
      return Math.ceil(parseFloat(match[1]) * 1000) + 500; // add 500ms buffer
    }

    // Default to 30s if we can't parse
    return 30_000;
  }

  async embed(text: string): Promise<LlmEmbedResult> {
    const timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS') ?? 30_000;
    const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await this.withTimeout(model.embedContent(text), timeoutMs);
    return {
      embedding: result.embedding.values,
      modelVersion: 'text-embedding-004',
    };
  }

  async healthCheck(): Promise<boolean> {
    const modelName = this.configService.get<string>('GEMINI_MODEL_NAME') ?? 'gemini-2.5-flash';
    const timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS') ?? 30_000;
    try {
      const model = this.genAI.getGenerativeModel({ model: modelName });
      await this.withTimeout(model.generateContent('ping'), timeoutMs);
      return true;
    } catch (err: unknown) {
      this.logger.warn('Gemini health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini call timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }
}
