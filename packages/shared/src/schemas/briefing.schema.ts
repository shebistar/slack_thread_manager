import { z } from 'zod';

export const briefingShapeSchema = z.enum([
  'EXECUTIVE_SCAN',
  'FILTERED_BRIEF',
  'INTELLIGENCE_REPORT',
]);

export type BriefingShape = z.infer<typeof briefingShapeSchema>;

export const briefingItemTypeSchema = z.enum([
  'STANDARD',
  'CROSS_WORKSTREAM',
  'ORPHANED_ACTION',
  'GONE_QUIET',
]);

export type BriefingItemType = z.infer<typeof briefingItemTypeSchema>;

export const briefingItemResponseSchema = z.object({
  id: z.string().uuid(),
  briefingId: z.string().uuid(),
  threadId: z.string().uuid(),
  headline: z.string(),
  summaryText: z.string(),
  workstreamName: z.string().nullable(),
  sourceThreadUrl: z.string().nullable(),
  itemType: briefingItemTypeSchema,
  sortOrder: z.number().int(),
});

export type BriefingItemResponse = z.infer<typeof briefingItemResponseSchema>;

export const briefingResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  briefingDate: z.string(),
  briefingShape: briefingShapeSchema,
  generatedAt: z.string(),
  threadCount: z.number().int(),
  workstreamCount: z.number().int(),
  items: z.array(briefingItemResponseSchema).optional(),
});

export type BriefingResponse = z.infer<typeof briefingResponseSchema>;

export const markItemReadResponseSchema = z.object({
  briefingItemId: z.string().uuid(),
  readAt: z.string(),
});

export type MarkItemReadResponse = z.infer<typeof markItemReadResponseSchema>;
