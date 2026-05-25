import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { slackThreads } from './threads.js';
import { workstreams } from './workstreams.js';

export const silenceAlertStatusEnum = pgEnum('silence_alert_status', [
  'active',
  'resolved',
  'dismissed',
]);

export type SilenceAlertStatusValue = (typeof silenceAlertStatusEnum.enumValues)[number];

export const silenceAlerts = pgTable(
  'silence_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => slackThreads.id),
    workstreamId: uuid('workstream_id').references(() => workstreams.id),
    topicName: text('topic_name').notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull(),
    silenceDays: integer('silence_days').notNull(),
    participantCount: integer('participant_count').notNull(),
    status: silenceAlertStatusEnum('status').notNull().default('active'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_silence_alerts_active_thread').on(table.threadId).where(sql`${table.status} = 'active'`),
    index('idx_silence_alerts_status').on(table.status),
    index('idx_silence_alerts_workstream_id').on(table.workstreamId),
    index('idx_silence_alerts_detected_at').on(table.detectedAt),
    index('idx_silence_alerts_thread_id').on(table.threadId),
  ],
);

export const silenceAlertsRelations = relations(silenceAlerts, ({ one }) => ({
  thread: one(slackThreads, {
    fields: [silenceAlerts.threadId],
    references: [slackThreads.id],
  }),
  workstream: one(workstreams, {
    fields: [silenceAlerts.workstreamId],
    references: [workstreams.id],
  }),
}));

export type SilenceAlert = typeof silenceAlerts.$inferSelect;
export type NewSilenceAlert = typeof silenceAlerts.$inferInsert;
