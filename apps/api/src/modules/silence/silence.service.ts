import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { silenceAlerts, slackThreads, classifiedTopics, workstreams } from '@slack-thread-manager/db';

const DEFAULT_SILENCE_THRESHOLD_WORKDAYS = 3;
const MIN_MESSAGE_COUNT = 3;
const MIN_PARTICIPANT_COUNT = 2;

export interface DetectionSummary {
  threadsScanned: number;
  alertsCreated: number;
  alertsResolved: number;
  durationMs: number;
}

interface SilenceCandidate {
  threadId: string;
  lastActivityAt: Date;
  messageCount: number;
  participantCount: number;
  topicName: string;
  workstreamId: string | null;
}

@Injectable()
export class SilenceService {
  private readonly logger = new Logger(SilenceService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async runDetection(): Promise<DetectionSummary> {
    const startTime = Date.now();
    const summary: DetectionSummary = {
      threadsScanned: 0,
      alertsCreated: 0,
      alertsResolved: 0,
      durationMs: 0,
    };

    this.logger.log('Silence detection started');

    try {
      const candidates = await this.findSilenceCandidates();
      summary.threadsScanned = candidates.length;

      for (const candidate of candidates) {
        try {
          const created = await this.upsertActiveAlert(candidate);
          if (created) {
            summary.alertsCreated++;
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('Failed to upsert alert for thread', { threadId: candidate.threadId, error: msg });
        }
      }

      const resolved = await this.resolveAlertsForActiveThreads();
      summary.alertsResolved = resolved;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Silence detection failed', { error: msg });
      throw error;
    }

    summary.durationMs = Date.now() - startTime;
    this.logger.log('Silence detection complete', summary);
    return summary;
  }

  async findSilenceCandidates(): Promise<SilenceCandidate[]> {
    const thresholdDate = this.getThresholdDate(DEFAULT_SILENCE_THRESHOLD_WORKDAYS);

    const rows = await this.db
      .select({
        threadId: slackThreads.id,
        latestReplyTs: slackThreads.latestReplyTs,
        threadTs: slackThreads.threadTs,
        messageCount: slackThreads.messageCount,
        participantIds: slackThreads.participantIds,
        topicName: classifiedTopics.primaryTopic,
        workstreamId: classifiedTopics.workstreamId,
      })
      .from(slackThreads)
      .innerJoin(classifiedTopics, eq(classifiedTopics.threadId, slackThreads.id))
      .where(
        sql`(${slackThreads.messageCount} >= ${MIN_MESSAGE_COUNT} OR array_length(${slackThreads.participantIds}, 1) >= ${MIN_PARTICIPANT_COUNT})`,
      );

    const candidates: SilenceCandidate[] = [];

    for (const row of rows) {
      const lastActivityAt = this.deriveLastActivityAt(row.latestReplyTs, row.threadTs);
      if (lastActivityAt > thresholdDate) {
        continue;
      }

      const silenceDays = this.countWorkdays(lastActivityAt, new Date());
      if (silenceDays < DEFAULT_SILENCE_THRESHOLD_WORKDAYS) {
        continue;
      }

      candidates.push({
        threadId: row.threadId,
        lastActivityAt,
        messageCount: row.messageCount,
        participantCount: row.participantIds.length,
        topicName: row.topicName,
        workstreamId: row.workstreamId,
      });
    }

    return candidates;
  }

  async upsertActiveAlert(candidate: SilenceCandidate): Promise<boolean> {
    const existing = await this.db
      .select({ id: silenceAlerts.id })
      .from(silenceAlerts)
      .where(
        and(
          eq(silenceAlerts.threadId, candidate.threadId),
          eq(silenceAlerts.status, 'active'),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(silenceAlerts)
        .set({
          silenceDays: candidate.messageCount > 0
            ? this.countWorkdays(candidate.lastActivityAt, new Date())
            : candidate.messageCount,
          lastActivityAt: candidate.lastActivityAt,
          updatedAt: sql`now()`,
        })
        .where(eq(silenceAlerts.id, existing[0]!.id));
      return false;
    }

    const silenceDays = this.countWorkdays(candidate.lastActivityAt, new Date());

    await this.db.insert(silenceAlerts).values({
      threadId: candidate.threadId,
      workstreamId: candidate.workstreamId,
      topicName: candidate.topicName,
      lastActivityAt: candidate.lastActivityAt,
      silenceDays,
      participantCount: candidate.participantCount,
      status: 'active',
    });

    return true;
  }

  async resolveAlertsForThreads(threadIds: string[]): Promise<number> {
    if (threadIds.length === 0) return 0;

    const result = await this.db
      .update(silenceAlerts)
      .set({
        status: 'resolved',
        updatedAt: sql`now()`,
      })
      .where(
        and(
          inArray(silenceAlerts.threadId, threadIds),
          eq(silenceAlerts.status, 'active'),
        ),
      )
      .returning({ id: silenceAlerts.id });

    if (result.length > 0) {
      this.logger.log('Resolved silence alerts for re-activated threads', { resolvedCount: result.length, threadIds });
    }

    return result.length;
  }

  private async resolveAlertsForActiveThreads(): Promise<number> {
    const thresholdDate = this.getThresholdDate(DEFAULT_SILENCE_THRESHOLD_WORKDAYS);

    const activeAlerts = await this.db
      .select({
        alertId: silenceAlerts.id,
        threadId: silenceAlerts.threadId,
      })
      .from(silenceAlerts)
      .where(eq(silenceAlerts.status, 'active'));

    if (activeAlerts.length === 0) return 0;

    const threadIds = activeAlerts.map((a) => a.threadId);

    const threads = await this.db
      .select({
        id: slackThreads.id,
        latestReplyTs: slackThreads.latestReplyTs,
        threadTs: slackThreads.threadTs,
      })
      .from(slackThreads)
      .where(inArray(slackThreads.id, threadIds));

    const threadMap = new Map(threads.map((t) => [t.id, t]));
    const toResolve: string[] = [];

    for (const alert of activeAlerts) {
      const thread = threadMap.get(alert.threadId);
      if (!thread) continue;

      const lastActivity = this.deriveLastActivityAt(thread.latestReplyTs, thread.threadTs);
      if (lastActivity > thresholdDate) {
        toResolve.push(alert.alertId);
      }
    }

    if (toResolve.length === 0) return 0;

    await this.db
      .update(silenceAlerts)
      .set({
        status: 'resolved',
        updatedAt: sql`now()`,
      })
      .where(inArray(silenceAlerts.id, toResolve));

    return toResolve.length;
  }

  deriveLastActivityAt(latestReplyTs: string | null, threadTs: string): Date {
    const ts = latestReplyTs ?? threadTs;
    const seconds = parseFloat(ts);
    return new Date(seconds * 1000);
  }

  countWorkdays(from: Date, to: Date): number {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);

    if (end <= start) return 0;

    let count = 0;
    const current = new Date(start);
    current.setDate(current.getDate() + 1);

    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  private getThresholdDate(workdays: number): Date {
    const now = new Date();
    const result = new Date(now);
    let remaining = workdays;

    while (remaining > 0) {
      result.setDate(result.getDate() - 1);
      const day = result.getDay();
      if (day !== 0 && day !== 6) {
        remaining--;
      }
    }

    result.setHours(0, 0, 0, 0);
    return result;
  }
}
