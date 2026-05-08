import { z } from 'zod';

export const llmConfigSchema = z.object({
  CPU_MODEL_URL: z.string().url().optional(),
  CPU_MODEL_NAME: z.string().optional().default('mistral'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_NAME: z.string().optional().default('gemini-pro'),
  LLM_TIMEOUT_MS: z.coerce.number().optional().default(30_000),
  LLM_FALLBACK_RATE_THRESHOLD: z.coerce.number().min(0).max(1).optional().default(0.5),
});

export type LlmConfig = z.infer<typeof llmConfigSchema>;
