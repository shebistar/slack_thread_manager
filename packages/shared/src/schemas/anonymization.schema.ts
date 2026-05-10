import { z } from 'zod';
import { summarySchema } from './pipeline.schema.js';

export const blocklistCategorySchema = z.enum([
  'company_name',
  'person_name',
  'url',
  'account_id',
  'infrastructure',
]);

export const createBlocklistEntrySchema = z.object({
  term: z.string().min(1).trim(),
  replacement: z.string().min(1),
  category: blocklistCategorySchema,
});

const matchPositionSchema = z.object({
  field: z.string(),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
});

export const blocklistMatchSchema = z.object({
  term: z.string(),
  replacement: z.string(),
  category: blocklistCategorySchema,
  source: z.literal('BLOCKLIST'),
  positions: z.array(matchPositionSchema),
});

export const llmEntityMatchSchema = z.object({
  term: z.string(),
  replacement: z.string(),
  category: blocklistCategorySchema,
  source: z.literal('LLM'),
  confidence: z.number().min(0).max(1),
});

export const anonymizationFlagSchema = z.discriminatedUnion('source', [
  blocklistMatchSchema,
  llmEntityMatchSchema,
]);

const summaryContentSchema = z.object({
  technicalSummary: summarySchema,
  plainSummary: summarySchema,
});

export const anonymizationResultSchema = z.object({
  threadId: z.string().uuid(),
  originalContent: summaryContentSchema,
  anonymizedContent: summaryContentSchema,
  flags: z.array(anonymizationFlagSchema),
});

export const llmEntityDetectionResponseSchema = z.array(
  z.object({
    entity_text: z.string().min(1),
    entity_type: blocklistCategorySchema,
    confidence: z.number().min(0).max(1),
    suggested_replacement: z.string().min(1),
  }),
);

export type BlocklistCategory = z.infer<typeof blocklistCategorySchema>;
export type CreateBlocklistEntry = z.infer<typeof createBlocklistEntrySchema>;
export type BlocklistMatch = z.infer<typeof blocklistMatchSchema>;
export type LlmEntityMatch = z.infer<typeof llmEntityMatchSchema>;
export type AnonymizationFlag = z.infer<typeof anonymizationFlagSchema>;
export type AnonymizationResult = z.infer<typeof anonymizationResultSchema>;
export type LlmEntityDetectionResponse = z.infer<typeof llmEntityDetectionResponseSchema>;
