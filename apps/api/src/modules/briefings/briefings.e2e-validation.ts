/**
 * E2E Validation Script for Story 5.1: Briefing Generation Service
 *
 * Validates the briefing generation pipeline against real PostgreSQL.
 * Run: pnpm --filter @slack-thread-manager/api exec dotenv -e ../../.env -- tsx src/modules/briefings/briefings.e2e-validation.ts
 */

import { createDb } from '@slack-thread-manager/db';
import {
  users,
  workstreams,
  userWorkstreams,
  slackChannels,
  slackThreads,
  classifiedTopics,
  briefings,
  briefingItems,
  topicCorrelations,
  orphanedActions,
} from '@slack-thread-manager/db';
import { eq, and, inArray, sql } from 'drizzle-orm';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const db = createDb(DATABASE_URL);

const TEST_PREFIX = 'e2e-5-1-';

async function cleanup() {
  const testUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.email} LIKE ${TEST_PREFIX + '%'}`);

  const userIds = testUsers.map((u) => u.id);

  for (const uid of userIds) {
    const userBriefings = await db.select({ id: briefings.id }).from(briefings).where(eq(briefings.userId, uid));
    for (const b of userBriefings) {
      await db.delete(briefingItems).where(eq(briefingItems.briefingId, b.id));
    }
    await db.delete(briefings).where(eq(briefings.userId, uid));
    await db.delete(userWorkstreams).where(eq(userWorkstreams.userId, uid));
  }

  const testChannels = await db
    .select({ id: slackChannels.id })
    .from(slackChannels)
    .where(sql`${slackChannels.name} LIKE ${TEST_PREFIX + '%'}`);

  const channelIds = testChannels.map((c) => c.id);

  if (channelIds.length > 0) {
    const testThreads = await db
      .select({ id: slackThreads.id })
      .from(slackThreads)
      .where(inArray(slackThreads.channelId, channelIds));

    const threadIds = testThreads.map((t) => t.id);

    for (const tid of threadIds) {
      await db.delete(briefingItems).where(eq(briefingItems.threadId, tid));
      await db.delete(orphanedActions).where(eq(orphanedActions.threadId, tid));
      await db.delete(topicCorrelations).where(eq(topicCorrelations.sourceThreadId, tid));
      await db.delete(classifiedTopics).where(eq(classifiedTopics.threadId, tid));
      await db.delete(slackThreads).where(eq(slackThreads.id, tid));
    }

    await db.delete(slackChannels).where(inArray(slackChannels.id, channelIds));
  }

  const testWs = await db
    .select({ id: workstreams.id })
    .from(workstreams)
    .where(sql`${workstreams.name} LIKE ${TEST_PREFIX + '%'}`);

  if (testWs.length > 0) {
    await db.delete(workstreams).where(inArray(workstreams.id, testWs.map((w) => w.id)));
  }

  for (const uid of userIds) {
    await db.delete(users).where(eq(users.id, uid));
  }
}

async function setupTestData() {
  const [ws1] = await db.insert(workstreams).values({ name: `${TEST_PREFIX}engineering` }).returning();
  const [ws2] = await db.insert(workstreams).values({ name: `${TEST_PREFIX}sales-ops` }).returning();

  const [pmUser] = await db.insert(users).values({
    email: `${TEST_PREFIX}pm@test.com`,
    displayName: 'Test PM',
    slackHandle: `${TEST_PREFIX}pm`,
    role: 'PM',
  }).returning();

  const [archUser] = await db.insert(users).values({
    email: `${TEST_PREFIX}arch@test.com`,
    displayName: 'Test Architect',
    slackHandle: `${TEST_PREFIX}arch`,
    role: 'ARCHITECT',
  }).returning();

  const [salesUser] = await db.insert(users).values({
    email: `${TEST_PREFIX}sales@test.com`,
    displayName: 'Test Sales',
    slackHandle: `${TEST_PREFIX}sales`,
    role: 'SALES',
  }).returning();

  await db.insert(userWorkstreams).values({ userId: pmUser!.id, workstreamId: ws1!.id });

  const [channel] = await db.insert(slackChannels).values({
    slackChannelId: `${TEST_PREFIX}C01`,
    name: `${TEST_PREFIX}general`,
    workstreamId: ws1!.id,
  }).returning();

  const threads = [];
  for (let i = 0; i < 4; i++) {
    const [thread] = await db.insert(slackThreads).values({
      slackTeamId: 'T-TEST',
      channelId: channel!.id,
      threadTs: `170000000${i}.000100`,
      messageCount: 3,
      rawMessages: [],
      participantIds: [],
      pipelineState: 'approved',
    }).returning();
    threads.push(thread!);
  }

  await db.insert(classifiedTopics).values({
    threadId: threads[0]!.id,
    primaryTopic: 'API Refactoring Discussion',
    secondaryTopics: [],
    workstreamId: ws1!.id,
    confidence: 0.92,
    modelVersion: 'phi3:mini',
    promptVersion: 'v1',
    technicalSummary: { text: 'Detailed technical analysis of API refactoring with breaking changes' },
    plainSummary: { text: 'Team discussed API changes' },
  });

  await db.insert(classifiedTopics).values({
    threadId: threads[1]!.id,
    primaryTopic: 'Sprint Planning Q3',
    secondaryTopics: [],
    workstreamId: ws1!.id,
    confidence: 0.88,
    modelVersion: 'phi3:mini',
    promptVersion: 'v1',
    technicalSummary: { text: 'Sprint velocity analysis and capacity planning for Q3' },
    plainSummary: { text: 'Sprint planning for next quarter' },
  });

  await db.insert(classifiedTopics).values({
    threadId: threads[2]!.id,
    primaryTopic: 'Sales Enablement Update',
    secondaryTopics: [],
    workstreamId: ws2!.id,
    confidence: 0.85,
    modelVersion: 'phi3:mini',
    promptVersion: 'v1',
    technicalSummary: { text: 'Sales enablement tooling integration analysis' },
    plainSummary: { text: 'Sales team tooling update' },
  });

  await db.insert(classifiedTopics).values({
    threadId: threads[3]!.id,
    primaryTopic: 'Cross-team Dependency',
    secondaryTopics: [],
    workstreamId: ws1!.id,
    confidence: 0.90,
    modelVersion: 'phi3:mini',
    promptVersion: 'v1',
    technicalSummary: { text: 'Cross-team dependency resolution between engineering and sales' },
    plainSummary: { text: 'Dependency between teams' },
  });

  await db.insert(topicCorrelations).values({
    sourceThreadId: threads[3]!.id,
    correlatedThreadId: threads[0]!.id,
    correlationType: 'topic_match',
    confidence: 0.8,
  });

  await db.insert(orphanedActions).values({
    threadId: threads[1]!.id,
    actionText: 'Update CI pipeline configuration',
    status: 'orphaned',
  });

  return {
    ws1: ws1!, ws2: ws2!,
    pmUser: pmUser!, archUser: archUser!, salesUser: salesUser!,
    channel: channel!, threads,
  };
}

async function runValidation() {
  console.log('=== E2E Validation: Story 5.1 - Briefing Generation ===\n');

  console.log('1. Cleaning up previous test data...');
  await cleanup();
  console.log('   DONE\n');

  console.log('2. Setting up test data (users, workstreams, channels, approved threads)...');
  const data = await setupTestData();
  console.log(`   Created: 3 users, 2 workstreams, 1 channel, 4 approved threads`);
  console.log(`   Thread types: 1 cross_workstream (via correlation), 1 orphaned_action, 2 standard\n`);

  console.log('3. Importing BriefingsService and running generation...');

  const { BriefingsService } = await import('./briefings.service.js');
  const { PipelineStateService } = await import('../pipeline/pipeline-state.service.js');

  const pipelineStateService = new PipelineStateService(db as any);
  const mockConfigService = {
    get: (key: string) => {
      if (key === 'SLACK_TEAM_ID') return 'T-TEST';
      return undefined;
    },
  };

  const briefingsService = new BriefingsService(db as any, pipelineStateService, mockConfigService as any);

  const result = await briefingsService.generateBriefingsForAllUsers();
  console.log(`   Generation result:`, result);
  console.log('');

  let pass = 0;
  let fail = 0;

  function assert(label: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`   ✅ ${label}`);
      pass++;
    } else {
      console.log(`   ❌ ${label}${detail ? ` — ${detail}` : ''}`);
      fail++;
    }
  }

  console.log('4. Verifying briefings...');
  assert('Users processed >= 3 (includes pre-existing users)', result.usersProcessed >= 3);
  assert('Briefings generated >= 3', result.briefingsGenerated >= 3);
  assert('Items generated > 0', result.itemsGenerated > 0);

  const pmBriefings = await db.select().from(briefings).where(eq(briefings.userId, data.pmUser.id));
  assert('PM has exactly 1 briefing', pmBriefings.length === 1);
  assert('PM briefing shape = filtered_brief', pmBriefings[0]?.briefingShape === 'filtered_brief');

  const archBriefings = await db.select().from(briefings).where(eq(briefings.userId, data.archUser.id));
  assert('Architect has exactly 1 briefing', archBriefings.length === 1);
  assert('Architect briefing shape = intelligence_report', archBriefings[0]?.briefingShape === 'intelligence_report');

  const salesBriefings = await db.select().from(briefings).where(eq(briefings.userId, data.salesUser.id));
  assert('Sales has exactly 1 briefing', salesBriefings.length === 1);
  assert('Sales briefing shape = executive_scan', salesBriefings[0]?.briefingShape === 'executive_scan');
  console.log('');

  console.log('5. Verifying briefing items...');
  const pmItems = await db.select().from(briefingItems).where(eq(briefingItems.briefingId, pmBriefings[0]!.id));
  assert('PM (filtered_brief) gets items from assigned workstreams only', pmItems.every((i) => {
    const wsName = i.workstreamName;
    return wsName === `${TEST_PREFIX}engineering`;
  }));
  assert(`PM has ${pmItems.length} items (engineering workstream only, 3 threads)`, pmItems.length === 3,
    `got ${pmItems.length}`);

  const archItems = await db.select().from(briefingItems).where(eq(briefingItems.briefingId, archBriefings[0]!.id));
  assert('Architect (intelligence_report) gets ALL threads (4)', archItems.length === 4, `got ${archItems.length}`);

  const salesItems = await db.select().from(briefingItems).where(eq(briefingItems.briefingId, salesBriefings[0]!.id));
  assert('Sales (executive_scan) gets ALL threads (4)', salesItems.length === 4, `got ${salesItems.length}`);

  const crossWsItems = archItems.filter((i) => i.itemType === 'cross_workstream');
  assert('Cross-workstream item detected for correlated thread', crossWsItems.length === 1);

  const orphanedItems = archItems.filter((i) => i.itemType === 'orphaned_action');
  assert('Orphaned action item detected', orphanedItems.length === 1);

  const firstArchItem = archItems.sort((a, b) => a.sortOrder - b.sortOrder)[0];
  assert('Cross-workstream items sorted first (lowest sort_order)', firstArchItem?.itemType === 'cross_workstream');

  assert('Architect items use technical summary', archItems.some((i) =>
    i.summaryText.includes('technical') || i.summaryText.includes('analysis'),
  ));

  assert('Sales items use plain summary', salesItems.some((i) =>
    i.summaryText.includes('Team discussed') || i.summaryText.includes('Sprint planning'),
  ));

  const urlItems = archItems.filter((i) => i.sourceThreadUrl !== null);
  assert('Slack permalinks are generated', urlItems.length > 0);
  assert('Permalink format correct', urlItems[0]?.sourceThreadUrl?.startsWith('https://app.slack.com/client/T-TEST/'));
  console.log('');

  console.log('6. Verifying thread state transitions (APPROVED → DELIVERED)...');
  for (const thread of data.threads) {
    const [updated] = await db.select().from(slackThreads).where(eq(slackThreads.id, thread.id));
    assert(`Thread ${thread.id.substring(0, 8)} state = delivered`, updated?.pipelineState === 'delivered',
      `got ${updated?.pipelineState}`);
  }
  console.log('');

  console.log('7. Verifying duplicate prevention...');
  const result2 = await briefingsService.generateBriefingsForAllUsers();
  assert('Re-run generates 0 new briefings (idempotent)', result2.briefingsGenerated === 0);

  const allBriefings = await db.select().from(briefings).where(
    inArray(briefings.userId, [data.pmUser.id, data.archUser.id, data.salesUser.id]),
  );
  assert('Still only 3 total briefings after re-run', allBriefings.length === 3);
  console.log('');

  console.log('8. Cleanup...');
  await cleanup();
  console.log('   DONE\n');

  console.log('=== Results ===');
  console.log(`  ✅ Passed: ${pass}`);
  console.log(`  ❌ Failed: ${fail}`);
  console.log(`  Total: ${pass + fail}`);

  if (fail > 0) {
    console.log('\n⚠️  Some validations FAILED — review output above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All E2E validations PASSED!');
  }
}

runValidation()
  .catch((err) => {
    console.error('E2E validation error:', err);
    process.exit(1);
  })
  .finally(() => db.close());
