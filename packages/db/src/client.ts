import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return Object.assign(db, {
    $pool: pool,
    close: () => pool.end(),
  });
}

export type Database = ReturnType<typeof createDb>;
