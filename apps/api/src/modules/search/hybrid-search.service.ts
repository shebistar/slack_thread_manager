import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FtsResult } from './fts.service.js';
import type { VectorSearchResult } from './vector-search.service.js';

export type MatchType = 'KEYWORD' | 'SEMANTIC' | 'BOTH';

export interface HybridSearchResult {
  threadId: string;
  classifiedTopicId: string;
  combinedScore: number;
  matchType: MatchType;
  ftsScore?: number;
  semanticScore?: number;
}

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Merges FTS and semantic search results using weighted score normalization.
   *
   * Strategy (documented per AC 6):
   *   1. Normalize FTS ts_rank_cd scores to [0, 1] by dividing by the max rank in the batch.
   *   2. Semantic similarity scores are already [0, 1].
   *   3. Combined score = ftsWeight * normalizedFts + semanticWeight * normalizedSemantic.
   *   4. Threads appearing in both results are deduplicated with matchType 'BOTH'.
   *   5. Results are sorted by combined score descending.
   *
   * Default weights: SEARCH_FTS_WEIGHT=0.4, SEARCH_SEMANTIC_WEIGHT=0.6.
   */
  merge(ftsResults: FtsResult[], semanticResults: VectorSearchResult[]): HybridSearchResult[] {
    const ftsWeight = this.configService.get<number>('SEARCH_FTS_WEIGHT') ?? 0.4;
    const semanticWeight = this.configService.get<number>('SEARCH_SEMANTIC_WEIGHT') ?? 0.6;

    // Normalize FTS ranks to [0, 1] (guard against zero-max and negative ranks)
    const maxFtsRank = ftsResults.reduce((max, r) => Math.max(max, r.rank), 0);

    const ftsMap = new Map<string, { normalizedRank: number; classifiedTopicId: string }>();
    for (const r of ftsResults) {
      ftsMap.set(r.threadId, {
        normalizedRank: maxFtsRank > 0 ? r.rank / maxFtsRank : 0,
        classifiedTopicId: r.classifiedTopicId,
      });
    }

    const semanticMap = new Map<string, { similarity: number; classifiedTopicId: string }>();
    for (const r of semanticResults) {
      semanticMap.set(r.threadId, {
        similarity: r.similarity,
        classifiedTopicId: r.classifiedTopicId,
      });
    }

    const allThreadIds = new Set([...ftsMap.keys(), ...semanticMap.keys()]);
    const results: HybridSearchResult[] = [];

    for (const threadId of allThreadIds) {
      const ftsEntry = ftsMap.get(threadId);
      const semanticEntry = semanticMap.get(threadId);

      const normalizedFts = ftsEntry?.normalizedRank ?? 0;
      const normalizedSemantic = semanticEntry?.similarity ?? 0;
      const combinedScore = ftsWeight * normalizedFts + semanticWeight * normalizedSemantic;

      const classifiedTopicId = (ftsEntry?.classifiedTopicId ?? semanticEntry?.classifiedTopicId)!;

      let matchType: MatchType;
      if (ftsEntry && semanticEntry) {
        matchType = 'BOTH';
      } else if (ftsEntry) {
        matchType = 'KEYWORD';
      } else {
        matchType = 'SEMANTIC';
      }

      results.push({
        threadId,
        classifiedTopicId,
        combinedScore,
        matchType,
        ...(ftsEntry !== undefined ? { ftsScore: normalizedFts } : {}),
        ...(semanticEntry !== undefined ? { semanticScore: normalizedSemantic } : {}),
      });
    }

    results.sort((a, b) => b.combinedScore - a.combinedScore);

    this.logger.debug('HybridSearchService: merge completed', {
      ftsCount: ftsResults.length,
      semanticCount: semanticResults.length,
      mergedCount: results.length,
      bothCount: results.filter((r) => r.matchType === 'BOTH').length,
    });

    return results;
  }
}
