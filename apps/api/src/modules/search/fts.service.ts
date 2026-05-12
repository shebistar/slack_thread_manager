import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { classifiedTopics, slackThreads } from '@slack-thread-manager/db';
import type { StagingQueueItem } from '@slack-thread-manager/shared';

export interface FtsResult {
  threadId: string;
  classifiedTopicId: string;
  rank: number;
}

interface SummaryShape {
  headline: string;
  body: string;
  key_decisions: string[];
  action_items: string[];
}

/**
 * Concatenates anonymized summary fields into a single plaintext document
 * suitable for PostgreSQL `to_tsvector()`.
 *
 * `primary_topic` from `classified_topics` is intentionally omitted because it
 * is set during classification and never passes through the anonymization gate
 * — including it could leak pre-review entity references into the search index.
 */
export function buildFtsDocument(
  anonymizedContent: StagingQueueItem['anonymizedContent'],
): string {
  const parts: string[] = [];

  for (const summary of [anonymizedContent.technicalSummary, anonymizedContent.plainSummary] as SummaryShape[]) {
    if (summary.headline) parts.push(summary.headline);
    if (summary.body) parts.push(summary.body);
    if (summary.key_decisions?.length) parts.push(summary.key_decisions.join(' '));
    if (summary.action_items?.length) parts.push(summary.action_items.join(' '));
  }

  return parts.join(' ');
}

@Injectable()
export class FtsService {
  private readonly logger = new Logger(FtsService.name);

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async search(query: string, options?: { limit?: number }): Promise<FtsResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const limit = options?.limit ?? 20;

    const results = await this.db
      .select({
        threadId: classifiedTopics.threadId,
        classifiedTopicId: classifiedTopics.id,
        rank: sql<number>`ts_rank_cd(${classifiedTopics.searchVector}, websearch_to_tsquery('english', ${trimmed}))`,
      })
      .from(classifiedTopics)
      .innerJoin(slackThreads, eq(classifiedTopics.threadId, slackThreads.id))
      .where(
        and(
          eq(slackThreads.pipelineState, 'approved'),
          sql`${classifiedTopics.searchVector} @@ websearch_to_tsquery('english', ${trimmed})`,
        ),
      )
      .orderBy(sql`ts_rank_cd(${classifiedTopics.searchVector}, websearch_to_tsquery('english', ${trimmed})) DESC`)
      .limit(limit);

    this.logger.debug('FTS search executed', { query: trimmed, resultCount: results.length });

    return results;
  }

  /**
   * Refreshes the `search_vector` column for a given thread using the
   * anonymized content from the staging queue. Designed to be called
   * within the same transaction that approves a staging item.
   */
  async refreshSearchVector(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    threadId: string,
    anonymizedContent: StagingQueueItem['anonymizedContent'],
  ): Promise<void> {
    const document = buildFtsDocument(anonymizedContent);
    if (!document.trim()) {
      this.logger.warn('Empty FTS document for thread, skipping search_vector update', { threadId });
      return;
    }

    await tx
      .update(classifiedTopics)
      .set({
        searchVector: sql`to_tsvector('english', ${document})`,
      })
      .where(eq(classifiedTopics.threadId, threadId));
  }
}
