import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnrichmentSection } from '@slack-thread-manager/shared';
import type { EnrichmentSource, EnrichmentSourceResult, SourceQueryContext } from './enrichment-source.interface.js';

@Injectable()
export class NotebookLmSource implements EnrichmentSource {
  readonly name = 'NotebookLM';
  private readonly logger = new Logger(NotebookLmSource.name);
  private readonly baseUrl: string | undefined;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('ENRICHMENT_NOTEBOOKLM_URL');
    this.timeout = this.configService.get<number>('ENRICHMENT_SOURCE_TIMEOUT_MS') ?? 5000;
  }

  async query(_threadId: string, context: SourceQueryContext): Promise<EnrichmentSourceResult> {
    if (!this.baseUrl) {
      this.logger.debug('NotebookLM source skipped — no base URL configured');
      return { sections: [] };
    }

    const searchTerm = (context.primaryTopic ?? context.summary ?? '').trim();
    if (!searchTerm) {
      return { sections: [] };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchTerm, limit: 5 }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn('NotebookLM API returned non-OK status', { status: response.status });
        return { sections: [] };
      }

      const data = await response.json() as { results?: Array<{ title: string; snippet: string; url: string; score: number }> };

      const sections: EnrichmentSection[] = (data.results ?? [])
        .filter((item) => item.url && item.title)
        .map((item) => ({
          title: item.title,
          description: item.snippet ?? '',
          sourceUrl: item.url,
          sourceType: 'NOTEBOOKLM' as const,
          relevanceScore: Math.max(0, Math.min(1, item.score ?? 0)),
        }));

      this.logger.debug('NotebookLM query completed', { resultCount: sections.length });
      return { sections };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.warn('NotebookLM source timed out', { timeout: this.timeout });
      } else {
        this.logger.warn('NotebookLM source failed', { error: err instanceof Error ? err.message : String(err) });
      }
      return { sections: [] };
    } finally {
      clearTimeout(timer);
    }
  }
}
