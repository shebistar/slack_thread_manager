import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, sql, count } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import {
  stagingQueue,
  slackThreads,
  classifiedTopics,
  workstreams,
  type PipelineStateValue,
} from '@slack-thread-manager/db';
import type {
  StagingQueueFilter,
  StagingQueueList,
  StagingQueueItem,
  BatchSummary,
  ApproveAllCleanResponse,
} from '@slack-thread-manager/shared';
import { FtsService } from '../../search/fts.service.js';

@Injectable()
export class StagingService {
  private readonly logger = new Logger(StagingService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly ftsService: FtsService,
  ) {}

  async listPending(filters: StagingQueueFilter): Promise<StagingQueueList> {
    const conditions = [eq(stagingQueue.status, 'pending')];

    if (filters.batchId) {
      conditions.push(eq(stagingQueue.batchId, filters.batchId));
    }

    const rows = await this.db
      .select({
        id: stagingQueue.id,
        threadId: stagingQueue.threadId,
        batchId: stagingQueue.batchId,
        status: stagingQueue.status,
        createdAt: stagingQueue.createdAt,
        reviewedAt: stagingQueue.reviewedAt,
        reviewedBy: stagingQueue.reviewedBy,
        flags: stagingQueue.flags,
        originalContent: stagingQueue.originalContent,
        anonymizedContent: stagingQueue.anonymizedContent,
        workstreamId: classifiedTopics.workstreamId,
        workstreamName: workstreams.name,
      })
      .from(stagingQueue)
      .innerJoin(slackThreads, eq(stagingQueue.threadId, slackThreads.id))
      .leftJoin(classifiedTopics, eq(classifiedTopics.threadId, slackThreads.id))
      .leftJoin(workstreams, eq(workstreams.id, classifiedTopics.workstreamId))
      .where(and(...conditions));

    let items: StagingQueueItem[] = rows.map((r) => ({
      id: r.id,
      threadId: r.threadId,
      batchId: r.batchId,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewedBy: r.reviewedBy,
      workstream: r.workstreamId
        ? { id: r.workstreamId, name: r.workstreamName! }
        : null,
      flags: r.flags as StagingQueueItem['flags'],
      originalContent: r.originalContent as StagingQueueItem['originalContent'],
      anonymizedContent: r.anonymizedContent as StagingQueueItem['anonymizedContent'],
    }));

    if (filters.workstreamId) {
      items = items.filter((i) => i.workstream?.id === filters.workstreamId);
    }

    if (filters.view === 'flagged') {
      items = items.filter((i) => i.flags.length > 0);
    }

    const counts = await this.getQueueCounts();
    const batchSummary = await this.buildBatchSummary();

    return { items, counts, batchSummary };
  }

  async getQueueCounts(): Promise<StagingQueueList['counts']> {
    const statusCounts = await this.db
      .select({
        status: stagingQueue.status,
        cnt: count(),
      })
      .from(stagingQueue)
      .groupBy(stagingQueue.status);

    const flaggedResult = await this.db
      .select({ cnt: count() })
      .from(stagingQueue)
      .where(
        and(
          eq(stagingQueue.status, 'pending'),
          sql`jsonb_array_length(${stagingQueue.flags}::jsonb) > 0`,
        ),
      );

    let total = 0;
    let pending = 0;
    let approved = 0;
    let rejected = 0;

    for (const row of statusCounts) {
      total += row.cnt;
      if (row.status === 'pending') pending = row.cnt;
      if (row.status === 'approved') approved = row.cnt;
      if (row.status === 'rejected') rejected = row.cnt;
    }

    return {
      total,
      pending,
      approved,
      rejected,
      flagged: flaggedResult[0]?.cnt ?? 0,
    };
  }

