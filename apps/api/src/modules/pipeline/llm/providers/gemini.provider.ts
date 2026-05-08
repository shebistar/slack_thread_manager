import { Injectable, Logger } from '@nestjs/common';
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

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const modelName = this.configService.get<string>('GEMINI_MODEL_NAME') ?? 'gemini-2.5-flash';
    const timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS') ?? 30_000;
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxTokens !== undefined && { maxOutputTokens: options.maxTokens }),
      },
    });

    const start = Date.now();
    const result = await this.withTimeout(model.generateContent(prompt), timeoutMs);
    return {
      content: result.response.text(),
      modelVersion: modelName,
      latencyMs: Date.now() - start,
      success: true,
    };
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
