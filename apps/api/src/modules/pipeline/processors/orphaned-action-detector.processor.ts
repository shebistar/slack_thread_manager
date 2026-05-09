import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  classifiedTopics,
  orphanedActions,
  slackThreads,
} from '@slack-thread-manager/db';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';

export interface OrphanedActionDetectionResult {
  detected: number;
  resolved: number;
  scanned: number;
}

@Injectable()
export class OrphanedActionDetectorProcessor {
  private readonly logger = new Logger(OrphanedActionDetectorProcessor.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async runDetection(): Promise<OrphanedActionDetectionResult> {
    const startTime = Date.now();
    const thresholdDays =
      this.configService.get<number>('ORPHANED_ACTION_THRESHOLD_DAYS') ?? 2;

    const summarizedStates = [
      'summarized',
      'embedded',
      'staged',
      'approved',
      'delivered',
    ];

    const threads = await this.db
      .select({
        id: slackThreads.id,
        latestReplyTs: slackThreads.latestReplyTs,
        participantIds: slackThreads.participantIds,
      })
      .from(slackThreads)
      .where(inArray(slackThreads.pipelineState, summarizedStates));

    if (threads.length === 0) {
      return { detected: 0, resolved: 0, scanned: 0 };
    }

    const threadIds = threads.map((t) => t.id);

    const topics = await this.db
      .select({
        threadId: classifiedTopics.threadId,
        technicalSummary: classifiedTopics.technicalSummary,
      })
      .from(classifiedTopics)
      .where(inArray(classifiedTopics.threadId, threadIds));

    const resolved = await this.resolveActiveThreads();

    let detected = 0;
    const now = new Date();

    for (const topic of topics) {
      try {
        const thread = threads.find((t) => t.id === topic.threadId);
        if (!thread) continue;

        const summary = topic.technicalSummary as {
          action_items?: string[];
        } | null;
        const actionItems = summary?.action_items ?? [];
        if (actionItems.length === 0) continue;

        const lastActivity = this.parseSlackTs(thread.latestReplyTs);
        if (!lastActivity) continue;

        const workdaysSinceActivity = this.countWorkdays(lastActivity, now);
        if (workdaysSinceActivity < thresholdDays) continue;

        for (const actionText of actionItems) {
          try {
            const assignedTo = this.extractAssignee(
              actionText,
              thread.participantIds ?? [],
            );
            const [row] = await this.db
              .insert(orphanedActions)
              .values({
                threadId: thread.id,
                actionText,
                assignedTo,
                status: 'orphaned',
              })
              .onConflictDoNothing({
                target: [orphanedActions.threadId, orphanedActions.actionText],
              })
              .returning();

            if (row) {
              detected++;
              continue;
            }

            const [reopened] = await this.db
              .update(orphanedActions)
              .set({
                status: 'orphaned',
                detectedAt: sql`now()`,
                resolvedAt: null,
                assignedTo,
              })
              .where(and(
                eq(orphanedActions.threadId, thread.id),
                eq(orphanedActions.actionText, actionText),
                inArray(orphanedActions.status, ['resolved', 'dismissed']),
              ))
              .returning();

            if (reopened) detected++;
          } catch (err) {
            this.logger.warn('Failed to insert orphaned action', {
              threadId: thread.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (err) {
        this.logger.warn('Error processing thread for orphaned actions', {
          threadId: topic.threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log('Orphaned action detection completed', {
      detected,
      resolved,
      scanned: threads.length,
      durationMs,
    });

    return { detected, resolved, scanned: threads.length };
  }

  private async resolveActiveThreads(): Promise<number> {
    const existingOrphaned = await this.db
      .select({
        id: orphanedActions.id,
        threadId: orphanedActions.threadId,
        detectedAt: orphanedActions.detectedAt,
      })
      .from(orphanedActions)
      .where(eq(orphanedActions.status, 'orphaned'));

    if (existingOrphaned.length === 0) return 0;

    const orphanedThreadIds = [...new Set(existingOrphaned.map((a) => a.threadId))];
    const resolveThreads = await this.db
      .select({
        id: slackThreads.id,
        latestReplyTs: slackThreads.latestReplyTs,
      })
      .from(slackThreads)
      .where(inArray(slackThreads.id, orphanedThreadIds));

    const threadMap = new Map(resolveThreads.map((t) => [t.id, t.latestReplyTs]));
    let resolved = 0;

    for (const action of existingOrphaned) {
      try {
        const latestReplyTs = threadMap.get(action.threadId);
        if (!latestReplyTs) continue;

        const lastActivity = this.parseSlackTs(latestReplyTs);
        if (!lastActivity) continue;

        if (lastActivity > action.detectedAt) {
          await this.db
            .update(orphanedActions)
            .set({ status: 'resolved', resolvedAt: sql`now()` })
            .where(eq(orphanedActions.id, action.id));
          resolved++;
        }
      } catch (err) {
        this.logger.warn('Failed to resolve orphaned action', {
          actionId: action.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return resolved;
  }

  countWorkdays(start: Date, end: Date): number {
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (endDay <= startDay) return 0;

    let count = 0;
    const current = new Date(startDay);
    current.setDate(current.getDate() + 1);

    while (current < endDay) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  parseSlackTs(ts: string | null): Date | null {
    if (!ts) return null;
    const seconds = parseFloat(ts);
    if (isNaN(seconds)) return null;
    return new Date(seconds * 1000);
  }

  extractAssignee(
    actionText: string,
    participantIds: string[],
  ): string | null {
    const mentionMatch = actionText.match(/@(\w+)/);
    if (mentionMatch) return mentionMatch[1]!;

    const assignedMatch = actionText.match(/assigned\s+to\s+(\w+)/i);
    if (assignedMatch) return assignedMatch[1]!;

    for (const participant of participantIds) {
      if (actionText.toLowerCase().includes(participant.toLowerCase())) {
        return participant;
      }
    }

    return null;
  }
}
