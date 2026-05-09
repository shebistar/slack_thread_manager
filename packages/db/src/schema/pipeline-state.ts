import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { slackThreads } from './threads.js';

export const pipelineStateEnum = pgEnum('pipeline_state', [
  'ingested',
  'classified',
  'summarized',
  'embedded',
  'staged',
  'approved',
  'delivered',
  'failed',
  'pending_retry',
]);

export type PipelineStateValue = (typeof pipelineStateEnum.enumValues)[number];

export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  threadsProcessed: integer('threads_processed').notNull().default(0),
  threadsFailed: integer('threads_failed').notNull().default(0),
  fallbackCount: integer('fallback_count').notNull().default(0),
});

export const pipelineFailures = pgTable(
  'pipeline_failures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => slackThreads.id),
    pipelineStage: pipelineStateEnum('pipeline_stage').notNull(),
    errorMessage: text('error_message').notNull(),
    errorContext: jsonb('error_context').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pipeline_failures_thread_id').on(table.threadId),
  ],
);

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type NewPipelineRun = typeof pipelineRuns.$inferInsert;
export type PipelineFailure = typeof pipelineFailures.$inferSelect;
export type NewPipelineFailure = typeof pipelineFailures.$inferInsert;
