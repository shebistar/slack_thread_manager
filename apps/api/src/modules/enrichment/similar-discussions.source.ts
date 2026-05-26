import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql, ne, eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { slackThreads, slackChannels, classifiedTopics } from '@slack-thread-manager/db';
import type { EnrichmentSection } from '@slack-thread-manager/shared';
import { LlmService } from '../pipeline/llm/llm.service.js';
import type { EnrichmentSource, EnrichmentSourceResult, SourceQueryContext } from './enrichment-source.interface.js';

@Injectable()
export class SimilarDiscussionsSource implements EnrichmentSource {
  readonly name = 'Similar Past Discussions';
  private readonly logger = new Logger(SimilarDiscussionsSource.name);
  private readonly maxResults: number;
  private readonly similarityThreshold: number;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(LlmService) private readonly llmService: LlmService,
    private readonly configService: ConfigService,
  ) {
    this.maxResults = this.configService.get<number>('ENRICHMENT_MAX_SIMILAR_RESULTS') ?? 5;
    this.similarityThreshold = this.configService.get<number>('CORRELATION_SIMILARITY_THRESHOLD') ?? 0.7;
  }

  async query(threadId: string, context: SourceQueryContext): Promise<EnrichmentSourceResult> {
    const searchText = context.primaryTopic ?? context.summary ?? '';
    if (!searchText) {
      return { sections: [] };
    }

    try {
      const embedResult = await this.llmService.embed(searchText);
      const vectorLiteral = `[${embedResult.embedding.join(',')}]`;
      const distanceThreshold = 1 - this.similarityThreshold;

      const rows = await this.db.execute<{
        thread_id: string;
        primary_topic: string;
        plain_summary: string | null;
        channel_name: string | null;
        slack_team_id: string;
        channel_slack_id: string;
        thread_ts: string;
        distance: number;
      }>(sql`
        SELECT
          te.thread_id,
          ct.primary_topic,
          ct.plain_summary,
          sc.name AS channel_name,
          st.slack_team_id,
          sc.slack_channel_id AS channel_slack_id,
          st.thread_ts,
          (te.embedding <=> ${vectorLiteral}::vector)::float8 AS distance
        FROM thread_embeddings te
        INNER JOIN slack_threads st ON te.thread_id = st.id
        INNER JOIN classified_topics ct ON ct.thread_id = te.thread_id
        INNER JOIN slack_channels sc ON sc.id = st.channel_id
        WHERE st.pipeline_state = 'approved'
          AND te.thread_id != ${threadId}
          AND te.embedding <=> ${vectorLiteral}::vector < ${distanceThreshold}::float8
        ORDER BY te.embedding <=> ${vectorLiteral}::vector ASC
        LIMIT ${this.maxResults}
      `);

      const configuredTeamId = this.configService.get<string>('SLACK_TEAM_ID');

      const sections: EnrichmentSection[] = rows.rows.map((row) => {
        const teamId = configuredTeamId ?? row.slack_team_id;
        const tsForUrl = row.thread_ts.replace('.', '');
        const permalink = `https://app.slack.com/client/${teamId}/${row.channel_slack_id}/thread/${row.channel_slack_id}-${tsForUrl}`;

        const summary = this.extractSnippet(row.plain_summary);

        return {
          title: row.primary_topic || 'Related discussion',
          description: summary || `Discussion in #${row.channel_name ?? 'unknown'}`,
          sourceUrl: permalink,
          sourceType: 'PAST_DISCUSSION' as const,
          relevanceScore: 1 - row.distance,
        };
      });

      this.logger.debug('Similar discussions query completed', { resultCount: sections.length });
      return { sections };
    } catch (err) {
      this.logger.warn('Similar discussions source failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { sections: [] };
    }
  }

  private extractSnippet(summary: unknown): string | null {
    if (!summary) return null;
    if (typeof summary === 'string') return summary.slice(0, 200);
    if (typeof summary === 'object') {
      const s = summary as { headline?: string; body?: string };
      return (s.headline ?? s.body ?? '').slice(0, 200) || null;
    }
    return null;
  }
}
