import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnrichmentSection } from '@slack-thread-manager/shared';
import type { EnrichmentSource, EnrichmentSourceResult, SourceQueryContext } from './enrichment-source.interface.js';

@Injectable()
export class OpenShiftDocsSource implements EnrichmentSource {
  readonly name = 'OpenShift Docs';
  private readonly logger = new Logger(OpenShiftDocsSource.name);
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('ENRICHMENT_OPENSHIFT_DOCS_URL')
      ?? 'https://docs.openshift.com';
    this.timeout = this.configService.get<number>('ENRICHMENT_SOURCE_TIMEOUT_MS') ?? 5000;
  }

  async query(_threadId: string, context: SourceQueryContext): Promise<EnrichmentSourceResult> {
    const searchTerm = context.primaryTopic ?? context.summary ?? '';
    if (!searchTerm) {
      return { sections: [] };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      const encodedQuery = encodeURIComponent(searchTerm);
      const response = await fetch(
        `${this.baseUrl}/search?q=${encodedQuery}&format=json&limit=5`,
        { signal: controller.signal },
      );

      clearTimeout(timer);

      if (!response.ok) {
        this.logger.warn('OpenShift docs search returned non-OK status', { status: response.status });
        return { sections: [] };
      }

      const data = await response.json() as { results?: Array<{ title: string; excerpt: string; url: string; relevance?: number }> };

      const sections: EnrichmentSection[] = (data.results ?? []).map((item, idx) => ({
        title: item.title,
        description: item.excerpt,
        sourceUrl: item.url.startsWith('http') ? item.url : `${this.baseUrl}${item.url}`,
        sourceType: 'OPENSHIFT_DOCS' as const,
        relevanceScore: item.relevance ?? Math.max(0.5, 1 - idx * 0.1),
      }));

      this.logger.debug('OpenShift docs query completed', { resultCount: sections.length });
      return { sections };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.warn('OpenShift docs source timed out', { timeout: this.timeout });
      } else {
        this.logger.warn('OpenShift docs source failed', { error: err instanceof Error ? err.message : String(err) });
      }
      return { sections: [] };
    }
  }
}
