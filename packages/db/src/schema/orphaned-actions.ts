import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { slackThreads } from './threads.js';

export const orphanedActionStatusEnum = pgEnum('orphaned_action_status', [
  'orphaned',
  'resolved',
  'dismissed',
]);

export const orphanedActions = pgTable(
  'orphaned_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => slackThreads.id),
    actionText: text('action_text').notNull(),
    assignedTo: text('assigned_to'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    status: orphanedActionStatusEnum('status').notNull().default('orphaned'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_orphaned_actions_thread_action').on(table.threadId, table.actionText),
    index('idx_orphaned_actions_status').on(table.status),
    index('idx_orphaned_actions_thread_id').on(table.threadId),
  ],
);

export const orphanedActionsRelations = relations(orphanedActions, ({ one }) => ({
  thread: one(slackThreads, {
    fields: [orphanedActions.threadId],
    references: [slackThreads.id],
  }),
}));

export type OrphanedAction = typeof orphanedActions.$inferSelect;
export type NewOrphanedAction = typeof orphanedActions.$inferInsert;
export type OrphanedActionStatusValue = typeof orphanedActionStatusEnum.enumValues[number];
