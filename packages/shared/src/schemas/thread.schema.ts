import { z } from 'zod';

export const threadMessageSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  messageTs: z.string().min(1),
  userHandle: z.string().nullable(),
  text: z.string(),
  rawPayload: z.record(z.unknown()),
});
export type ThreadMessageDto = z.infer<typeof threadMessageSchema>;

export const slackThreadSchema = z.object({
  id: z.string().uuid(),
  slackTeamId: z.string().min(1),
  channelId: z.string().uuid(),
  threadTs: z.string().min(1),
  latestReplyTs: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  rawMessages: z.array(z.record(z.unknown())),
  participantIds: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SlackThreadDto = z.infer<typeof slackThreadSchema>;

export const slackExportMessageSchema = z.object({
  type: z.string().optional(),
  user: z.string().optional(),
  text: z.string().optional().default(''),
  ts: z.string().min(1),
  thread_ts: z.string().optional(),
  reply_count: z.number().optional(),
  subtype: z.string().optional(),
}).passthrough();
export type SlackExportMessage = z.infer<typeof slackExportMessageSchema>;

export const importRequestSchema = z.object({
  messages: z.array(slackExportMessageSchema).min(1),
  slackTeamId: z.string().min(1),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

export const importSummarySchema = z.object({
  threadsFound: z.number().int().nonnegative(),
  threadsStored: z.number().int().nonnegative(),
  messagesStored: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type ImportSummary = z.infer<typeof importSummarySchema>;

export const ingestionSummarySchema = z.object({
  channelsPolled: z.number().int().nonnegative(),
  threadsFound: z.number().int().nonnegative(),
  threadsStored: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type IngestionSummary = z.infer<typeof ingestionSummarySchema>;
