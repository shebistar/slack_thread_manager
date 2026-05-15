import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import {
  silenceAlerts,
  silenceThresholds,
  slackThreads,
  classifiedTopics,
  workstreams,
} from '@slack-thread-manager/db';
import type {
  SilenceThresholdListResponse,
  SilenceThresholdResponse,
} from '@slack-thread-manager/shared';

const DEFAULT_SILENCE_THRESHOLD_WORKDAYS = 3;
const MAX_THRESHOLD_DAYS = 30;
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
  private readonly projectTimezone: string;
  private readonly zonedDateFormatter: Intl.DateTimeFormat;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly configService: ConfigService,
  ) {
    this.projectTimezone = this.configService.get<string>('PROJECT_TIMEZONE', 'Europe/Berlin');
    this.zonedDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.projectTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  async getThresholdConfiguration(): Promise<SilenceThresholdListResponse> {
    await this.ensureGlobalThresholdExists();

    const rows = await this.db
      .select({
        id: silenceThresholds.id,
        workstreamId: silenceThresholds.workstreamId,
        thresholdDays: silenceThresholds.thresholdDays,
        updatedAt: silenceThresholds.updatedAt,
        workstreamName: workstreams.name,
      })
      .from(silenceThresholds)
      .leftJoin(workstreams, eq(workstreams.id, silenceThresholds.workstreamId))
      .orderBy(workstreams.name);

    const global = rows.find((row) => row.workstreamId === null);
    if (!global) {
      throw new Error('Global threshold row is missing after bootstrap');
    }

    return {
      global: this.toThresholdResponse(global),
      overrides: rows
        .filter((row) => row.workstreamId !== null)
        .map((row) => this.toThresholdResponse(row)),
    };
  }

  async updateGlobalThreshold(thresholdDays: number): Promise<SilenceThresholdResponse> {
    await this.ensureGlobalThresholdExists();

    const [updated] = await this.db
      .update(silenceThresholds)
      .set({
        thresholdDays,
        updatedAt: sql`now()`,
      })
      .where(isNull(silenceThresholds.workstreamId))
      .returning({
        id: silenceThresholds.id,
        workstreamId: silenceThresholds.workstreamId,
        thresholdDays: silenceThresholds.thresholdDays,
        updatedAt: silenceThresholds.updatedAt,
      });

    if (!updated) {
      throw new Error('Failed to update global threshold');
    }

    return this.toThresholdResponse(updated);
  }

  async upsertWorkstreamThreshold(
    workstreamId: string,
    thresholdDays: number,
  ): Promise<SilenceThresholdResponse> {
    const [workstream] = await this.db
      .select({
        id: workstreams.id,
        name: workstreams.name,
      })
      .from(workstreams)
      .where(eq(workstreams.id, workstreamId));

    if (!workstream) {
      throw new NotFoundException(`Workstream ${workstreamId} not found`);
    }

    const [updated] = await this.db
      .update(silenceThresholds)
      .set({
        thresholdDays,
        updatedAt: sql`now()`,
      })
      .where(eq(silenceThresholds.workstreamId, workstreamId))
      .returning({
        id: silenceThresholds.id,
        workstreamId: silenceThresholds.workstreamId,
        thresholdDays: silenceThresholds.thresholdDays,
        updatedAt: silenceThresholds.updatedAt,
      });

    if (updated) {
      return this.toThresholdResponse({
        ...updated,
        workstreamName: workstream.name,
      });
    }

    let inserted:
      | {
          id: string;
          workstreamId: string | null;
          thresholdDays: number;
          updatedAt: Date;
        }
      | undefined;
    try {
      [inserted] = await this.db
        .insert(silenceThresholds)
        .values({
          workstreamId,
          thresholdDays,
        })
        .returning({
          id: silenceThresholds.id,
          workstreamId: silenceThresholds.workstreamId,
          thresholdDays: silenceThresholds.thresholdDays,
          updatedAt: silenceThresholds.updatedAt,
        });
    } catch (error: unknown) {
      const errorCode = (error as { code?: string })?.code;
      if (errorCode !== '23505') {
        throw error;
      }
      // Another request inserted concurrently; retry update for deterministic behavior.
      const [concurrentUpdated] = await this.db
        .update(silenceThresholds)
        .set({
          thresholdDays,
          updatedAt: sql`now()`,
        })
        .where(eq(silenceThresholds.workstreamId, workstreamId))
        .returning({
          id: silenceThresholds.id,
          workstreamId: silenceThresholds.workstreamId,
          thresholdDays: silenceThresholds.thresholdDays,
          updatedAt: silenceThresholds.updatedAt,
        });
      if (!concurrentUpdated) {
        throw new Error(`Failed to upsert threshold for workstream ${workstreamId}`);
      }
      return this.toThresholdResponse({
        ...concurrentUpdated,
        workstreamName: workstream.name,
      });
    }

    if (!inserted) {
      throw new Error(`Failed to upsert threshold for workstream ${workstreamId}`);
    }

    return this.toThresholdResponse({
      ...inserted,
      workstreamName: workstream.name,
    });
  }

  async removeWorkstreamThreshold(workstreamId: string): Promise<void> {
    await this.db
      .delete(silenceThresholds)
      .where(eq(silenceThresholds.workstreamId, workstreamId));
  }

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
      await this.ensureGlobalThresholdExists();
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
    const now = new Date();
    const thresholdCache = new Map<string, number>();

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
      if (!lastActivityAt) {
        this.logger.warn('Skipping silence candidate with invalid timestamp', {
          threadId: row.threadId,
          latestReplyTs: row.latestReplyTs,
          threadTs: row.threadTs,
        });
        continue;
      }
      const silenceDays = this.countWorkdays(lastActivityAt, now);
      const thresholdDays = await this.resolveThresholdDays(row.workstreamId, thresholdCache);
      if (silenceDays < thresholdDays) {
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
    const now = new Date();
    const silenceDays = this.countWorkdays(candidate.lastActivityAt, now);

    const [inserted] = await this.db
      .insert(silenceAlerts)
      .values({
        threadId: candidate.threadId,
        workstreamId: candidate.workstreamId,
        topicName: candidate.topicName,
        lastActivityAt: candidate.lastActivityAt,
        silenceDays,
        participantCount: candidate.participantCount,
        status: 'active',
      })
      .onConflictDoNothing()
      .returning({ id: silenceAlerts.id });

    if (inserted) {
      return true;
    }

    const [updated] = await this.db
      .update(silenceAlerts)
      .set({
        silenceDays,
        lastActivityAt: candidate.lastActivityAt,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(silenceAlerts.threadId, candidate.threadId),
          eq(silenceAlerts.status, 'active'),
        ),
      )
      .returning({ id: silenceAlerts.id });

    if (!updated) {
      this.logger.warn('Alert update missed; likely resolved concurrently', { threadId: candidate.threadId });
    }
    return false;
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
    const activeAlerts = await this.db
      .select({
        alertId: silenceAlerts.id,
        threadId: silenceAlerts.threadId,
        lastActivityAt: silenceAlerts.lastActivityAt,
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
      if (!thread) {
        toResolve.push(alert.alertId);
        continue;
      }

      const lastActivity = this.deriveLastActivityAt(thread.latestReplyTs, thread.threadTs);
      if (!lastActivity) {
        this.logger.warn('Unable to resolve alert due to invalid thread timestamp', {
          alertId: alert.alertId,
          threadId: alert.threadId,
        });
        continue;
      }
      // Keep existing alerts non-retroactive to threshold reconfiguration:
      // resolve only when thread activity has progressed since the alert snapshot.
      if (lastActivity > alert.lastActivityAt) {
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

  deriveLastActivityAt(latestReplyTs: string | null, threadTs: string): Date | null {
    const latestReplyDate = this.parseSlackTimestamp(latestReplyTs);
    if (latestReplyDate) {
      return latestReplyDate;
    }

    return this.parseSlackTimestamp(threadTs);
  }

  countWorkdays(from: Date, to: Date): number {
    const start = this.startOfZonedDay(from);
    const end = this.startOfZonedDay(to);

    if (end <= start) return 0;

    let count = 0;
    const current = new Date(start);
    current.setUTCDate(current.getUTCDate() + 1);

    while (current <= end) {
      const day = current.getUTCDay();
      if (day !== 0 && day !== 6) {
        count++;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return count;
  }

  private async resolveThresholdDays(
    workstreamId: string | null,
    cache = new Map<string, number>(),
  ): Promise<number> {
    const cacheKey = workstreamId ?? '__global__';
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (workstreamId) {
      const workstreamThreshold = await this.db.query.silenceThresholds.findFirst({
        where: eq(silenceThresholds.workstreamId, workstreamId),
        columns: { thresholdDays: true },
      });
      if (workstreamThreshold) {
        const resolved = this.normalizeThresholdDays(workstreamThreshold.thresholdDays, workstreamId);
        cache.set(cacheKey, resolved);
        return resolved;
      }
    }

    const globalThreshold = await this.db.query.silenceThresholds.findFirst({
      where: isNull(silenceThresholds.workstreamId),
      columns: { thresholdDays: true },
    });
    if (globalThreshold) {
      const resolved = this.normalizeThresholdDays(globalThreshold.thresholdDays, workstreamId);
      cache.set(cacheKey, resolved);
      return resolved;
    }

    this.logger.warn('No silence threshold found; using fallback default', {
      fallbackThresholdDays: DEFAULT_SILENCE_THRESHOLD_WORKDAYS,
      workstreamId,
    });
    cache.set(cacheKey, DEFAULT_SILENCE_THRESHOLD_WORKDAYS);
    return DEFAULT_SILENCE_THRESHOLD_WORKDAYS;
  }

  private async ensureGlobalThresholdExists(): Promise<void> {
    const existing = await this.db.query.silenceThresholds.findFirst({
      where: isNull(silenceThresholds.workstreamId),
      columns: { id: true },
    });
    if (existing) {
      return;
    }

    try {
      await this.db.insert(silenceThresholds).values({
        workstreamId: null,
        thresholdDays: DEFAULT_SILENCE_THRESHOLD_WORKDAYS,
      });
      this.logger.log('Created default global silence threshold', {
        thresholdDays: DEFAULT_SILENCE_THRESHOLD_WORKDAYS,
      });
    } catch (error: unknown) {
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === '23505') {
        this.logger.warn('Global silence threshold bootstrap skipped due to concurrent insert');
        return;
      }
      throw error;
    }
  }

  private parseSlackTimestamp(value: string | null): Date | null {
    if (!value || !value.trim()) {
      return null;
    }

    const seconds = Number.parseFloat(value);
    if (!Number.isFinite(seconds)) {
      return null;
    }

    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  private startOfZonedDay(date: Date): Date {
    const { year, month, day } = this.getZonedDateParts(date);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private getZonedDateParts(date: Date): { year: number; month: number; day: number } {
    const parts = this.zonedDateFormatter.formatToParts(date);
    const yearPart = parts.find((part) => part.type === 'year')?.value;
    const monthPart = parts.find((part) => part.type === 'month')?.value;
    const dayPart = parts.find((part) => part.type === 'day')?.value;

    if (!yearPart || !monthPart || !dayPart) {
      throw new Error('Unable to derive timezone-aware date parts');
    }

    return {
      year: Number.parseInt(yearPart, 10),
      month: Number.parseInt(monthPart, 10),
      day: Number.parseInt(dayPart, 10),
    };
  }

  private normalizeThresholdDays(value: number, workstreamId: string | null): number {
    if (value < 1 || value > MAX_THRESHOLD_DAYS) {
      this.logger.warn('Threshold outside expected range; using fallback default', {
        thresholdDays: value,
        workstreamId,
      });
      return DEFAULT_SILENCE_THRESHOLD_WORKDAYS;
    }
    return value;
  }

  private toThresholdResponse(row: {
    id: string;
    workstreamId: string | null;
    thresholdDays: number;
    updatedAt: Date;
    workstreamName?: string | null;
  }): SilenceThresholdResponse {
    return {
      id: row.id,
      workstreamId: row.workstreamId,
      workstreamName: row.workstreamName ?? null,
      thresholdDays: row.thresholdDays,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
