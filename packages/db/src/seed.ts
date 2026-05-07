import { createDb } from './client.js';
import { users, workstreams, slackChannels, userWorkstreams } from './schema/index.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const db = createDb(DATABASE_URL);

async function seed() {
  console.log('🌱 Seeding database...');

  // 1. Workstreams — insert then re-query by name for reliable IDs (P1: avoids positional
  //    destructuring of onConflictDoNothing().returning() which omits conflicting rows)
  console.log('  → Inserting workstreams...');
  const workstreamValues = [
    { name: 'vm-migration', description: 'Virtual machine migration workstream' },
    { name: 'infrastructure', description: 'Infrastructure and platform workstream' },
    { name: 'onboarding', description: 'Consultant onboarding and knowledge transfer' },
  ];

  await db.insert(workstreams).values(workstreamValues).onConflictDoNothing();

  const seededWorkstreams = await db.query.workstreams.findMany({
    where: (ws, { inArray }) => inArray(ws.name, workstreamValues.map((w) => w.name)),
  });

  const workstreamMap = Object.fromEntries(seededWorkstreams.map((ws) => [ws.name, ws.id]));
  const vmId = workstreamMap['vm-migration'];
  const infraId = workstreamMap['infrastructure'];
  const onboardId = workstreamMap['onboarding'];

  if (!vmId || !infraId || !onboardId) {
    throw new Error(`Failed to resolve workstream IDs. Found: ${JSON.stringify(workstreamMap)}`);
  }

  console.log('  ✓ Workstreams ready');

  // 2. Users — one per role
  console.log('  → Inserting users...');
  const seedUsers = [
    {
      email: 'alex.chen@example.com',
      displayName: 'Alex Chen',
      slackHandle: 'alex.chen',
      slackNicknames: ['alex', 'achen'],
      role: 'ARCHITECT' as const,
    },
    {
      email: 'priya.sharma@example.com',
      displayName: 'Priya Sharma',
      slackHandle: 'priya.sharma',
      slackNicknames: ['priya'],
      role: 'PM' as const,
    },
    {
      email: 'marco.rossi@example.com',
      displayName: 'Marco Rossi',
      slackHandle: 'marco.rossi',
      slackNicknames: ['marco'],
      role: 'CONSULTANT' as const,
    },
    {
      email: 'sarah.okonkwo@example.com',
      displayName: 'Sarah Okonkwo',
      slackHandle: 'sarah.okonkwo',
      slackNicknames: ['sarah'],
      role: 'SALES' as const,
    },
    {
      email: 'jamie.lee@example.com',
      displayName: 'Jamie Lee',
      slackHandle: 'jamie.lee',
      slackNicknames: ['jamie'],
      role: 'TRAINING' as const,
    },
    {
      email: 'shebi@example.com',
      displayName: 'Shebi',
      slackHandle: 'shebi',
      slackNicknames: [],
      role: 'ADMIN' as const,
    },
  ];

  await db.insert(users).values(seedUsers).onConflictDoNothing();

  // Re-query by seed emails — scoped to seed users only to avoid role collision
  // with any non-seed rows that may exist in the DB (P2)
  const seedEmails = seedUsers.map((u) => u.email);
  const seededUsers = await db.query.users.findMany({
    where: (u, { inArray }) => inArray(u.email, seedEmails),
  });

  const userEmailMap = Object.fromEntries(seededUsers.map((u) => [u.email, u.id]));
  console.log('  ✓ Users ready');

  // 3. Slack channels
  console.log('  → Inserting slack channels...');
  await db
    .insert(slackChannels)
    .values([
      { slackChannelId: 'C0VM001', name: 'vm-migration-general', workstreamId: vmId },
      { slackChannelId: 'C0VM002', name: 'vm-migration-technical', workstreamId: vmId },
      { slackChannelId: 'C0INF001', name: 'infrastructure-alerts', workstreamId: infraId },
    ])
    .onConflictDoNothing();

  console.log('  ✓ Channels ready');

  // 4. User–workstream assignments — keyed by email for deterministic lookup
  console.log('  → Assigning users to workstreams...');
  const assignments = [
    { userId: userEmailMap['alex.chen@example.com'], workstreamId: vmId },
    { userId: userEmailMap['alex.chen@example.com'], workstreamId: infraId },
    { userId: userEmailMap['priya.sharma@example.com'], workstreamId: vmId },
    { userId: userEmailMap['marco.rossi@example.com'], workstreamId: onboardId },
    { userId: userEmailMap['sarah.okonkwo@example.com'], workstreamId: infraId },
    { userId: userEmailMap['jamie.lee@example.com'], workstreamId: onboardId },
    { userId: userEmailMap['shebi@example.com'], workstreamId: vmId },
    { userId: userEmailMap['shebi@example.com'], workstreamId: infraId },
    { userId: userEmailMap['shebi@example.com'], workstreamId: onboardId },
  ].filter((a) => a.userId && a.workstreamId);

  // P4: guard against silent empty-insert which may throw or no-op depending on driver
  if (assignments.length === 0) {
    throw new Error(
      'No valid user-workstream assignments resolved — seed users may not have been created',
    );
  }

  await db.insert(userWorkstreams).values(assignments).onConflictDoNothing();

  console.log('  ✓ Workstream assignments ready');
  console.log('✅ Seed complete!');
}

// P3: await db.close() in finally before the process exits to ensure clean pool shutdown
(async () => {
  try {
    await seed();
  } catch (e) {
    console.error('❌ Seed failed:', e);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
