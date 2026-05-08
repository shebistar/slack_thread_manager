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
    const modelName = this.configService.get<string>('GEMINI_MODEL_NAME') ?? 'gemini-pro';
    const model = this.genAI.getGenerativeModel({ model: modelName });
    const start = Date.now();
    const result = await model.generateContent(prompt);
    return {
      content: result.response.text(),
      modelVersion: modelName,
      latencyMs: Date.now() - start,
      success: true,
    };
  }

  async embed(text: string): Promise<LlmEmbedResult> {
    const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return {
      embedding: result.embedding.values,
      modelVersion: 'text-embedding-004',
    };
  }

  async healthCheck(): Promise<boolean> {
    const modelName = this.configService.get<string>('GEMINI_MODEL_NAME') ?? 'gemini-pro';
    try {
      const model = this.genAI.getGenerativeModel({ model: modelName });
      await model.generateContent('ping');
      return true;
    } catch (err: unknown) {
      this.logger.warn('Gemini health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}
