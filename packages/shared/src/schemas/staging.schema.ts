import { z } from 'zod';
import { anonymizationFlagSchema } from './anonymization.schema.js';

export const stagingStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const stagingResultSchema = z.object({
  threadsStaged: z.number().int().nonnegative(),
  threadsFailed: z.number().int().nonnegative(),
  batchId: z.string().uuid().nullable(),
});

export const stagingFlagSourceSchema = z.enum(['blocklist', 'llm']);

export const stagingQueueFilterSchema = z.object({
  view: z.enum(['all', 'flagged']).default('all'),
  workstreamId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
});

export const stagingQueueItemSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  batchId: z.string().uuid().nullable(),
  status: stagingStatusSchema,
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
  reviewedBy: z.string().uuid().nullable(),
  workstream: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
    })
    .nullable(),
  flags: z.array(anonymizationFlagSchema),
  originalContent: z.object({
    technicalSummary: z.object({
      headline: z.string(),
      body: z.string(),
      key_decisions: z.array(z.string()),
      action_items: z.array(z.string()),
    }),
    plainSummary: z.object({
      headline: z.string(),
      body: z.string(),
      key_decisions: z.array(z.string()),
      action_items: z.array(z.string()),
    }),
  }),
  anonymizedContent: z.object({
    technicalSummary: z.object({
      headline: z.string(),
      body: z.string(),
      key_decisions: z.array(z.string()),
      action_items: z.array(z.string()),
    }),
    plainSummary: z.object({
      headline: z.string(),
      body: z.string(),
      key_decisions: z.array(z.string()),
      action_items: z.array(z.string()),
    }),
  }),
});

export const batchSummarySchema = z.object({
  batchId: z.string().uuid(),
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const stagingQueueListSchema = z.object({
  items: z.array(stagingQueueItemSchema),
  counts: z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    flagged: z.number().int().nonnegative(),
  }),
  batchSummary: z.array(batchSummarySchema),
});

export const reviewStagingItemSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export const approveAllCleanRequestSchema = z.object({
  batchId: z.string().uuid().optional(),
  workstreamId: z.string().uuid().optional(),
});

export const approveAllCleanResponseSchema = z.object({
  approvedCount: z.number().int().nonnegative(),
  remainingPending: z.number().int().nonnegative(),
  batchComplete: z.boolean(),
});

export type StagingStatus = z.infer<typeof stagingStatusSchema>;
export type StagingResult = z.infer<typeof stagingResultSchema>;
export type StagingFlagSource = z.infer<typeof stagingFlagSourceSchema>;
export type StagingQueueFilter = z.infer<typeof stagingQueueFilterSchema>;
export type StagingQueueItem = z.infer<typeof stagingQueueItemSchema>;
export type BatchSummary = z.infer<typeof batchSummarySchema>;
export type StagingQueueList = z.infer<typeof stagingQueueListSchema>;
export type ReviewStagingItem = z.infer<typeof reviewStagingItemSchema>;
export type ApproveAllCleanRequest = z.infer<typeof approveAllCleanRequestSchema>;
export type ApproveAllCleanResponse = z.infer<typeof approveAllCleanResponseSchema>;
