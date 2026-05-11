import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  tablesFilter: [
    'users',
    'workstreams',
    'user_workstreams',
    'slack_channels',
    'slack_threads',
    'thread_messages',
    'pipeline_runs',
    'pipeline_failures',
    'classified_topics',
    'thread_embeddings',
    'topic_correlations',
    'orphaned_actions',
    'anonymization_blocklist',
    'staging_queue',
    'briefings',
    'briefing_items',
  ],
});
