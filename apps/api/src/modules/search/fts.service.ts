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

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;

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

  const summaries = [anonymizedContent.technicalSummary, anonymizedContent.plainSummary];
  for (const summary of summaries) {
    if (!summary || typeof summary !== 'object') {
      continue;
    }

    const typedSummary = summary as Partial<SummaryShape>;
    if (typeof typedSummary.headline === 'string' && typedSummary.headline) {
      parts.push(typedSummary.headline);
    }
    if (typeof typedSummary.body === 'string' && typedSummary.body) {
      parts.push(typedSummary.body);
    }
    if (Array.isArray(typedSummary.key_decisions) && typedSummary.key_decisions.length) {
      parts.push(typedSummary.key_decisions.join(' '));
    }
    if (Array.isArray(typedSummary.action_items) && typedSummary.action_items.length) {
      parts.push(typedSummary.action_items.join(' '));
    }
  }

  return parts.join(' ');
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_SEARCH_LIMIT;
  }
  const normalized = Math.floor(limit as number);
  if (normalized < 1) {
    return 1;
  }
  if (normalized > MAX_SEARCH_LIMIT) {
    return MAX_SEARCH_LIMIT;
  }
  return normalized;
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

    const limit = normalizeLimit(options?.limit);

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

    this.logger.debug('FTS search executed', { queryLength: trimmed.length, resultCount: results.length });

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
    const trimmedDocument = document.trim();

    await tx
      .update(classifiedTopics)
      .set({
        searchVector: trimmedDocument
          ? sql`to_tsvector('english', ${trimmedDocument})`
          : sql`NULL`,
      })
      .where(eq(classifiedTopics.threadId, threadId));

    if (!trimmedDocument) {
      this.logger.warn('Empty FTS document for thread, cleared search_vector', { threadId });
    }
  }
}
