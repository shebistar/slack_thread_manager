import { customType, index, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { slackThreads } from './threads.js';
import { workstreams } from './workstreams.js';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

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
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_classified_topics_thread_id').on(table.threadId),
    index('idx_classified_topics_search_vector').using('gin', table.searchVector),
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

export const correlationTypeEnum = pgEnum('correlation_type', [
  'semantic',
  'topic_match',
  'participant_overlap',
]);

export const topicCorrelations = pgTable(
  'topic_correlations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceThreadId: uuid('source_thread_id')
      .notNull()
      .references(() => slackThreads.id),
    correlatedThreadId: uuid('correlated_thread_id')
      .notNull()
      .references(() => slackThreads.id),
    correlationType: correlationTypeEnum('correlation_type').notNull(),
    confidence: real('confidence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_topic_correlations_pair').on(table.sourceThreadId, table.correlatedThreadId),
    index('idx_topic_correlations_source').on(table.sourceThreadId),
    index('idx_topic_correlations_correlated').on(table.correlatedThreadId),
  ],
);

export const topicCorrelationsRelations = relations(topicCorrelations, ({ one }) => ({
  sourceThread: one(slackThreads, {
    fields: [topicCorrelations.sourceThreadId],
    references: [slackThreads.id],
  }),
  correlatedThread: one(slackThreads, {
    fields: [topicCorrelations.correlatedThreadId],
    references: [slackThreads.id],
  }),
}));

export type TopicCorrelation = typeof topicCorrelations.$inferSelect;
export type NewTopicCorrelation = typeof topicCorrelations.$inferInsert;
export type CorrelationTypeValue = typeof correlationTypeEnum.enumValues[number];
