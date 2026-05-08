import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  KEYCLOAK_REALM_URL: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().startsWith('xoxb-').optional(),
  SLACK_TEAM_ID: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;
