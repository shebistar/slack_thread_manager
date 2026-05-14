import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { inArray, eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { classifiedTopics, slackThreads, slackChannels, workstreams } from '@slack-thread-manager/db';
import type { UserRole } from '@slack-thread-manager/shared';
import type { SearchResultItem } from '@slack-thread-manager/shared';
import { FtsService } from './fts.service.js';
import { VectorSearchService } from './vector-search.service.js';
import { HybridSearchService } from './hybrid-search.service.js';

const TECHNICAL_SUMMARY_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'ARCHITECT',
  'CONSULTANT',
]);

interface SummaryShape {
  headline?: string;
  body?: string;
  key_decisions?: string[];
  action_items?: string[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly ftsService: FtsService,
    private readonly vectorSearchService: VectorSearchService,
    private readonly hybridSearchService: HybridSearchService,
    private readonly configService: ConfigService,
  ) {}

  async search(
    query: string,
    userRole: UserRole,
  ): Promise<{
    results: SearchResultItem[];
    meta: { total: number; query: string; searchTimeMs: number };
    suggestions?: string[];
  }> {
    const startTime = Date.now();

    const [ftsResults, semanticResults] = await Promise.all([
      this.ftsService.search(query),
      this.vectorSearchService.search(query),
    ]);

    const merged = this.hybridSearchService.merge(ftsResults, semanticResults);

    this.logger.debug('SearchService: parallel search completed', {
      ftsCount: ftsResults.length,
      semanticCount: semanticResults.length,
      mergedCount: merged.length,
    });

    if (merged.length === 0) {
      const searchTimeMs = Date.now() - startTime;
      return {
        results: [],
        meta: { total: 0, query, searchTimeMs },
        suggestions: this.generateSuggestions(query),
      };
    }

    const threadIds = merged.map((r) => r.threadId);

    const rows = await this.db
      .select({
        threadId: slackThreads.id,
        classifiedTopicId: classifiedTopics.id,
        slackTeamId: slackThreads.slackTeamId,
        threadTs: slackThreads.threadTs,
        channelSlackId: slackChannels.slackChannelId,
        primaryTopic: classifiedTopics.primaryTopic,
        technicalSummary: classifiedTopics.technicalSummary,
        plainSummary: classifiedTopics.plainSummary,
        workstreamName: workstreams.name,
      })
      .from(slackThreads)
      .innerJoin(classifiedTopics, eq(classifiedTopics.threadId, slackThreads.id))
      .innerJoin(slackChannels, eq(slackChannels.id, slackThreads.channelId))
      .leftJoin(workstreams, eq(workstreams.id, classifiedTopics.workstreamId))
      .where(inArray(slackThreads.id, threadIds));

    const rowMap = new Map(
      rows.map((r) => [`${r.threadId}:${r.classifiedTopicId}`, r]),
    );
    const useTechnicalSummary = TECHNICAL_SUMMARY_ROLES.has(userRole);
    const configuredSlackTeamId = this.configService.get<string>('SLACK_TEAM_ID');

    const results: SearchResultItem[] = [];

    for (const hit of merged) {
      const row = rowMap.get(`${hit.threadId}:${hit.classifiedTopicId}`);
      if (!row) {
        this.logger.warn('SearchService: merged result missing thread/topic row', {
          threadId: hit.threadId,
          classifiedTopicId: hit.classifiedTopicId,
        });
        continue;
      }

      const summaryRaw = useTechnicalSummary ? row.technicalSummary : row.plainSummary;
      const summarySnippet = this.extractSummarySnippet(summaryRaw);

      results.push({
        threadId: hit.threadId,
        threadHeadline: row.primaryTopic,
        summarySnippet,
        workstreamName: row.workstreamName ?? null,
        sourceThreadUrl: this.buildSlackPermalink(
          configuredSlackTeamId ?? row.slackTeamId,
          row.channelSlackId,
          row.threadTs,
        ),
        relevanceScore: hit.combinedScore,
        matchType: hit.matchType,
      });
    }

    const searchTimeMs = Date.now() - startTime;

    this.logger.debug('SearchService: results shaped', {
      resultCount: results.length,
      searchTimeMs,
    });

    if (results.length === 0) {
      return {
        results: [],
        meta: { total: 0, query, searchTimeMs },
        suggestions: this.generateSuggestions(query),
      };
    }

    return {
      results,
      meta: { total: results.length, query, searchTimeMs },
    };
  }

  private extractSummarySnippet(summary: unknown): string | null {
    if (!summary) return null;
    if (typeof summary === 'string') return summary || null;

    if (typeof summary === 'object') {
      const s = summary as Partial<SummaryShape>;
      const parts: string[] = [];
      if (s.headline) parts.push(s.headline);
      if (s.body) parts.push(s.body);
      const text = parts.join(' ').trim();
      return text || null;
    }

    return null;
  }

  private buildSlackPermalink(
    teamId: string | undefined,
    channelSlackId: string,
    threadTs: string,
  ): string | null {
    if (!teamId) return null;
    const tsForUrl = threadTs.replace('.', '');
    return `https://app.slack.com/client/${teamId}/${channelSlackId}/thread/${channelSlackId}-${tsForUrl}`;
  }

  generateSuggestions(query: string): string[] {
    const words = query.trim().split(/\s+/).filter((w) => w.length > 2);
    const suggestions: string[] = [];

    if (words.length > 1) {
      suggestions.push(`Try a shorter query: "${words[0]}"`);
    }

    suggestions.push('Try different keywords or more general terms');
    suggestions.push("Browse today's briefings to discover relevant threads");

    return suggestions;
  }
}
