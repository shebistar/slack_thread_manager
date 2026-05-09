import { z } from 'zod';

export const llmConfigSchema = z.object({
  CPU_MODEL_URL: z.string().url().optional(),
  CPU_MODEL_NAME: z.string().optional().default('phi3:mini'),
  CPU_EMBED_MODEL_NAME: z.string().optional().default('nomic-embed-text'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_NAME: z.string().optional().default('gemini-2.5-flash'),
  LLM_TIMEOUT_MS: z.coerce.number().optional().default(60_000),
  LLM_FALLBACK_RATE_THRESHOLD: z.coerce.number().min(0).max(1).optional().default(0.5),
  CLASSIFICATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).optional().default(0.6),
  EMBEDDING_DIMENSIONS: z.coerce.number().optional().default(768),
});

export type LlmConfig = z.infer<typeof llmConfigSchema>;
