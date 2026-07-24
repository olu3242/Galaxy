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
import * as migration017 from './migrations/017_create_metrics.js';
import * as migration018 from './migrations/018_create_kpis.js';
import * as migration019 from './migrations/019_create_reports.js';
import * as migration020 from './migrations/020_create_dashboard_widgets.js';
import * as migration021 from './migrations/021_create_knowledge_documents.js';
import * as migration022 from './migrations/022_create_knowledge_categories_tags.js';
import * as migration023 from './migrations/023_create_health_scores.js';
import * as migration024 from './migrations/024_create_intelligence_snapshots.js';
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
import * as migration053 from './migrations/053_conversation_os.js';
import * as migration054 from './migrations/054_autonomous_intelligence.js';
import * as migration055 from './migrations/055_digital_twin.js';
import * as migration056 from './migrations/056_policy_engine.js';
import * as migration057 from './migrations/057_org_dna.js';
import * as migration058 from './migrations/058_org_health.js';
import * as migration059 from './migrations/059_workflow_generator.js';
import * as migration060 from './migrations/060_self_healing.js';
import * as migration061 from './migrations/061_ai_deployment.js';
import * as migration062 from './migrations/062_reliability_part1.js';
import * as migration063 from './migrations/063_reliability_part2.js';
import * as migration064 from './migrations/064_reliability_part3.js';
import * as migration065 from './migrations/065_platform_admin.js';
import * as migration066 from './migrations/066_org_lifecycle.js';
import * as migration067 from './migrations/067_config.js';
import * as migration068 from './migrations/068_billing.js';
import * as migration069 from './migrations/069_usage.js';
import * as migration070 from './migrations/070_commercial.js';
import * as migration071 from './migrations/071_loop_os.js';
import * as migration072 from './migrations/072_knowledge_embeddings.js';
import * as migration073 from './migrations/073_loop_learning.js';
import * as migration074 from './migrations/074_loop_learning_optimization.js';
import * as migration075 from './migrations/075_organization_os.js';
import * as migration076 from './migrations/076_memberships_role_column.js';
import * as migration077 from './migrations/077_attendance_records.js';
import * as migration078 from './migrations/078_wa_templates.js';
import * as migration079 from './migrations/079_feature_flags_name_column.js';
import * as migration080 from './migrations/080_loop_instances_phase.js';
import * as migration081 from './migrations/081_agent_lifecycle_traces.js';
import * as migration083 from './migrations/083_shared_org_memory.js';
import * as migration084 from './migrations/084_loop_telemetry.js';
import * as migration085 from './migrations/085_force_rls_all_tenant_tables.js';
import * as migration086 from './migrations/086_workflow_definitions.js';
import * as migration087 from './migrations/087_workstream_checkpoints.js';
import * as migration088 from './migrations/088_workstream_telemetry.js';

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
  { name: '017_create_metrics', migration: migration017 },
  { name: '018_create_kpis', migration: migration018 },
  { name: '019_create_reports', migration: migration019 },
  { name: '020_create_dashboard_widgets', migration: migration020 },
  { name: '021_create_knowledge_documents', migration: migration021 },
  { name: '022_create_knowledge_categories_tags', migration: migration022 },
  { name: '023_create_health_scores', migration: migration023 },
  { name: '024_create_intelligence_snapshots', migration: migration024 },
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
  { name: '053_conversation_os', migration: migration053 },
  { name: '054_autonomous_intelligence', migration: migration054 },
  { name: '055_digital_twin', migration: migration055 },
  { name: '056_policy_engine', migration: migration056 },
  { name: '057_org_dna', migration: migration057 },
  { name: '058_org_health', migration: migration058 },
  { name: '059_workflow_generator', migration: migration059 },
  { name: '060_self_healing', migration: migration060 },
  { name: '061_ai_deployment', migration: migration061 },
  { name: '062_reliability_part1', migration: migration062 },
  { name: '063_reliability_part2', migration: migration063 },
  { name: '064_reliability_part3', migration: migration064 },
  { name: '065_platform_admin', migration: migration065 },
  { name: '066_org_lifecycle', migration: migration066 },
  { name: '067_config', migration: migration067 },
  { name: '068_billing', migration: migration068 },
  { name: '069_usage', migration: migration069 },
  { name: '070_commercial', migration: migration070 },
  { name: '071_loop_os', migration: migration071 },
  { name: '072_knowledge_embeddings', migration: migration072 },
  { name: '073_loop_learning', migration: migration073 },
  { name: '074_loop_learning_optimization', migration: migration074 },
  { name: '075_organization_os', migration: migration075 },
  { name: '076_memberships_role_column', migration: migration076 },
  { name: '077_attendance_records', migration: migration077 },
  { name: '078_wa_templates', migration: migration078 },
  { name: '079_feature_flags_name_column', migration: migration079 },
  { name: '080_loop_instances_phase', migration: migration080 },
  { name: '081_agent_lifecycle_traces', migration: migration081 },
  { name: '083_shared_org_memory', migration: migration083 },
  { name: '084_loop_telemetry', migration: migration084 },
  { name: '085_force_rls_all_tenant_tables', migration: migration085 },
  { name: '086_workflow_definitions', migration: migration086 },
  { name: '087_workstream_checkpoints', migration: migration087 },
  { name: '088_workstream_telemetry', migration: migration088 },
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
    try {
      await migration.up(pool);
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      console.warn(`[migrate] Applied ${name}`);
    } catch (err) {
      console.error(`[migrate] Failed to apply ${name}:`, err);
      throw err;
    }
  }
}

async function runDown(pool: Pool): Promise<void> {
  await ensureMigrationsTable(pool);
  const applied = await getAppliedMigrations(pool);

  const toRollback = [...migrations].reverse().filter(({ name }) => applied.has(name));

  for (const { name, migration } of toRollback) {
    console.warn(`[migrate] Rolling back ${name}...`);
    try {
      await migration.down(pool);
      await pool.query('DELETE FROM schema_migrations WHERE name = $1', [name]);
      console.warn(`[migrate] Rolled back ${name}`);
    } catch (err) {
      console.error(`[migrate] Failed to rollback ${name}:`, err);
      throw err;
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
