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
  'BACKFILL',
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

export const briefingHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export type BriefingHistoryQuery = z.infer<typeof briefingHistoryQuerySchema>;

export const briefingHistoryItemSchema = z.object({
  id: z.string().uuid(),
  briefingDate: z.string(),
  briefingShape: briefingShapeSchema,
  threadCount: z.number().int(),
  workstreamCount: z.number().int(),
  generatedAt: z.string(),
});

export type BriefingHistoryItem = z.infer<typeof briefingHistoryItemSchema>;

export const briefingHistoryResponseSchema = z.object({
  briefings: z.array(briefingHistoryItemSchema),
});

export type BriefingHistoryResponse = z.infer<typeof briefingHistoryResponseSchema>;
