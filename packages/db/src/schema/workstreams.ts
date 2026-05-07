import { index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';

export const workstreams = pgTable(
  'workstreams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_workstreams_name').on(table.name)],
);

export const userWorkstreams = pgTable(
  'user_workstreams',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    workstreamId: uuid('workstream_id')
      .notNull()
      .references(() => workstreams.id),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.workstreamId] }),
    index('idx_user_workstreams_user_id').on(table.userId),
    index('idx_user_workstreams_workstream_id').on(table.workstreamId),
  ],
);

// Relations defined here because userWorkstreams bridges users ↔ workstreams
export const usersRelations = relations(users, ({ many }) => ({
  userWorkstreams: many(userWorkstreams),
}));

export const workstreamsRelations = relations(workstreams, ({ many }) => ({
  userWorkstreams: many(userWorkstreams),
}));

export const userWorkstreamsRelations = relations(userWorkstreams, ({ one }) => ({
  user: one(users, {
    fields: [userWorkstreams.userId],
    references: [users.id],
  }),
  workstream: one(workstreams, {
    fields: [userWorkstreams.workstreamId],
    references: [workstreams.id],
  }),
}));

export type Workstream = typeof workstreams.$inferSelect;
export type NewWorkstream = typeof workstreams.$inferInsert;
export type UserWorkstream = typeof userWorkstreams.$inferSelect;
export type NewUserWorkstream = typeof userWorkstreams.$inferInsert;
