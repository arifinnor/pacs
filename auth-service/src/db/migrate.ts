import 'dotenv/config';
import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PoolClient } from 'pg';
import pool from './index.js';

// Fixed advisory lock ID for schema migrations — prevents concurrent migration
// races when multiple auth-service instances start simultaneously.
const MIGRATION_LOCK_ID = 7_625_931_088;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, 'migrations');

interface MigrationModule {
  up: (client: PoolClient) => Promise<void>;
  down: (client: PoolClient) => Promise<void>;
}

async function withAdvisoryLock<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
  try {
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
  }
}

async function ensureTrackingTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id     SERIAL PRIMARY KEY,
      name   VARCHAR(255) UNIQUE NOT NULL,
      batch  INTEGER NOT NULL,
      run_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

function getMigrationFiles(): string[] {
  const allFiles = readdirSync(MIGRATIONS_DIR);
  return allFiles
    .filter(f => /^\d{14}_/.test(f) && (f.endsWith('.ts') || f.endsWith('.js')))
    .filter(f => f !== 'migration.ts' && f !== 'migration.js')
    .map(f => f.replace(/\.(ts|js)$/, ''))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();
}

async function loadMigration(name: string): Promise<MigrationModule> {
  for (const ext of ['.js', '.ts']) {
    const filePath = join(MIGRATIONS_DIR, name + ext);
    try {
      const mod = await import(filePath);
      if (typeof mod.up !== 'function' || typeof mod.down !== 'function') {
        throw new Error(`Migration ${name} must export up() and down() functions`);
      }
      return mod as MigrationModule;
    } catch (err: any) {
      if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND') {
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Cannot load migration: ${name}`);
}

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await withAdvisoryLock(client, async () => {
      await ensureTrackingTable(client);

      const allFiles = getMigrationFiles();
      const ranResult = await client.query('SELECT name FROM schema_migrations ORDER BY name');
      const ranNames = new Set(ranResult.rows.map((r: any) => r.name));
      const pending = allFiles.filter(f => !ranNames.has(f));

      if (pending.length === 0) {
        console.log('No pending migrations');
        return;
      }

      const batchResult = await client.query('SELECT COALESCE(MAX(batch), 0) as max_batch FROM schema_migrations');
      const nextBatch = batchResult.rows[0].max_batch + 1;

      for (const file of pending) {
        console.log(`Migrating: ${file}`);
        const migration = await loadMigration(file);

        await client.query('BEGIN');
        try {
          await migration.up(client);
          await client.query(
            'INSERT INTO schema_migrations (name, batch) VALUES ($1, $2)',
            [file, nextBatch]
          );
          await client.query('COMMIT');
          console.log(`  Done: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`  Failed: ${file}`, err);
          throw err;
        }
      }

      console.log(`Migration batch ${nextBatch} complete (${pending.length} migrations)`);
    });
  } finally {
    client.release();
  }
}

export async function rollback(): Promise<void> {
  const client = await pool.connect();
  try {
    await withAdvisoryLock(client, async () => {
      await ensureTrackingTable(client);

      const batchResult = await client.query('SELECT COALESCE(MAX(batch), 0) as max_batch FROM schema_migrations');
      const currentBatch = batchResult.rows[0].max_batch;

      if (currentBatch === 0) {
        console.log('Nothing to rollback');
        return;
      }

      const result = await client.query(
        'SELECT name FROM schema_migrations WHERE batch = $1 ORDER BY name DESC',
        [currentBatch]
      );
      const toRollback = result.rows.map((r: any) => r.name);

      for (const file of toRollback) {
        console.log(`Rolling back: ${file}`);
        const migration = await loadMigration(file);

        await client.query('BEGIN');
        try {
          await migration.down(client);
          await client.query('DELETE FROM schema_migrations WHERE name = $1', [file]);
          await client.query('COMMIT');
          console.log(`  Done: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`  Failed: ${file}`, err);
          throw err;
        }
      }

      console.log(`Rollback batch ${currentBatch} complete (${toRollback.length} migrations)`);
    });
  } finally {
    client.release();
  }
}

export async function status(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureTrackingTable(client);

    const allFiles = getMigrationFiles();
    const ranRows = await client.query('SELECT name, batch, run_at FROM schema_migrations ORDER BY name');
    const ranMap = new Map(ranRows.rows.map((r: any) => [r.name, r]));

    for (const file of allFiles) {
      const ran = ranMap.get(file);
      if (ran) {
        console.log(`  [RAN]     ${file}  (batch ${ran.batch}, ${ran.run_at})`);
      } else {
        console.log(`  [PENDING] ${file}`);
      }
    }

    console.log(`\nTotal: ${allFiles.length} migrations, ${ranRows.rows.length} ran, ${allFiles.length - ranRows.rows.length} pending`);
  } finally {
    client.release();
  }
}

export async function fresh(): Promise<void> {
  const client = await pool.connect();
  try {
    const allFiles = getMigrationFiles().reverse();

    if (allFiles.length === 0) {
      console.log('No migrations found');
      return;
    }

    console.log('Rolling back all auth-service tables...');
    for (const file of allFiles) {
      try {
        const migration = await loadMigration(file);
        await migration.down(client);
        console.log(`  Dropped: ${file}`);
      } catch (err: any) {
        if (err.code === '42P01') {
          console.log(`  Skipped: ${file} (table does not exist)`);
        } else {
          throw err;
        }
      }
    }

    await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
    console.log('  Dropped: schema_migrations');
    console.log('Running migrations from scratch...');
  } finally {
    client.release();
  }

  await migrate();
}

// CLI entry point
const isMain = process.argv[1]?.endsWith('migrate.js') || process.argv[1]?.endsWith('migrate.ts');
if (isMain) {
  const command = process.argv[2];
  const run = async () => {
    if (command === '--rollback') {
      await rollback();
    } else if (command === '--status') {
      await status();
    } else if (command === '--fresh') {
      await fresh();
    } else {
      await migrate();
    }
  };

  run()
    .then(() => pool.end().then(() => process.exit(0)))
    .catch(() => pool.end().then(() => process.exit(1)));
}
