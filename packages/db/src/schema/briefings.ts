import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { slackThreads } from './threads.js';

export const briefingShapeEnum = pgEnum('briefing_shape', [
  'executive_scan',
  'filtered_brief',
  'intelligence_report',
]);

export const briefingItemTypeEnum = pgEnum('briefing_item_type', [
  'standard',
  'cross_workstream',
  'orphaned_action',
  'gone_quiet',
  'backfill',
]);

export const briefings = pgTable(
  'briefings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    briefingDate: timestamp('briefing_date', { withTimezone: true, mode: 'date' }).notNull(),
    briefingShape: briefingShapeEnum('briefing_shape').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    threadCount: integer('thread_count').notNull().default(0),
    workstreamCount: integer('workstream_count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('idx_briefings_user_date').on(table.userId, table.briefingDate),
    index('idx_briefings_user_id').on(table.userId),
    index('idx_briefings_date').on(table.briefingDate),
  ],
);

export const briefingItems = pgTable(
  'briefing_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    briefingId: uuid('briefing_id')
      .notNull()
      .references(() => briefings.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => slackThreads.id),
    headline: text('headline').notNull(),
    summaryText: text('summary_text').notNull(),
    workstreamName: text('workstream_name'),
    sourceThreadUrl: text('source_thread_url'),
    itemType: briefingItemTypeEnum('item_type').notNull().default('standard'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_briefing_items_briefing_id').on(table.briefingId),
    index('idx_briefing_items_thread_id').on(table.threadId),
  ],
);

export const briefingItemReads = pgTable(
  'briefing_item_reads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    briefingItemId: uuid('briefing_item_id')
      .notNull()
      .references(() => briefingItems.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_briefing_item_reads_user_item').on(table.userId, table.briefingItemId),
    index('idx_briefing_item_reads_user_id').on(table.userId),
  ],
);

export const briefingsRelations = relations(briefings, ({ one, many }) => ({
  user: one(users, {
    fields: [briefings.userId],
    references: [users.id],
  }),
  items: many(briefingItems),
}));

export const briefingItemsRelations = relations(briefingItems, ({ one, many }) => ({
  briefing: one(briefings, {
    fields: [briefingItems.briefingId],
    references: [briefings.id],
  }),
  thread: one(slackThreads, {
    fields: [briefingItems.threadId],
    references: [slackThreads.id],
  }),
  reads: many(briefingItemReads),
}));

export const briefingItemReadsRelations = relations(briefingItemReads, ({ one }) => ({
  user: one(users, {
    fields: [briefingItemReads.userId],
    references: [users.id],
  }),
  briefingItem: one(briefingItems, {
    fields: [briefingItemReads.briefingItemId],
    references: [briefingItems.id],
  }),
}));

export type Briefing = typeof briefings.$inferSelect;
export type NewBriefing = typeof briefings.$inferInsert;
export type BriefingItem = typeof briefingItems.$inferSelect;
export type NewBriefingItem = typeof briefingItems.$inferInsert;
export type BriefingItemRead = typeof briefingItemReads.$inferSelect;
export type NewBriefingItemRead = typeof briefingItemReads.$inferInsert;
export type BriefingShapeValue = (typeof briefingShapeEnum.enumValues)[number];
export type BriefingItemTypeValue = (typeof briefingItemTypeEnum.enumValues)[number];
