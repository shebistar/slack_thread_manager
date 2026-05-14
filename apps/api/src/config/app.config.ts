import { z } from 'zod';
import { llmConfigSchema } from './llm.config.js';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  KEYCLOAK_REALM_URL: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().startsWith('xoxb-').optional(),
  SLACK_TEAM_ID: z.string().optional(),
  INGESTION_CRON_SCHEDULE: z.string().default('0 */4 * * *'),
  BRIEFING_CRON_SCHEDULE: z.string().default('0 4 * * *'),
});

export const envSchema = baseSchema.merge(llmConfigSchema);

export type EnvConfig = z.infer<typeof envSchema>;
