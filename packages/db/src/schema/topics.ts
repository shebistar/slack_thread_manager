import { index, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { slackThreads } from './threads.js';
import { workstreams } from './workstreams.js';

export const classifiedTopics = pgTable(
  'classified_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => slackThreads.id),
    primaryTopic: text('primary_topic').notNull(),
    secondaryTopics: jsonb('secondary_topics').notNull().default([]),
    workstreamId: uuid('workstream_id').references(() => workstreams.id),
    confidence: real('confidence').notNull(),
    modelVersion: text('model_version').notNull(),
    promptVersion: text('prompt_version').notNull(),
    technicalSummary: jsonb('technical_summary'),
    plainSummary: jsonb('plain_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_classified_topics_thread_id').on(table.threadId),
  ],
);

export const classifiedTopicsRelations = relations(classifiedTopics, ({ one }) => ({
  thread: one(slackThreads, {
    fields: [classifiedTopics.threadId],
    references: [slackThreads.id],
  }),
  workstream: one(workstreams, {
    fields: [classifiedTopics.workstreamId],
    references: [workstreams.id],
  }),
}));

export type ClassifiedTopic = typeof classifiedTopics.$inferSelect;
export type NewClassifiedTopic = typeof classifiedTopics.$inferInsert;