  async reviewItem(
    stagingId: string,
    action: 'approve' | 'reject',
    reviewerId: string,
  ): Promise<{ batchComplete: boolean; remainingPending: number }> {
    return this.db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(stagingQueue)
        .where(eq(stagingQueue.id, stagingId));

      if (!item) {
        throw new NotFoundException(`Staging item ${stagingId} not found`);
      }

      if (item.status !== 'pending') {
        throw new NotFoundException(
          `Staging item ${stagingId} already reviewed (status: ${item.status})`,
        );
      }

      await tx
        .update(stagingQueue)
        .set({
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewedBy: reviewerId,
          reviewedAt: sql`now()`,
        })
        .where(eq(stagingQueue.id, stagingId));

      if (action === 'approve') {
        const approvedThreads = await tx
          .update(slackThreads)
          .set({
            pipelineState: 'approved' as PipelineStateValue,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(slackThreads.id, item.threadId),
              eq(slackThreads.pipelineState, 'staged'),
            ),
          )
          .returning({ id: slackThreads.id });

        if (approvedThreads.length > 0) {
          const anonymizedContent = item.anonymizedContent as StagingQueueItem['anonymizedContent'];
          await this.ftsService.refreshSearchVector(tx, item.threadId, anonymizedContent);
        } else {
          this.logger.warn('Skipping FTS refresh because thread was not in staged state', {
            stagingId,
            threadId: item.threadId,
          });
        }
      }

      const remainingPending = await this.countPendingInBatch(tx, item.batchId);
      const batchComplete = remainingPending === 0 && item.batchId !== null;

      this.logger.log('Staging item reviewed', {
        stagingId,
        action,
        reviewerId,
        batchId: item.batchId,
        batchComplete,
      });

      return { batchComplete, remainingPending };
    });
  }

  async approveAllClean(
    filters: { batchId?: string; workstreamId?: string },
    reviewerId: string,
  ): Promise<ApproveAllCleanResponse> {
    const conditions = [
      eq(stagingQueue.status, 'pending'),
      sql`jsonb_array_length(${stagingQueue.flags}::jsonb) = 0`,
    ];

    if (filters.batchId) {
      conditions.push(eq(stagingQueue.batchId, filters.batchId));
    }

    const cleanItems = await this.db
      .select({
        id: stagingQueue.id,
        threadId: stagingQueue.threadId,
        batchId: stagingQueue.batchId,
        anonymizedContent: stagingQueue.anonymizedContent,
      })
      .from(stagingQueue)
      .where(and(...conditions));

    let filteredItems = cleanItems;
    if (filters.workstreamId) {
      const threadIdsInWorkstream = await this.db
        .select({ threadId: classifiedTopics.threadId })
        .from(classifiedTopics)
        .where(eq(classifiedTopics.workstreamId, filters.workstreamId));

      const wsThreadIds = new Set(threadIdsInWorkstream.map((r) => r.threadId));
      filteredItems = cleanItems.filter((i) => wsThreadIds.has(i.threadId));
    }

    let approvedCount = 0;
    for (const item of filteredItems) {
      try {
        await this.db.transaction(async (tx) => {
          await tx
            .update(stagingQueue)
            .set({
              status: 'approved',
              reviewedBy: reviewerId,
              reviewedAt: sql`now()`,
            })
            .where(
              and(
                eq(stagingQueue.id, item.id),
                eq(stagingQueue.status, 'pending'),
              ),
            );

          const approvedThreads = await tx
            .update(slackThreads)
            .set({
              pipelineState: 'approved' as PipelineStateValue,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(slackThreads.id, item.threadId),
                eq(slackThreads.pipelineState, 'staged'),
              ),
            )
            .returning({ id: slackThreads.id });

          if (approvedThreads.length > 0) {
            const anonymizedContent = item.anonymizedContent as StagingQueueItem['anonymizedContent'];
            await this.ftsService.refreshSearchVector(tx, item.threadId, anonymizedContent);
          } else {
            this.logger.warn('Skipping bulk FTS refresh because thread was not in staged state', {
              stagingId: item.id,
              threadId: item.threadId,
            });
          }
        });
        approvedCount++;
      } catch (err) {
        this.logger.warn('Failed to bulk-approve item', {
          stagingId: item.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const [pendingResult] = await this.db
      .select({ cnt: count() })
      .from(stagingQueue)
      .where(eq(stagingQueue.status, 'pending'));

    const remainingPending = pendingResult?.cnt ?? 0;
    const batchComplete = remainingPending === 0;

    this.logger.log('Approve all clean completed', {
      approvedCount,
      remainingPending,
      batchComplete,
      reviewerId,
    });

    return { approvedCount, remainingPending, batchComplete };
  }

  async getBatchProgress(batchId: string): Promise<BatchSummary> {
    const rows = await this.db
      .select({
        status: stagingQueue.status,
        cnt: count(),
        createdAt: sql<Date>`min(${stagingQueue.createdAt})`,
      })
      .from(stagingQueue)
      .where(eq(stagingQueue.batchId, batchId))
      .groupBy(stagingQueue.status);

    let total = 0;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let createdAt = new Date();

    for (const row of rows) {
      total += row.cnt;
      if (row.status === 'pending') pending = row.cnt;
      if (row.status === 'approved') approved = row.cnt;
      if (row.status === 'rejected') rejected = row.cnt;
      if (row.createdAt && row.createdAt < createdAt) {
        createdAt = row.createdAt;
      }
    }

    return {
      batchId,
      total,
      pending,
      approved,
      rejected,
      createdAt: createdAt.toISOString(),
    };
  }

  private async buildBatchSummary(): Promise<BatchSummary[]> {
    const batches = await this.db
      .select({
        batchId: stagingQueue.batchId,
        status: stagingQueue.status,
        cnt: count(),
        minCreatedAt: sql<Date>`min(${stagingQueue.createdAt})`,
      })
      .from(stagingQueue)
      .where(sql`${stagingQueue.batchId} IS NOT NULL`)
      .groupBy(stagingQueue.batchId, stagingQueue.status);

    const batchMap = new Map<string, BatchSummary>();

    for (const row of batches) {
      if (!row.batchId) continue;

      if (!batchMap.has(row.batchId)) {
        batchMap.set(row.batchId, {
          batchId: row.batchId,
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          createdAt: row.minCreatedAt.toISOString(),
        });
      }

      const summary = batchMap.get(row.batchId)!;
      summary.total += row.cnt;
      if (row.status === 'pending') summary.pending = row.cnt;
      if (row.status === 'approved') summary.approved = row.cnt;
      if (row.status === 'rejected') summary.rejected = row.cnt;

      if (row.minCreatedAt.toISOString() < summary.createdAt) {
        summary.createdAt = row.minCreatedAt.toISOString();
      }
    }

    return Array.from(batchMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private async countPendingInBatch(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    batchId: string | null,
  ): Promise<number> {
    if (!batchId) return -1;

    const [result] = await tx
      .select({ cnt: count() })
      .from(stagingQueue)
      .where(
        and(
          eq(stagingQueue.batchId, batchId),
          eq(stagingQueue.status, 'pending'),
        ),
      );

    return result?.cnt ?? 0;
  }
}
