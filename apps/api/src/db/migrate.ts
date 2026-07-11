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
import * as migration030 from './migrations/030_agent_registry.js';
import * as migration031 from './migrations/031_agent_memory.js';
import * as migration032 from './migrations/032_decision_engine.js';
import * as migration033 from './migrations/033_agent_rls.js';
import * as migration034 from './migrations/034_marketplace.js';
import * as migration035 from './migrations/035_observability.js';
import * as migration036 from './migrations/036_marketplace_rls.js';
import * as migration037 from './migrations/037_observability_rls.js';
import * as migration038 from './migrations/038_billing.js';
import * as migration039 from './migrations/039_developer_platform.js';
import * as migration040 from './migrations/040_billing_rls.js';
import * as migration041 from './migrations/041_developer_rls.js';
import * as migration042 from './migrations/042_governance.js';
import * as migration043 from './migrations/043_platform_admin.js';
import * as migration044 from './migrations/044_governance_rls.js';
import * as migration045 from './migrations/045_partner_portal.js';
import * as migration046 from './migrations/046_api_gateway.js';
import * as migration047 from './migrations/047_integrations.js';
import * as migration048 from './migrations/048_integrations_rls.js';
import * as migration049 from './migrations/049_org_graph.js';
import * as migration050 from './migrations/050_coo_org_memory.js';
import * as migration051 from './migrations/051_predictive.js';
import * as migration052 from './migrations/052_economy.js';
import * as migration071 from './migrations/071_loop_os.js';

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
  { name: '030_agent_registry', migration: migration030 },
  { name: '031_agent_memory', migration: migration031 },
  { name: '032_decision_engine', migration: migration032 },
  { name: '033_agent_rls', migration: migration033 },
  { name: '034_marketplace', migration: migration034 },
  { name: '035_observability', migration: migration035 },
  { name: '036_marketplace_rls', migration: migration036 },
  { name: '037_observability_rls', migration: migration037 },
  { name: '038_billing', migration: migration038 },
  { name: '039_developer_platform', migration: migration039 },
  { name: '040_billing_rls', migration: migration040 },
  { name: '041_developer_rls', migration: migration041 },
  { name: '042_governance', migration: migration042 },
  { name: '043_platform_admin', migration: migration043 },
  { name: '044_governance_rls', migration: migration044 },
  { name: '045_partner_portal', migration: migration045 },
  { name: '046_api_gateway', migration: migration046 },
  { name: '047_integrations', migration: migration047 },
  { name: '048_integrations_rls', migration: migration048 },
  { name: '049_org_graph', migration: migration049 },
  { name: '050_coo_org_memory', migration: migration050 },
  { name: '051_predictive', migration: migration051 },
  { name: '052_economy', migration: migration052 },
  { name: '071_loop_os', migration: migration071 },
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
      console.warn(`[migrate] Skipping ${name} (already applied)`);
      continue;
    }

    console.warn(`[migrate] Running ${name}...`);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await migration.up(pool);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.warn(`[migrate] Applied ${name}`);
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
    console.warn(`[migrate] Rolling back ${name}...`);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await migration.down(pool);
      await client.query('DELETE FROM schema_migrations WHERE name = $1', [name]);
      await client.query('COMMIT');
      console.warn(`[migrate] Rolled back ${name}`);
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

    console.warn('[migrate] Done');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
