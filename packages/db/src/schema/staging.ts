import { index, jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { slackThreads } from './threads.js';
import { users } from './users.js';

export const stagingStatusEnum = pgEnum('staging_status', [
  'pending',
  'approved',
  'rejected',
]);

export const stagingQueue = pgTable(
  'staging_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => slackThreads.id),
    batchId: uuid('batch_id'),
    originalContent: jsonb('original_content').notNull(),
    anonymizedContent: jsonb('anonymized_content').notNull(),
    flags: jsonb('flags').notNull().default([]),
    status: stagingStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_staging_queue_thread_id').on(table.threadId),
    index('idx_staging_queue_status').on(table.status),
    index('idx_staging_queue_batch_id').on(table.batchId),
  ],
);

export type StagingQueueEntry = typeof stagingQueue.$inferSelect;
export type NewStagingQueueEntry = typeof stagingQueue.$inferInsert;
export type StagingStatusValue = (typeof stagingStatusEnum.enumValues)[number];
