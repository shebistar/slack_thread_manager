import { z } from 'zod';

export const stagingStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const stagingResultSchema = z.object({
  threadsStaged: z.number().int().nonnegative(),
  threadsFailed: z.number().int().nonnegative(),
  batchId: z.string().uuid().nullable(),
});

export type StagingStatus = z.infer<typeof stagingStatusSchema>;
export type StagingResult = z.infer<typeof stagingResultSchema>;
