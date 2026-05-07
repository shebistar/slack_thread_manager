import { z } from 'zod';

export const createChannelSchema = z.object({
  slackChannelId: z
    .string()
    .min(1)
    .max(20)
    .regex(
      /^[CGD][A-Z0-9]{8,}$/,
      'Invalid Slack channel ID format (expected e.g. C01ABC123)',
    ),
  name: z.string().min(1).max(100),
  workstreamId: z.string().uuid(),
  isActive: z.boolean().default(true),
});
export type CreateChannel = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = createChannelSchema.partial().omit({ slackChannelId: true });
export type UpdateChannel = z.infer<typeof updateChannelSchema>;

export const channelSchema = createChannelSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type Channel = z.infer<typeof channelSchema>;
