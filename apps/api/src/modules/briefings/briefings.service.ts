import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, inArray, sql, gt } from 'drizzle-orm';
import {
  briefings,
  briefingItems,
  briefingItemReads,
  slackThreads,
  classifiedTopics,
  users,
  userWorkstreams,
  workstreams,
  topicCorrelations,
  orphanedActions,
  slackChannels,
  type User,
  type BriefingShapeValue,
  type BriefingItemTypeValue,
} from '@slack-thread-manager/db';
import type { Database } from '@slack-thread-manager/db';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { PipelineStateService } from '../pipeline/pipeline-state.service.js';

interface ThreadWithContext {
  threadId: string;
  threadTs: string;
  channelSlackId: string;
  headline: string;
  technicalSummary: unknown;
  plainSummary: unknown;
  workstreamName: string | null;
  workstreamId: string | null;
  itemType: BriefingItemTypeValue;
}

const ROLE_TO_SHAPE: Record<string, BriefingShapeValue> = {
  PM: 'filtered_brief',
  SALES: 'executive_scan',
  TRAINING: 'executive_scan',
  ARCHITECT: 'intelligence_report',
  CONSULTANT: 'intelligence_report',
  ADMIN: 'executive_scan',
};

const ITEM_TYPE_SORT_PRIORITY: Record<BriefingItemTypeValue, number> = {
  cross_workstream: 0,
  orphaned_action: 1,
  standard: 2,
  gone_quiet: 3,
};

@Injectable()
export class BriefingsService {
  private readonly logger = new Logger(BriefingsService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly pipelineStateService: PipelineStateService,
    private readonly configService: ConfigService,
  ) {}

  mapRoleToBriefingShape(role: string): BriefingShapeValue {
    return ROLE_TO_SHAPE[role] ?? 'executive_scan';
  }

