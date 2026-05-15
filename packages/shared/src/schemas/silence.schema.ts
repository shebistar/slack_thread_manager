import { z } from 'zod';

const thresholdDaysSchema = z.number().int().min(1).max(30);

export const updateGlobalThresholdSchema = z.object({
  thresholdDays: thresholdDaysSchema,
});

export const upsertWorkstreamThresholdSchema = z.object({
  workstreamId: z.string().uuid(),
  thresholdDays: thresholdDaysSchema,
});

export const silenceThresholdResponseSchema = z.object({
  id: z.string().uuid(),
  workstreamId: z.string().uuid().nullable(),
  workstreamName: z.string().nullable(),
  thresholdDays: thresholdDaysSchema,
  updatedAt: z.string().datetime(),
});

export const silenceThresholdListResponseSchema = z.object({
  global: silenceThresholdResponseSchema,
  overrides: z.array(silenceThresholdResponseSchema),
});

export type UpdateGlobalThreshold = z.infer<typeof updateGlobalThresholdSchema>;
export type UpsertWorkstreamThreshold = z.infer<typeof upsertWorkstreamThresholdSchema>;
export type SilenceThresholdResponse = z.infer<typeof silenceThresholdResponseSchema>;
export type SilenceThresholdListResponse = z.infer<typeof silenceThresholdListResponseSchema>;
