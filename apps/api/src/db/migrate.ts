import { Pool } from 'pg';
import * as migration001 from './migrations/001_create_organizations.js';
import * as migration002 from './migrations/002_create_users.js';
import * as migration003 from './migrations/003_create_roles_permissions.js';
import * as migration004 from './migrations/004_create_memberships.js';
import * as migration005 from './migrations/005_create_departments_teams.js';
import * as migration006 from './migrations/006_create_events.js';
import * as migration007 from './migrations/007_create_audit_logs.js';
import * as migration008 from './migrations/008_enable_rls.js';
import * as migration009 from './migrations/009_create_channels_messages.js';
import * as migration010 from './migrations/010_create_announcements_broadcasts.js';
import * as migration011 from './migrations/011_create_notifications.js';
import * as migration012 from './migrations/012_create_workflows.js';
import * as migration013 from './migrations/013_create_tasks.js';
import * as migration014 from './migrations/014_create_approvals.js';
import * as migration015 from './migrations/015_create_automations.js';
import * as migration016 from './migrations/016_enable_rls_sprint2.js';
import * as migration025 from './migrations/025_gwos_workflow_classification.js';
import * as migration026 from './migrations/026_gwos_event_fabric.js';
import * as migration027 from './migrations/027_gwos_ai_orchestration.js';
import * as migration028 from './migrations/028_gwos_whatsapp_runtime.js';
import * as migration029 from './migrations/029_gwos_rls.js';

interface Migration {
  up: (pool: Pool) => Promise<void>;
  down: (pool: Pool) => Promise<void>;
}

const migrations: { name: string; migration: Migration }[] = [
  { name: '001_create_organizations', migration: migration001 },
  { name: '002_create_users', migration: migration002 },
  { name: '003_create_roles_permissions', migration: migration003 },
  { name: '004_create_memberships', migration: migration004 },
  { name: '005_create_departments_teams', migration: migration005 },
  { name: '006_create_events', migration: migration006 },
  { name: '007_create_audit_logs', migration: migration007 },
  { name: '008_enable_rls', migration: migration008 },
  { name: '009_create_channels_messages', migration: migration009 },
  { name: '010_create_announcements_broadcasts', migration: migration010 },
  { name: '011_create_notifications', migration: migration011 },
  { name: '012_create_workflows', migration: migration012 },
  { name: '013_create_tasks', migration: migration013 },
  { name: '014_create_approvals', migration: migration014 },
  { name: '015_create_automations', migration: migration015 },
  { name: '016_enable_rls_sprint2', migration: migration016 },
  { name: '025_gwos_workflow_classification', migration: migration025 },
  { name: '026_gwos_event_fabric', migration: migration026 },
  { name: '027_gwos_ai_orchestration', migration: migration027 },
  { name: '028_gwos_whatsapp_runtime', migration: migration028 },
  { name: '029_gwos_rls', migration: migration029 },
];

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY id ASC',
  );
  return new Set(result.rows.map((r) => r.name));
}

async function runUp(pool: Pool): Promise<void> {
  await ensureMigrationsTable(pool);
  const applied = await getAppliedMigrations(pool);

  for (const { name, migration } of migrations) {
    if (applied.has(name)) {
      console.log(`[migrate] Skipping ${name} (already applied)`);
      continue;
    }

    console.log(`[migrate] Running ${name}...`);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await migration.up(pool);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`[migrate] Applied ${name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] Failed to apply ${name}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}

async function runDown(pool: Pool): Promise<void> {
  await ensureMigrationsTable(pool);
  const applied = await getAppliedMigrations(pool);

  const toRollback = [...migrations].reverse().filter(({ name }) => applied.has(name));

  for (const { name, migration } of toRollback) {
    console.log(`[migrate] Rolling back ${name}...`);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await migration.down(pool);
      await client.query('DELETE FROM schema_migrations WHERE name = $1', [name]);
      await client.query('COMMIT');
      console.log(`[migrate] Rolled back ${name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] Failed to rollback ${name}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const command = process.argv[2];

    if (command === 'rollback') {
      await runDown(pool);
    } else {
      await runUp(pool);
    }

    console.log('[migrate] Done');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
