import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module.js';
import { PipelineModule } from '../modules/pipeline/pipeline.module.js';
import { PipelineService } from '../modules/pipeline/pipeline.service.js';
import { createDb } from '@slack-thread-manager/db';
import { sql } from 'drizzle-orm';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    PipelineModule,
  ],
})
class E2eClassifyModule {}

async function main() {
  const dbUrl = process.env.DATABASE_URL!;
  const db = createDb(dbUrl);

  console.log('=== Pre-Classification State ===');
  const pre = await db.execute(
    sql`SELECT id, pipeline_state FROM slack_threads WHERE pipeline_state = 'ingested'`,
  );
  console.log(`Ingested threads: ${pre.rows.length}`);

  if (pre.rows.length === 0) {
    console.log('No ingested threads to classify. Import data first.');
    await db.close();
    return;
  }

  console.log('\n=== Running Classification ===');
  const app = await NestFactory.createApplicationContext(E2eClassifyModule, {
    logger: ['log', 'error', 'warn'],
  });
  const pipelineService = app.get(PipelineService);

  const result = await pipelineService.runClassification();
  console.log('\n=== Classification Results ===');
  console.log(`Processed: ${result.processed}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Pending Retry: ${result.pendingRetry}`);

  console.log('\n=== Post-Classification State ===');
  const postThreads = await db.execute(
    sql`SELECT id, pipeline_state FROM slack_threads ORDER BY created_at`,
  );
  for (const row of postThreads.rows) {
    console.log(`  ${row.id} | state=${row.pipeline_state}`);
  }

  const topics = await db.execute(
    sql`SELECT thread_id, primary_topic, confidence, workstream_id FROM classified_topics`,
  );
  console.log(`\nClassified topics: ${topics.rows.length}`);
  for (const row of topics.rows) {
    console.log(
      `  thread=${String(row.thread_id).slice(0, 8)}... | topic="${row.primary_topic}" | conf=${row.confidence} | ws=${row.workstream_id}`,
    );
  }

  const failures = await db.execute(
    sql`SELECT thread_id, pipeline_stage, error_message FROM pipeline_failures ORDER BY created_at`,
  );
  if (failures.rows.length > 0) {
    console.log(`\nPipeline failures: ${failures.rows.length}`);
    for (const row of failures.rows) {
      console.log(
        `  thread=${String(row.thread_id).slice(0, 8)}... | stage=${row.pipeline_stage} | err=${String(row.error_message).slice(0, 100)}`,
      );
    }
  }

  await app.close();
  await db.close();
}

main().catch((err) => {
  console.error('E2E classification failed:', err);
  process.exit(1);
});
