export interface LlmCompletionOptions {
  promptVersion?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompletionResult {
  content: string;
  modelVersion: string;
  latencyMs: number;
  success: true;
}

export interface LlmEmbedResult {
  embedding: number[];
  modelVersion: string;
}

export class LlmPendingRetryError extends Error {
  readonly name = 'LlmPendingRetryError';

  constructor(
    message: string,
    public readonly provider: string,
  ) {
    super(message);
  }
}

export interface LlmProviderInterface {
  complete(prompt: string, options?: LlmCompletionOptions): Promise<LlmCompletionResult>;
  embed(text: string): Promise<LlmEmbedResult>;
  healthCheck(): Promise<boolean>;
}
