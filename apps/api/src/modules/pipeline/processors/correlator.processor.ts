import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  classifiedTopics,
  slackThreads,
  topicCorrelations,
  type CorrelationTypeValue,
} from '@slack-thread-manager/db';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';

export interface CorrelationRunResult {
  created: number;
  updated: number;
  pairsEvaluated: number;
}

interface CorrelationEntry {
  sourceThreadId: string;
  correlatedThreadId: string;
  type: CorrelationTypeValue;
  confidence: number;
}

interface EmbeddedRow {
  threadId: string;
  channelId: string;
  participantIds: string[];
}

@Injectable()
export class CorrelatorProcessor {
  private readonly logger = new Logger(CorrelatorProcessor.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async runBatchCorrelation(): Promise<CorrelationRunResult> {
    const embeddedRows = await this.db
      .select({
        threadId: slackThreads.id,
        channelId: slackThreads.channelId,
        participantIds: slackThreads.participantIds,
      })
      .from(slackThreads)
      .where(eq(slackThreads.pipelineState, 'embedded'));

    if (embeddedRows.length < 2) {
      this.logger.log('Fewer than 2 embedded threads — skipping correlation');
      return { created: 0, updated: 0, pairsEvaluated: 0 };
    }

    const threshold =
      this.configService.get<number>('CORRELATION_SIMILARITY_THRESHOLD') ?? 0.7;
    const threadIds = embeddedRows.map((r) => r.threadId);

    const semanticPairs = await this.findSemanticCorrelations(threadIds, threshold);
    const topicMatchPairs = await this.findTopicMatchCorrelations(threadIds, embeddedRows);
    const participantPairs = this.findParticipantOverlapCorrelations(embeddedRows);

    const allPairs = this.mergePairs(semanticPairs, topicMatchPairs, participantPairs);

    let created = 0;
    let updated = 0;
    const startMs = Date.now();

    for (const pair of allPairs) {
      if (pair.sourceThreadId === pair.correlatedThreadId) continue;
      try {
        const forwardResult = await this.upsertCorrelation(
          pair.sourceThreadId,
          pair.correlatedThreadId,
          pair.type,
          pair.confidence,
        );
        const reverseResult = await this.upsertCorrelation(
          pair.correlatedThreadId,
          pair.sourceThreadId,
          pair.type,
          pair.confidence,
        );
        if (forwardResult === 'created') created++;
        else updated++;
        if (reverseResult === 'created') created++;
        else updated++;
      } catch (error) {
        this.logger.error(`Failed to upsert correlation pair ${pair.sourceThreadId} <-> ${pair.correlatedThreadId}`, error instanceof Error ? error.stack : String(error));
      }
    }

    const durationMs = Date.now() - startMs;

    this.logger.log('Correlation batch completed', {
      pairsEvaluated: allPairs.length,
      created,
      updated,
      durationMs,
    });

    return { created, updated, pairsEvaluated: allPairs.length };
  }

  private async findSemanticCorrelations(
    threadIds: string[],
    threshold: number,
  ): Promise<Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }>> {
    if (threadIds.length < 2) return [];

    const rows = await this.db.execute<{
      source_thread_id: string;
      correlated_thread_id: string;
      cosine_similarity: number;
    }>(sql`
      SELECT
        te1.thread_id AS source_thread_id,
        te2.thread_id AS correlated_thread_id,
        (1 - (te1.embedding <=> te2.embedding))::float AS cosine_similarity
      FROM thread_embeddings te1
      JOIN thread_embeddings te2
        ON te1.thread_id < te2.thread_id
      JOIN slack_threads st1 ON te1.thread_id = st1.id
      JOIN slack_threads st2 ON te2.thread_id = st2.id
      WHERE st1.channel_id != st2.channel_id
        AND te1.thread_id = ANY(${threadIds}::uuid[])
        AND te2.thread_id = ANY(${threadIds}::uuid[])
        AND (1 - (te1.embedding <=> te2.embedding)) >= ${threshold}
    `);

    return rows.rows.map((r) => ({
      sourceThreadId: r.source_thread_id,
      correlatedThreadId: r.correlated_thread_id,
      confidence: r.cosine_similarity,
    }));
  }

