import { check, index, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { workstreams } from './workstreams.js';

export const silenceThresholds = pgTable(
  'silence_thresholds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workstreamId: uuid('workstream_id').references(() => workstreams.id),
    thresholdDays: integer('threshold_days').notNull().default(3),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_silence_thresholds_workstream_key').on(
      sql`coalesce(${table.workstreamId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index('idx_silence_thresholds_workstream_id').on(table.workstreamId),
    check('ck_silence_thresholds_days_range', sql`${table.thresholdDays} >= 1 AND ${table.thresholdDays} <= 30`),
  ],
);

export const silenceThresholdsRelations = relations(silenceThresholds, ({ one }) => ({
  workstream: one(workstreams, {
    fields: [silenceThresholds.workstreamId],
    references: [workstreams.id],
  }),
}));

export type SilenceThreshold = typeof silenceThresholds.$inferSelect;
export type NewSilenceThreshold = typeof silenceThresholds.$inferInsert;
