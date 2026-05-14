#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required for migrate-raw.js');
  process.exit(1);
}

const journalPath = path.resolve(__dirname, '../src/migrations/meta/_journal.json');
const migrationsDir = path.resolve(__dirname, '../src/migrations');

function splitStatements(sql) {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function isSkippableMigrationError(error) {
  const duplicateCodes = new Set([
    '42701', // duplicate_column
    '42P07', // duplicate_table (also relation exists)
    '42710', // duplicate_object
    '23505', // unique_violation (idempotent seed-like inserts)
  ]);

  if (duplicateCodes.has(error.code)) {
    return true;
  }

  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('already exists') ||
    message.includes('duplicate key value')
  );
}

async function ensureMigrationTable(client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint NOT NULL
    )
  `);
}

async function loadAppliedHashes(client) {
  const result = await client.query('SELECT hash FROM drizzle.__drizzle_migrations');
  return new Set(result.rows.map((row) => row.hash));
}

async function run() {
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    await ensureMigrationTable(client);
    const appliedHashes = await loadAppliedHashes(client);

    for (const entry of entries) {
      const migrationFile = path.join(migrationsDir, `${entry.tag}.sql`);
      if (!fs.existsSync(migrationFile)) {
        throw new Error(`Migration file missing: ${migrationFile}`);
      }

      const sql = fs.readFileSync(migrationFile, 'utf8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');

      if (appliedHashes.has(hash)) {
        continue;
      }

      const statements = splitStatements(sql);
      let hadFatalError = null;
      for (const statement of statements) {
        try {
          await client.query(statement);
        } catch (error) {
          if (isSkippableMigrationError(error)) {
            console.log(`Skipping idempotent statement in ${entry.tag}: ${error.message}`);
            continue;
          }
          hadFatalError = error;
          break;
        }
      }

      if (hadFatalError) {
        throw new Error(`Failed migration ${entry.tag}: ${hadFatalError.message}`);
      }

      await client.query(
        'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
        [hash, Number(entry.when)],
      );
      console.log(`Applied migration: ${entry.tag}`);
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
