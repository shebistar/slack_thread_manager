import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const blocklistCategoryEnum = pgEnum('blocklist_category', [
  'company_name',
  'person_name',
  'url',
  'account_id',
  'infrastructure',
]);

export const anonymizationBlocklist = pgTable(
  'anonymization_blocklist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    term: text('term').notNull(),
    replacement: text('replacement').notNull(),
    category: blocklistCategoryEnum('category').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_anonymization_blocklist_term').on(table.term),
  ],
);

export type AnonymizationBlocklistEntry = typeof anonymizationBlocklist.$inferSelect;
export type NewAnonymizationBlocklistEntry = typeof anonymizationBlocklist.$inferInsert;
export type BlocklistCategoryValue = typeof blocklistCategoryEnum.enumValues[number];
