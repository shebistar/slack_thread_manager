import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workstreams } from './workstreams.js';

export const slackChannels = pgTable(
  'slack_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slackChannelId: text('slack_channel_id').notNull(),
    name: text('name').notNull(),
    workstreamId: uuid('workstream_id').references(() => workstreams.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastPolledTs: timestamp('last_polled_ts', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_slack_channels_slack_channel_id').on(table.slackChannelId),
    index('idx_slack_channels_workstream_id').on(table.workstreamId),
    index('idx_slack_channels_is_active').on(table.isActive),
  ],
);

export const slackChannelsRelations = relations(slackChannels, ({ one }) => ({
  workstream: one(workstreams, {
    fields: [slackChannels.workstreamId],
    references: [workstreams.id],
  }),
}));

export type SlackChannel = typeof slackChannels.$inferSelect;
export type NewSlackChannel = typeof slackChannels.$inferInsert;
