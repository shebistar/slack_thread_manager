import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { slackChannels } from './channels.js';

export const slackThreads = pgTable(
  'slack_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slackTeamId: text('slack_team_id').notNull(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => slackChannels.id),
    threadTs: text('thread_ts').notNull(),
    latestReplyTs: text('latest_reply_ts'),
    messageCount: integer('message_count').notNull().default(0),
    rawMessages: jsonb('raw_messages').notNull().default([]),
    participantIds: text('participant_ids').array().notNull().default([]),
    pipelineState: text('pipeline_state').default('ingested'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_slack_threads_dedup').on(table.slackTeamId, table.channelId, table.threadTs),
    index('idx_slack_threads_channel_id').on(table.channelId),
    index('idx_slack_threads_thread_ts').on(table.threadTs),
  ],
);

export const threadMessages = pgTable(
  'thread_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => slackThreads.id, { onDelete: 'cascade' }),
    messageTs: text('message_ts').notNull(),
    userHandle: text('user_handle'),
    text: text('text').notNull().default(''),
    rawPayload: jsonb('raw_payload').notNull(),
  },
  (table) => [
    index('idx_thread_messages_thread_id').on(table.threadId),
  ],
);

export const slackThreadsRelations = relations(slackThreads, ({ one, many }) => ({
  channel: one(slackChannels, {
    fields: [slackThreads.channelId],
    references: [slackChannels.id],
  }),
  messages: many(threadMessages),
}));

export const threadMessagesRelations = relations(threadMessages, ({ one }) => ({
  thread: one(slackThreads, {
    fields: [threadMessages.threadId],
    references: [slackThreads.id],
  }),
}));

export type SlackThread = typeof slackThreads.$inferSelect;
export type NewSlackThread = typeof slackThreads.$inferInsert;
export type ThreadMessage = typeof threadMessages.$inferSelect;
export type NewThreadMessage = typeof threadMessages.$inferInsert;
