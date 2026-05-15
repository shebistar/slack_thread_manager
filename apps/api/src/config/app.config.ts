import { z } from 'zod';
import { llmConfigSchema } from './llm.config.js';

function isValidIanaTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

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
  PROJECT_TIMEZONE: z.string().default('Europe/Berlin').refine(
    isValidIanaTimezone,
    'PROJECT_TIMEZONE must be a valid IANA timezone (e.g. Europe/Berlin)',
  ),
});

export const envSchema = baseSchema.merge(llmConfigSchema);

export type EnvConfig = z.infer<typeof envSchema>;
