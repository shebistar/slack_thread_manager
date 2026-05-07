import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'ARCHITECT',
  'PM',
  'CONSULTANT',
  'SALES',
  'TRAINING',
  'ADMIN',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    slackHandle: text('slack_handle').notNull(),
    slackNicknames: text('slack_nicknames').array().notNull().default([]),
    role: userRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_users_email').on(table.email),
    uniqueIndex('idx_users_slack_handle').on(table.slackHandle),
    index('idx_users_role').on(table.role),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
