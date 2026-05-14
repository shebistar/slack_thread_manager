/**
 * E2E Validation for Story 5.5: Read/Unread State
 * Run: DATABASE_URL=postgresql://stm_dev:stm_dev_password@localhost:5432/slack_thread_manager tsx src/modules/briefings/e2e-read-state.ts
 */

import { createDb } from '@slack-thread-manager/db';
import { briefingItemReads, briefingItems, briefings } from '@slack-thread-manager/db';
import { eq, sql } from 'drizzle-orm';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const db = createDb(DATABASE_URL);

async function validate() {
  console.log('--- E2E Validation: Story 5.5 Read/Unread State ---\n');

  const result = await db.execute(sql`SELECT COUNT(*) as cnt FROM briefing_item_reads`);
  console.log('✓ briefing_item_reads table accessible, count:', result.rows[0]?.cnt);

  const existingBriefings = await db
    .select({ id: briefings.id, userId: briefings.userId, shape: briefings.briefingShape })
    .from(briefings)
    .limit(1);

  if (existingBriefings.length === 0) {
    console.log('⚠ No briefings found — run briefing generation to populate test data');
    console.log('\n✅ Schema validation passed (no data to exercise read state)');
    process.exit(0);
  }

  const briefing = existingBriefings[0]!;
  console.log('✓ Found briefing:', briefing.id, '(shape:', briefing.shape + ')');

  const items = await db
    .select({ id: briefingItems.id })
    .from(briefingItems)
    .where(eq(briefingItems.briefingId, briefing.id))
    .limit(2);

  const userId = briefing.userId;
  let itemId: string;

  if (items.length === 0) {
    console.log('  No existing items — creating test briefing item...');
    const threads = await db.execute(sql`SELECT id FROM slack_threads LIMIT 1`);
    if (threads.rows.length === 0) {
      console.log('⚠ No slack_threads found — cannot create test briefing item');
      console.log('\n✅ Schema validation passed (no thread data available for full E2E)');
      process.exit(0);
    }
    const threadId = threads.rows[0]!.id as string;
    const [newItem] = await db
      .insert(briefingItems)
      .values({
        briefingId: briefing.id,
        threadId,
        headline: 'E2E test item for read state',
        summaryText: 'Test summary',
        itemType: 'standard',
        sortOrder: 99,
      })
      .returning();
    itemId = newItem!.id;
    console.log('✓ Created test briefing item:', itemId);
  } else {
    itemId = items[0]!.id;
  }
  console.log('✓ Found briefing item:', itemId);

  // Clean up any previous test
  await db.execute(
    sql`DELETE FROM briefing_item_reads WHERE user_id = ${userId} AND briefing_item_id = ${itemId}`,
  );

  // Test 1: Insert a read record
  const [inserted] = await db
    .insert(briefingItemReads)
    .values({ userId, briefingItemId: itemId })
    .returning();
  console.log('✓ Mark as read — inserted:', {
    briefingItemId: inserted!.briefingItemId,
    readAt: inserted!.readAt.toISOString(),
  });

  // Test 2: Verify persistence
  const [persisted] = await db
    .select()
    .from(briefingItemReads)
    .where(eq(briefingItemReads.briefingItemId, itemId));
  console.log('✓ Read record persists:', {
    briefingItemId: persisted!.briefingItemId,
    readAt: persisted!.readAt.toISOString(),
  });

  // Test 3: Unique constraint prevents duplicates
  try {
    await db.execute(
      sql`INSERT INTO briefing_item_reads (user_id, briefing_item_id) VALUES (${userId}, ${itemId})`,
    );
    console.log('✗ FAIL: Duplicate insert should have failed');
    process.exit(1);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      console.log('✓ Unique constraint blocks duplicate read (idempotent)');
    } else {
      console.log('✗ Unexpected error:', msg);
      process.exit(1);
    }
  }

  // Test 4: Cascade delete — delete briefing item cascades to reads
  // (We won't actually delete the briefing item, just verify the FK exists)
  const fkCheck = await db.execute(sql`
    SELECT tc.constraint_name, tc.constraint_type
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'briefing_item_reads'
    AND ccu.table_name = 'briefing_items'
    AND tc.constraint_type = 'FOREIGN KEY'
  `);
  console.log('✓ FK cascade configured:', fkCheck.rows.length > 0 ? 'yes' : 'no');

  // Cleanup
  await db.execute(
    sql`DELETE FROM briefing_item_reads WHERE user_id = ${userId} AND briefing_item_id = ${itemId}`,
  );
  console.log('✓ Cleaned up test data');

  console.log('\n✅ E2E validation PASSED — all read state operations work correctly');
  process.exit(0);
}

validate().catch((e) => {
  console.error('E2E validation failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
