import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { LlmService } from '../pipeline/llm/llm.service.js';

export interface VectorSearchResult {
  threadId: string;
  classifiedTopicId: string;
  similarity: number;
}

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;

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
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly configService: ConfigService,
  ) {}

  async search(
    query: string,
    options?: { limit?: number; threshold?: number },
  ): Promise<VectorSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    let embedding: number[];
    let modelVersion: string;

    try {
      const result = await this.llmService.embed(trimmed);
      embedding = result.embedding;
      modelVersion = result.modelVersion;
    } catch (err) {
      this.logger.warn('VectorSearchService: embed() failed — returning empty results', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    const similarityThreshold =
      options?.threshold ??
      this.configService.get<number>('SEMANTIC_SEARCH_SIMILARITY_THRESHOLD') ??
      this.configService.get<number>('CORRELATION_SIMILARITY_THRESHOLD') ??
      0.7;

    const distanceThreshold = 1 - similarityThreshold;
    const limit = normalizeLimit(options?.limit);

    // Format as pgvector text literal: '[0.1, 0.2, ...]'
    // Passed as a parameterized value — Drizzle's sql tag makes this $1::vector
    const vectorLiteral = `[${embedding.join(',')}]`;

    // Use <=> operator directly (never wrap with 1 - (...)) to preserve HNSW index usage
    const rows = await this.db.execute<{
      thread_id: string;
      classified_topic_id: string;
      distance: number;
    }>(sql`
      SELECT
        te.thread_id,
        ct.id AS classified_topic_id,
        (te.embedding <=> ${vectorLiteral}::vector)::float8 AS distance
      FROM thread_embeddings te
      INNER JOIN slack_threads st ON te.thread_id = st.id
      INNER JOIN classified_topics ct ON ct.thread_id = te.thread_id
      WHERE st.pipeline_state = 'approved'
        AND te.embedding <=> ${vectorLiteral}::vector < ${distanceThreshold}::float8
      ORDER BY te.embedding <=> ${vectorLiteral}::vector ASC
      LIMIT ${limit}
    `);

    this.logger.debug('VectorSearchService: search executed', {
      queryLength: trimmed.length,
      modelVersion,
      threshold: similarityThreshold,
      resultCount: rows.rows.length,
    });

    return rows.rows.map((r) => ({
      threadId: r.thread_id,
      classifiedTopicId: r.classified_topic_id,
      similarity: 1 - r.distance,
    }));
  }
}