  private async findTopicMatchCorrelations(
    threadIds: string[],
    embeddedRows: EmbeddedRow[],
  ): Promise<Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }>> {
    const topics = await this.db
      .select({
        threadId: classifiedTopics.threadId,
        primaryTopic: classifiedTopics.primaryTopic,
      })
      .from(classifiedTopics)
      .where(inArray(classifiedTopics.threadId, threadIds));

    const channelMap = new Map(embeddedRows.map((r) => [r.threadId, r.channelId]));
    const results: Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }> = [];

    const topicGroups = new Map<string, string[]>();
    for (const t of topics) {
      if (!t.primaryTopic) continue;
      const group = topicGroups.get(t.primaryTopic) ?? [];
      group.push(t.threadId);
      topicGroups.set(t.primaryTopic, group);
    }

    for (const [, idsInTopic] of topicGroups) {
      for (let i = 0; i < idsInTopic.length; i++) {
        for (let j = i + 1; j < idsInTopic.length; j++) {
          const a = idsInTopic[i]!;
          const b = idsInTopic[j]!;
          if (channelMap.get(a) !== channelMap.get(b)) {
            results.push({ sourceThreadId: a, correlatedThreadId: b, confidence: 1.0 });
          }
        }
      }
    }

    return results;
  }

  private findParticipantOverlapCorrelations(
    rows: EmbeddedRow[],
  ): Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }> {
    const results: Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }> = [];

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i]!;
        const b = rows[j]!;
        if (a.channelId === b.channelId) continue;

        const aSet = new Set(a.participantIds ?? []);
        const bSet = new Set(b.participantIds ?? []);
        if (aSet.size === 0 || bSet.size === 0) continue;

        const intersection = [...aSet].filter((p) => bSet.has(p));
        if (intersection.length === 0) continue;

        const union = new Set([...aSet, ...bSet]);
        const jaccard = intersection.length / union.size;
        results.push({ sourceThreadId: a.threadId, correlatedThreadId: b.threadId, confidence: jaccard });
      }
    }

    return results;
  }

  private mergePairs(
    semanticPairs: Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }>,
    topicMatchPairs: Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }>,
    participantPairs: Array<{ sourceThreadId: string; correlatedThreadId: string; confidence: number }>,
  ): CorrelationEntry[] {
    const priority: CorrelationTypeValue[] = ['semantic', 'topic_match', 'participant_overlap'];
    const pairLists = [semanticPairs, topicMatchPairs, participantPairs];
    const map = new Map<string, CorrelationEntry>();

    pairLists.forEach((pairs, idx) => {
      const type = priority[idx]!;
      for (const pair of pairs) {
        const [a, b] = [pair.sourceThreadId, pair.correlatedThreadId].sort();
        const key = `${a}:${b}`;
        if (!map.has(key)) {
          map.set(key, {
            sourceThreadId: pair.sourceThreadId,
            correlatedThreadId: pair.correlatedThreadId,
            type,
            confidence: pair.confidence,
          });
        }
      }
    });

    return [...map.values()];
  }

  private async upsertCorrelation(
    sourceThreadId: string,
    correlatedThreadId: string,
    correlationType: CorrelationTypeValue,
    confidence: number,
  ): Promise<'created' | 'updated'> {
    const existing = await this.db
      .select({ id: topicCorrelations.id })
      .from(topicCorrelations)
      .where(
        and(
          eq(topicCorrelations.sourceThreadId, sourceThreadId),
          eq(topicCorrelations.correlatedThreadId, correlatedThreadId),
        ),
      );

    await this.db
      .insert(topicCorrelations)
      .values({ sourceThreadId, correlatedThreadId, correlationType, confidence })
      .onConflictDoUpdate({
        target: [topicCorrelations.sourceThreadId, topicCorrelations.correlatedThreadId],
        set: { correlationType, confidence },
      });

    return existing.length === 0 ? 'created' : 'updated';
  }
}
