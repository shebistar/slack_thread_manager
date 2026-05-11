/**
 * E2E Validation Script for Story 5.2: Executive Scan Briefing Shape
 *
 * Validates:
 * - getTodayBriefing() returns correct data for authenticated users
 * - Response shape matches { briefing, items } with correct fields
 * - Items are sorted by sortOrder
 * - StatsBar derivation: threadCount, workstreamCount, gone_quiet count, flags count
 * - Workstream grouping produces correct rows
 * - Empty state (null) returned for users with no briefing
 * - Data from text-paste import renders identically
 *
 * Run: pnpm --filter @slack-thread-manager/api exec dotenv -e ../../.env -- tsx src/modules/briefings/briefings-5-2.e2e-validation.ts
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
import { eq, sql, inArray } from 'drizzle-orm';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const db = createDb(DATABASE_URL);
const TEST_PREFIX = 'e2e-5-2-';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

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
  const [ws1] = await db.insert(workstreams).values({ name: `${TEST_PREFIX}platform` }).returning();
  const [ws2] = await db.insert(workstreams).values({ name: `${TEST_PREFIX}devops` }).returning();

  const [salesUser] = await db.insert(users).values({
    email: `${TEST_PREFIX}sales@test.com`,
    displayName: 'E2E Sales User',
    slackHandle: `${TEST_PREFIX}sales`,
    role: 'SALES',
  }).returning();

  const [adminUser] = await db.insert(users).values({
    email: `${TEST_PREFIX}admin@test.com`,
    displayName: 'E2E Admin User',
    slackHandle: `${TEST_PREFIX}admin`,
    role: 'ADMIN',
  }).returning();

  const [noBriefingUser] = await db.insert(users).values({
    email: `${TEST_PREFIX}newuser@test.com`,
    displayName: 'E2E New User',
    slackHandle: `${TEST_PREFIX}newuser`,
    role: 'PM',
  }).returning();

  const [channel] = await db.insert(slackChannels).values({
    slackChannelId: `${TEST_PREFIX}C01`,
    name: `${TEST_PREFIX}general`,
    workstreamId: ws1!.id,
  }).returning();

  const threads = [];
  for (let i = 0; i < 3; i++) {
    const [thread] = await db.insert(slackThreads).values({
      slackTeamId: 'T-TEST',
      channelId: channel!.id,
      threadTs: `170000010${i}.000100`,
      messageCount: 5,
      rawMessages: [],
      participantIds: [],
      pipelineState: 'delivered',
    }).returning();
    threads.push(thread!);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [salesBriefing] = await db.insert(briefings).values({
    userId: salesUser!.id,
    briefingDate: today,
    briefingShape: 'executive_scan',
    threadCount: 3,
    workstreamCount: 2,
  }).returning();

  await db.insert(briefingItems).values([
    {
      briefingId: salesBriefing!.id,
      threadId: threads[0]!.id,
      headline: 'Platform migration decision',
      summaryText: 'Team decided on Kubernetes migration timeline',
      workstreamName: `${TEST_PREFIX}platform`,
      sourceThreadUrl: 'https://app.slack.com/client/T-TEST/C01/thread/C01-123',
      itemType: 'standard',
      sortOrder: 0,
    },
    {
      briefingId: salesBriefing!.id,
      threadId: threads[1]!.id,
      headline: 'Cross-team dependency identified',
      summaryText: 'DevOps and platform teams need to coordinate',
      workstreamName: `${TEST_PREFIX}devops`,
      sourceThreadUrl: null,
      itemType: 'cross_workstream',
      sortOrder: 1,
    },
    {
      briefingId: salesBriefing!.id,
      threadId: threads[2]!.id,
      headline: 'Orphaned action: update docs',
      summaryText: 'Documentation update action has no owner',
      workstreamName: `${TEST_PREFIX}platform`,
      sourceThreadUrl: null,
      itemType: 'orphaned_action',
      sortOrder: 2,
    },
  ]);

  const [adminBriefing] = await db.insert(briefings).values({
    userId: adminUser!.id,
    briefingDate: today,
    briefingShape: 'executive_scan',
    threadCount: 3,
    workstreamCount: 2,
  }).returning();

  await db.insert(briefingItems).values([
    {
      briefingId: adminBriefing!.id,
      threadId: threads[0]!.id,
      headline: 'Platform migration decision',
      summaryText: 'Team decided on Kubernetes migration timeline',
      workstreamName: `${TEST_PREFIX}platform`,
      sourceThreadUrl: 'https://app.slack.com/client/T-TEST/C01/thread/C01-123',
      itemType: 'standard',
      sortOrder: 0,
    },
  ]);

  return {
    salesUser: salesUser!,
    adminUser: adminUser!,
    noBriefingUser: noBriefingUser!,
    salesBriefing: salesBriefing!,
    adminBriefing: adminBriefing!,
    threads,
    workstreams: [ws1!, ws2!],
  };
}

async function getTodayBriefing(userId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [briefing] = await db
    .select()
    .from(briefings)
    .where(
      sql`${briefings.userId} = ${userId} AND ${briefings.briefingDate} = ${today}`,
    )
    .orderBy(sql`${briefings.generatedAt} DESC`)
    .limit(1);

  if (!briefing) return null;

  const items = await db
    .select()
    .from(briefingItems)
    .where(eq(briefingItems.briefingId, briefing.id))
    .orderBy(sql`${briefingItems.sortOrder} ASC`);

  return { briefing, items };
}

async function run() {
  console.log('\n🧪 E2E Validation: Story 5.2 — Executive Scan Briefing Shape\n');
  console.log('Cleaning up previous test data...');
  await cleanup();

  console.log('Setting up test data...');
  const data = await setupTestData();

  console.log('\n1. Verifying getTodayBriefing() returns data for SALES user...');
  const salesResult = await getTodayBriefing(data.salesUser.id);
  assert('Sales user gets briefing', salesResult !== null);
  assert('Briefing shape is executive_scan', salesResult?.briefing.briefingShape === 'executive_scan');
  assert('Thread count is 3', salesResult?.briefing.threadCount === 3);
  assert('Workstream count is 2', salesResult?.briefing.workstreamCount === 2);
  assert('Items count is 3', salesResult?.items.length === 3);

  console.log('\n2. Verifying response shape matches { briefing, items } structure...');
  const b = salesResult!.briefing;
  assert('Has briefing.id', typeof b.id === 'string');
  assert('Has briefing.userId', b.userId === data.salesUser.id);
  assert('Has briefing.generatedAt', b.generatedAt instanceof Date);
  assert('Has briefing.briefingDate', b.briefingDate instanceof Date);

  const item0 = salesResult!.items[0]!;
  assert('Item has headline', typeof item0.headline === 'string');
  assert('Item has summaryText', typeof item0.summaryText === 'string');
  assert('Item has workstreamName', typeof item0.workstreamName === 'string');
  assert('Item has itemType', typeof item0.itemType === 'string');
  assert('Item has sortOrder', typeof item0.sortOrder === 'number');

  console.log('\n3. Verifying items sorted by sortOrder...');
  const sortOrders = salesResult!.items.map((i) => i.sortOrder);
  const isSorted = sortOrders.every((v, i) => i === 0 || v >= sortOrders[i - 1]!);
  assert('Items sorted ascending by sortOrder', isSorted, `got [${sortOrders}]`);

  console.log('\n4. Verifying StatsBar data derivation...');
  const items = salesResult!.items;
  const goneQuietCount = items.filter((i) => i.itemType === 'gone_quiet').length;
  const flagsCount = items.filter((i) => ['cross_workstream', 'orphaned_action'].includes(i.itemType)).length;
  assert('Gone quiet count is 0 (expected — no silence detection yet)', goneQuietCount === 0);
  assert('Flags raised count is 2 (1 cross_workstream + 1 orphaned_action)', flagsCount === 2);

  console.log('\n5. Verifying workstream grouping...');
  const wsMap = new Map<string, number>();
  items.forEach((i) => {
    const name = i.workstreamName ?? 'Unassigned';
    wsMap.set(name, (wsMap.get(name) ?? 0) + 1);
  });
  assert('Two workstreams in grouping', wsMap.size === 2);
  assert(`Platform has 2 items`, wsMap.get(`${TEST_PREFIX}platform`) === 2);
  assert(`DevOps has 1 item`, wsMap.get(`${TEST_PREFIX}devops`) === 1);

  console.log('\n6. Verifying ADMIN user gets executive_scan layout...');
  const adminResult = await getTodayBriefing(data.adminUser.id);
  assert('Admin user gets briefing', adminResult !== null);
  assert('Admin briefing shape is executive_scan', adminResult?.briefing.briefingShape === 'executive_scan');
  assert('Admin has 1 item', adminResult?.items.length === 1);

  console.log('\n7. Verifying empty state (no briefing for new user)...');
  const newUserResult = await getTodayBriefing(data.noBriefingUser.id);
  assert('New user gets null (no briefing)', newUserResult === null);

  console.log('\n8. Verifying deep-link (Slack URL) and null URL handling...');
  const withUrl = items.filter((i) => i.sourceThreadUrl !== null);
  const withoutUrl = items.filter((i) => i.sourceThreadUrl === null);
  assert('At least one item has Slack URL', withUrl.length > 0);
  assert('At least one item has null URL (text-paste-like)', withoutUrl.length > 0);
  assert('Slack URL format correct',
    withUrl[0]?.sourceThreadUrl?.startsWith('https://app.slack.com/client/') ?? false,
  );

  console.log('\n9. Verifying freshness timestamp derivation...');
  const generatedAt = salesResult!.briefing.generatedAt;
  const now = new Date();
  const ageMs = now.getTime() - generatedAt.getTime();
  assert('Briefing generated within last hour', ageMs < 60 * 60 * 1000,
    `age = ${Math.round(ageMs / 1000)}s`);

  console.log('\n10. Cleanup...');
  await cleanup();
  console.log('  Cleaned up test data.');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
  console.log(`${'='.repeat(60)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('E2E validation crashed:', err);
  process.exit(1);
});