  async generateBriefingsForAllUsers(): Promise<{
    usersProcessed: number;
    briefingsGenerated: number;
    itemsGenerated: number;
  }> {
    const startTime = Date.now();
    this.logger.log('Briefing generation started');

    const activeUsers = await this.db.select().from(users);

    if (activeUsers.length === 0) {
      this.logger.log('No active users found, skipping generation');
      return { usersProcessed: 0, briefingsGenerated: 0, itemsGenerated: 0 };
    }

    const lastGeneration = await this.getLastSuccessfulGeneration();
    const approvedThreads = await this.getApprovedThreadsSince(lastGeneration);

    if (approvedThreads.length === 0) {
      this.logger.log('No new approved content, skipping generation');
      return { usersProcessed: activeUsers.length, briefingsGenerated: 0, itemsGenerated: 0 };
    }

    let briefingsGenerated = 0;
    let itemsGenerated = 0;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const user of activeUsers) {
      try {
        const result = await this.generateBriefingForUser(user, approvedThreads, today);
        if (result) {
          briefingsGenerated++;
          itemsGenerated += result.itemCount;
        }
      } catch (error) {
        this.logger.error(`Failed to generate briefing for user ${user.id}`, {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const transitionedIds: string[] = [];
    for (const thread of approvedThreads) {
      try {
        await this.pipelineStateService.transitionState(thread.threadId, 'delivered');
        transitionedIds.push(thread.threadId);
      } catch (error) {
        this.logger.error(`Failed to transition thread ${thread.threadId} to delivered`, {
          threadId: thread.threadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const duration = Date.now() - startTime;
    this.logger.log('Briefing generation completed', {
      usersProcessed: activeUsers.length,
      briefingsGenerated,
      itemsGenerated,
      threadsTransitioned: transitionedIds.length,
      durationMs: duration,
    });

    return { usersProcessed: activeUsers.length, briefingsGenerated, itemsGenerated };
  }

  async generateBriefingForUser(
    user: User,
    approvedThreads: ThreadWithContext[],
    briefingDate: Date,
  ): Promise<{ itemCount: number } | null> {
    const existing = await this.db
      .select({ id: briefings.id })
      .from(briefings)
      .where(
        and(
          eq(briefings.userId, user.id),
          eq(briefings.briefingDate, briefingDate),
        ),
      );

    if (existing.length > 0) {
      this.logger.log(`Briefing already exists for user ${user.id} on ${briefingDate.toISOString()}`);
      return null;
    }

    const shape = this.mapRoleToBriefingShape(user.role);
    const items = await this.buildBriefingItems(approvedThreads, shape, user);

    if (items.length === 0) {
      this.logger.log(`No items for user ${user.id} with shape ${shape}`);
      return null;
    }

    const workstreamNames = new Set(items.map((i) => i.workstreamName).filter(Boolean));

    const [briefing] = await this.db
      .insert(briefings)
      .values({
        userId: user.id,
        briefingDate,
        briefingShape: shape,
        threadCount: items.length,
        workstreamCount: workstreamNames.size,
      })
      .returning();

    if (!briefing) {
      throw new Error(`Failed to insert briefing for user ${user.id}`);
    }

    await this.db.insert(briefingItems).values(
      items.map((item, idx) => ({
        briefingId: briefing.id,
        threadId: item.threadId,
        headline: item.headline,
        summaryText: item.summaryText,
        workstreamName: item.workstreamName,
        sourceThreadUrl: item.sourceThreadUrl,
        itemType: item.itemType,
        sortOrder: idx,
      })),
    );

    this.logger.log(`Generated briefing for user ${user.id}`, {
      userId: user.id,
      shape,
      itemCount: items.length,
      workstreamCount: workstreamNames.size,
    });

    return { itemCount: items.length };
  }

  async getApprovedThreadsSince(since: Date | null): Promise<ThreadWithContext[]> {
    const baseCondition = eq(slackThreads.pipelineState, 'approved');
    const whereCondition = since
      ? and(baseCondition, gt(slackThreads.updatedAt, since))
      : baseCondition;

    const rows = await this.db
      .select({
        threadId: slackThreads.id,
        threadTs: slackThreads.threadTs,
        channelSlackId: slackChannels.slackChannelId,
        primaryTopic: classifiedTopics.primaryTopic,
        technicalSummary: classifiedTopics.technicalSummary,
        plainSummary: classifiedTopics.plainSummary,
        workstreamName: workstreams.name,
        workstreamId: classifiedTopics.workstreamId,
      })
      .from(slackThreads)
      .innerJoin(classifiedTopics, eq(classifiedTopics.threadId, slackThreads.id))
      .innerJoin(slackChannels, eq(slackChannels.id, slackThreads.channelId))
      .leftJoin(workstreams, eq(workstreams.id, classifiedTopics.workstreamId))
      .where(whereCondition!);

    const threadIds = rows.map((r) => r.threadId);
    if (threadIds.length === 0) return [];

    const correlations = await this.db
      .select({ sourceThreadId: topicCorrelations.sourceThreadId })
      .from(topicCorrelations)
      .where(inArray(topicCorrelations.sourceThreadId, threadIds));
    const correlatedThreadIds = new Set(correlations.map((c) => c.sourceThreadId));

    const orphaned = await this.db
      .select({ threadId: orphanedActions.threadId })
      .from(orphanedActions)
      .where(
        and(
          inArray(orphanedActions.threadId, threadIds),
          eq(orphanedActions.status, 'orphaned'),
        ),
      );
    const orphanedThreadIds = new Set(orphaned.map((o) => o.threadId));

    return rows.map((row) => {
      let itemType: BriefingItemTypeValue = 'standard';
      if (correlatedThreadIds.has(row.threadId)) {
        itemType = 'cross_workstream';
      } else if (orphanedThreadIds.has(row.threadId)) {
        itemType = 'orphaned_action';
      }

      return {
        threadId: row.threadId,
        threadTs: row.threadTs,
        channelSlackId: row.channelSlackId,
        headline: row.primaryTopic,
        technicalSummary: row.technicalSummary,
        plainSummary: row.plainSummary,
        workstreamName: row.workstreamName,
        workstreamId: row.workstreamId,
        itemType,
      };
    });
  }

  async buildBriefingItems(
    threads: ThreadWithContext[],
    shape: BriefingShapeValue,
    user: User,
  ): Promise<Array<{
    threadId: string;
    headline: string;
    summaryText: string;
    workstreamName: string | null;
    sourceThreadUrl: string | null;
    itemType: BriefingItemTypeValue;
  }>> {
    let filteredThreads = threads;

    if (shape === 'filtered_brief') {
      const userWs = await this.db
        .select({ workstreamId: userWorkstreams.workstreamId })
        .from(userWorkstreams)
        .where(eq(userWorkstreams.userId, user.id));
      const assignedIds = new Set(userWs.map((w) => w.workstreamId));
      filteredThreads = threads.filter((t) => t.workstreamId && assignedIds.has(t.workstreamId));
    }

    const slackTeamId = this.configService.get<string>('SLACK_TEAM_ID');
    const useTechnicalSummary = shape === 'intelligence_report';

    const items = filteredThreads.map((thread) => {
      const summaryText = this.extractSummaryText(
        useTechnicalSummary ? thread.technicalSummary : thread.plainSummary,
      );

      return {
        threadId: thread.threadId,
        headline: thread.headline,
        summaryText,
        workstreamName: thread.workstreamName,
        sourceThreadUrl: this.buildSlackPermalink(slackTeamId, thread.channelSlackId, thread.threadTs),
        itemType: thread.itemType,
      };
    });

    items.sort(
      (a, b) => ITEM_TYPE_SORT_PRIORITY[a.itemType] - ITEM_TYPE_SORT_PRIORITY[b.itemType],
    );

    return items;
  }

  async getTodayBriefing(userSub: string, userEmail: string) {
    const userId = await this.resolveUserId(userSub, userEmail);
    if (!userId) return null;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [briefing] = await this.db
      .select()
      .from(briefings)
      .where(
        and(
          eq(briefings.userId, userId),
          eq(briefings.briefingDate, today),
        ),
      )
      .orderBy(sql`${briefings.generatedAt} DESC`)
      .limit(1);

    if (!briefing) return null;

    const items = await this.db
      .select({
        id: briefingItems.id,
        briefingId: briefingItems.briefingId,
        threadId: briefingItems.threadId,
        headline: briefingItems.headline,
        summaryText: briefingItems.summaryText,
        workstreamName: briefingItems.workstreamName,
        sourceThreadUrl: briefingItems.sourceThreadUrl,
        itemType: briefingItems.itemType,
        sortOrder: briefingItems.sortOrder,
        latestActivityAt: slackThreads.updatedAt,
        messageCount: slackThreads.messageCount,
        participantCount: sql<number>`coalesce(array_length(${slackThreads.participantIds}, 1), 0)`,
      })
      .from(briefingItems)
      .leftJoin(slackThreads, eq(slackThreads.id, briefingItems.threadId))
      .where(eq(briefingItems.briefingId, briefing.id))
      .orderBy(sql`${briefingItems.sortOrder} ASC`);

    const readItemIds = briefing.briefingShape === 'executive_scan'
      ? []
      : await this.getReadItemIds(userId, briefing.id);

    return { briefing, items, readItemIds };
  }

  async markItemAsRead(
    userId: string,
    briefingItemId: string,
  ): Promise<{ briefingItemId: string; readAt: Date }> {
    const [item] = await this.db
      .select({ id: briefingItems.id })
      .from(briefingItems)
      .where(eq(briefingItems.id, briefingItemId))
      .limit(1);

    if (!item) {
      throw new NotFoundException(`Briefing item ${briefingItemId} not found`);
    }

    const [existing] = await this.db
      .select({ readAt: briefingItemReads.readAt })
      .from(briefingItemReads)
      .where(
        and(
          eq(briefingItemReads.userId, userId),
          eq(briefingItemReads.briefingItemId, briefingItemId),
        ),
      )
      .limit(1);

    if (existing) {
      return { briefingItemId, readAt: existing.readAt };
    }

    const [inserted] = await this.db
      .insert(briefingItemReads)
      .values({ userId, briefingItemId })
      .returning({ readAt: briefingItemReads.readAt });

    return { briefingItemId, readAt: inserted!.readAt };
  }

  async getReadItemIds(userId: string, briefingId: string): Promise<string[]> {
    const itemIds = await this.db
      .select({ id: briefingItems.id })
      .from(briefingItems)
      .where(eq(briefingItems.briefingId, briefingId));

    if (itemIds.length === 0) return [];

    const reads = await this.db
      .select({ briefingItemId: briefingItemReads.briefingItemId })
      .from(briefingItemReads)
      .where(
        and(
          eq(briefingItemReads.userId, userId),
          inArray(
            briefingItemReads.briefingItemId,
            itemIds.map((i) => i.id),
          ),
        ),
      );

    return reads.map((r) => r.briefingItemId);
  }

  private extractSummaryText(summary: unknown): string {
    if (typeof summary === 'string') return summary;
    if (summary && typeof summary === 'object' && 'text' in summary) {
      return String((summary as { text: string }).text);
    }
    if (summary && typeof summary === 'object') {
      return JSON.stringify(summary);
    }
    return '';
  }

  private buildSlackPermalink(
    teamId: string | undefined,
    channelSlackId: string,
    threadTs: string,
  ): string | null {
    if (!teamId) return null;
    const tsForUrl = threadTs.replace('.', '');
    return `https://app.slack.com/client/${teamId}/${channelSlackId}/thread/${channelSlackId}-${tsForUrl}`;
  }

  private async getLastSuccessfulGeneration(): Promise<Date | null> {
    const [latest] = await this.db
      .select({ generatedAt: briefings.generatedAt })
      .from(briefings)
      .orderBy(sql`${briefings.generatedAt} DESC`)
      .limit(1);

    return latest?.generatedAt ?? null;
  }

  async resolveUserIdFromAuth(userSub: string, userEmail: string): Promise<string | null> {
    const [byEmail] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, userEmail))
      .limit(1);

    if (byEmail) return byEmail.id;

    const [bySub] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userSub))
      .limit(1);

    return bySub?.id ?? null;
  }

  private async resolveUserId(userSub: string, userEmail: string): Promise<string | null> {
    return this.resolveUserIdFromAuth(userSub, userEmail);
  }
}
