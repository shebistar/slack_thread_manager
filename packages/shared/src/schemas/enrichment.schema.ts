import { z } from 'zod';

export const enrichmentSourceTypeSchema = z.enum([
  'NOTEBOOKLM',
  'OPENSHIFT_DOCS',
  'PAST_DISCUSSION',
]);
export type EnrichmentSourceType = z.infer<typeof enrichmentSourceTypeSchema>;

export const enrichmentSectionSchema = z.object({
  title: z.string(),
  description: z.string(),
  sourceUrl: z.string().url(),
  sourceType: enrichmentSourceTypeSchema,
  relevanceScore: z.number().min(0).max(1),
});
export type EnrichmentSection = z.infer<typeof enrichmentSectionSchema>;

export const enrichmentMetaSchema = z.object({
  threadId: z.string().uuid(),
  queriedAt: z.string().datetime(),
  sourcesAvailable: z.number().int().min(0),
  sourcesSucceeded: z.number().int().min(0),
});
export type EnrichmentMeta = z.infer<typeof enrichmentMetaSchema>;

export const enrichmentResponseSchema = z.object({
  sections: z.array(enrichmentSectionSchema),
  meta: enrichmentMetaSchema,
});
export type EnrichmentResponse = z.infer<typeof enrichmentResponseSchema>;

export const enrichmentThreadIdParamSchema = z.object({
  threadId: z.string().uuid(),
});
export type EnrichmentThreadIdParam = z.infer<typeof enrichmentThreadIdParamSchema>;
