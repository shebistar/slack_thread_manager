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

const summaryContentSchema = z.object({
  technicalSummary: summarySchema,
  plainSummary: summarySchema,
});

export const anonymizationResultSchema = z.object({
  threadId: z.string().uuid(),
  originalContent: summaryContentSchema,
  anonymizedContent: summaryContentSchema,
  flags: z.array(blocklistMatchSchema),
});

export type BlocklistCategory = z.infer<typeof blocklistCategorySchema>;
export type CreateBlocklistEntry = z.infer<typeof createBlocklistEntrySchema>;
export type BlocklistMatch = z.infer<typeof blocklistMatchSchema>;
export type AnonymizationResult = z.infer<typeof anonymizationResultSchema>;
