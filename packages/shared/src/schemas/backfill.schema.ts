import { z } from 'zod';

export const backfillRequestSchema = z.object({
  channelId: z.string().uuid().optional(),
  oldestTs: z.string().min(1),
});

export type BackfillRequest = z.infer<typeof backfillRequestSchema>;
