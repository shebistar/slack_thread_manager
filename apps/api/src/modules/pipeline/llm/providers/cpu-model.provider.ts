import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmEmbedResult,
  LlmProviderInterface,
} from '../llm-provider.interface.js';

interface OpenAiChatResponse {
  choices: Array<{ message: { content: string } }>;
}

interface OpenAiEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

@Injectable()
export class CpuModelProvider implements LlmProviderInterface {
  private readonly logger = new Logger(CpuModelProvider.name);

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  async complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const url = this.configService.get<string>('CPU_MODEL_URL');
    if (!url) {
      throw new Error('CPU_MODEL_URL is not configured');
    }
    const model = this.configService.get<string>('CPU_MODEL_NAME') ?? 'phi3:mini';
    const timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS') ?? 60_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature ?? 0.2,
          max_tokens: options?.maxTokens ?? 2048,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`CPU model responded with HTTP ${res.status}`);
      }

      const data = (await res.json()) as OpenAiChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('CPU model returned invalid response: missing choices[0].message.content');
      }
      return {
        content,
        modelVersion: model,
        latencyMs: Date.now() - start,
        success: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(text: string): Promise<LlmEmbedResult> {
    const url = this.configService.get<string>('CPU_MODEL_URL');
    if (!url) {
      throw new Error('CPU_MODEL_URL is not configured');
    }
    const model = this.configService.get<string>('CPU_EMBED_MODEL_NAME') ?? 'nomic-embed-text';
    const timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS') ?? 60_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${url}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`CPU model embedding responded with HTTP ${res.status}`);
      }

      const data = (await res.json()) as OpenAiEmbeddingResponse;
      const embedding = data.data?.[0]?.embedding;
      if (!Array.isArray(embedding)) {
        throw new Error('CPU model returned invalid embedding response: missing data[0].embedding');
      }
      return {
        embedding,
        modelVersion: model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<boolean> {
    const url = this.configService.get<string>('CPU_MODEL_URL');
    if (!url) return false;

    const timeoutMs = this.configService.get<number>('LLM_TIMEOUT_MS') ?? 60_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${url}/v1/models`, { signal: controller.signal });
      return res.ok;
    } catch (err: unknown) {
      this.logger.warn('CPU model health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
