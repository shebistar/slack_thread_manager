import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { classifiedTopics } from '@slack-thread-manager/db';
import type { EnrichmentResponse, EnrichmentSection } from '@slack-thread-manager/shared';
import type { EnrichmentSource, SourceQueryContext } from './enrichment-source.interface.js';
import { ENRICHMENT_SOURCES } from './enrichment-source.interface.js';
import { EnrichmentCacheService } from './enrichment-cache.service.js';

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(ENRICHMENT_SOURCES) private readonly sources: EnrichmentSource[],
    private readonly cacheService: EnrichmentCacheService,
  ) {}

  async getEnrichment(threadId: string): Promise<EnrichmentResponse> {
    this.logger.debug('Enrichment requested', { threadId });

    const cached = this.cacheService.get(threadId);
    if (cached) {
      return cached;
    }

    const context = await this.buildQueryContext(threadId);

    const results = await Promise.allSettled(
      this.sources.map((source) => source.query(threadId, context)),
    );

    const sections: EnrichmentSection[] = [];
    let sourcesSucceeded = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const source = this.sources[i]!;

      if (result.status === 'fulfilled') {
        sections.push(...result.value.sections);
        if (result.value.sections.length > 0) {
          sourcesSucceeded++;
        }
      } else {
        this.logger.warn('Enrichment source failed', {
          source: source.name,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    const response: EnrichmentResponse = {
      sections,
      meta: {
        threadId,
        queriedAt: new Date().toISOString(),
        sourcesAvailable: this.sources.length,
        sourcesSucceeded,
      },
    };

    this.cacheService.set(threadId, response);

    return response;
  }

  private async buildQueryContext(threadId: string): Promise<SourceQueryContext> {
    try {
      const [topic] = await this.db
        .select({
          primaryTopic: classifiedTopics.primaryTopic,
          plainSummary: classifiedTopics.plainSummary,
        })
        .from(classifiedTopics)
        .where(eq(classifiedTopics.threadId, threadId))
        .limit(1);

      if (!topic) {
        return {};
      }

      const summary = typeof topic.plainSummary === 'string'
        ? topic.plainSummary
        : typeof topic.plainSummary === 'object' && topic.plainSummary !== null
          ? (topic.plainSummary as { headline?: string }).headline ?? ''
          : '';

      return {
        primaryTopic: topic.primaryTopic ?? undefined,
        summary: summary || undefined,
      };
    } catch (err) {
      this.logger.warn('Failed to build query context', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {};
    }
  }
}
