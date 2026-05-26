import type { EnrichmentSection } from '@slack-thread-manager/shared';

export interface EnrichmentSourceResult {
  sections: EnrichmentSection[];
}

export interface EnrichmentSource {
  readonly name: string;
  query(threadId: string, context: SourceQueryContext): Promise<EnrichmentSourceResult>;
}

export interface SourceQueryContext {
  primaryTopic?: string;
  summary?: string;
  workstreamName?: string;
}

export const ENRICHMENT_SOURCES = 'ENRICHMENT_SOURCES';
