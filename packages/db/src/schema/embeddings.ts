import { pgTable, text, timestamp, uniqueIndex, uuid, vector, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { slackThreads } from './threads.js';

export const threadEmbeddings = pgTable(
  'thread_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => slackThreads.id),
    embedding: vector('embedding', { dimensions: 768 }).notNull(),
    modelVersion: text('model_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_thread_embeddings_thread_id_unique').on(table.threadId),
    index('idx_thread_embeddings_hnsw').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);

export const threadEmbeddingsRelations = relations(threadEmbeddings, ({ one }) => ({
  thread: one(slackThreads, {
    fields: [threadEmbeddings.threadId],
    references: [slackThreads.id],
  }),
}));

export type ThreadEmbedding = typeof threadEmbeddings.$inferSelect;
export type NewThreadEmbedding = typeof threadEmbeddings.$inferInsert;
