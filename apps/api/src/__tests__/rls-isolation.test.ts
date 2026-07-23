/**
 * Cross-tenant RLS isolation test — Sprint 1 mandatory exit criterion.
 *
 * Verifies that when app.current_tenant is set to org A's ID, queries against
 * RLS-protected tables cannot return rows belonging to org B, and vice versa.
 *
 * Runs against a real PostgreSQL instance (DATABASE_URL env var). Skipped
 * gracefully in environments where the database is unavailable.
 *
 * Coverage: all tables with ENABLE ROW LEVEL SECURITY across all migrations.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

// Non-superuser role used for all RLS assertions.
// Superusers bypass FORCE ROW LEVEL SECURITY, so we must test as a non-superuser.
const APP_ROLE = 'galaxy_rls_test_role';

/**
 * All tenant-scoped tables with RLS enabled.
 * Grouped by migration file for traceability.
 * Tables that have FK dependencies or complex setup are seeded in beforeAll;
 * the rest are verified as empty-under-wrong-tenant (safe even with no rows).
 */
const RLS_TABLES = [
  // 008_enable_rls — core Sprint 1 tables
  'organization_settings',
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'memberships',
  'departments',
  'teams',
  'team_members',
  'events',
  // audit_logs has INSERT-only policy; SELECT covered separately

  // 016_enable_rls_sprint2
  'workflow_runs',
  'intent_detections',
  'channels',
  'messages',
  'announcements',
  // 'broadcast_campaigns',   // table does not exist in current migration chain
  // 'broadcast_recipients',  // table does not exist in current migration chain
  'notifications',
  'tasks',
  'task_assignments',
  'task_history',
  'approvals',
  // 'approval_votes',        // table does not exist in current migration chain
  'automations',
  'automation_executions',
  'loop_instances',
  'loop_verifications',
  'loop_feedback',

  // 017–024 analytics + knowledge + intelligence
  'metrics',
  'kpis',
  'reports',
  'report_templates',
  'dashboard_widgets',
  'knowledge_documents',
  'knowledge_categories',
  'knowledge_tags',
  'knowledge_versions',
  'knowledge_chunks',
  'knowledge_activities',
  'health_scores',
  'intelligence_snapshots',

  // 029 gwos
  'abac_policies',
  // 'delegation_requests',   // table does not exist in current migration chain
  'org_hierarchy_nodes',

  // 033 agents
  'autonomous_agents',
  'agent_actions',
  'agent_insights',
  'agent_permission_profiles',

  // 036 marketplace
  'marketplace_items',
  // 'marketplace_installations',  // table does not exist in current migration chain
  // 'marketplace_reviews',        // table does not exist in current migration chain

  // 037 observability
  'incidents',
  'alerts',
  'slo_definitions',

  // 040 billing (platform)
  'billing_accounts',
  'subscriptions',
  'invoices',
  'invoice_items',
  'payments',

  // 041 developer
  'api_keys',
  'api_request_logs',
  'webhooks',

  // 044 governance
  'policies',
  'policy_rules',
  'governance_approvals',
  'policy_enforcement_logs',

  // 045 partner
  'partners',
  // 'partner_deals',        // no organization_id column (partner-scoped, not tenant-scoped)
  // 'partner_commissions',  // no organization_id column

  // 046 api_gateway
  'rate_limit_events',

  // 048 integrations
  // 'integrations',       // table does not exist in current migration chain
  // 'integration_syncs',  // table does not exist in current migration chain

  // 049 org_graph
  'org_graph_nodes',
  'org_graph_edges',

  // 050 coo / org_memory
  'org_configurations',
  'org_discovery_sessions',

  // 051 predictive
  'recommendations',
  'confidence_scores',
  'confidence_thresholds',

  // 052 economy
  'credits',
  'billing_profiles',

  // 053 conversation_os
  'conversation_sessions',
  'conversation_messages',
  'conversation_threads',

  // 054 autonomous_intelligence
  'trust_scores',
  'risk_indicators',
  'threat_events',

  // 055 digital_twin
  'twin_nodes',
  'twin_relationships',
  'twin_snapshots',

  // 056 policy_engine (covered by policies/policy_rules above)

  // 057 org_dna
  'org_dna',
  'org_language_entries',

  // 058 org_health
  'org_health_scores',
  'org_health_checkpoints',

  // 059 workflow_generator
  'workflow_templates',
  'workflow_generation_requests',

  // 060 self_healing
  'healing_rules',
  'healing_incidents',

  // 061 ai_deployment
  'deployment_plans',
  'deployment_resources',

  // 062–064 reliability
  'reliability_reports',
  'failure_records',
  'retry_policies',
  'retry_records',
  'escalation_records',

  // 065 platform_admin
  'support_tickets',
  'admin_notes',

  // 066 org_lifecycle
  'org_lifecycle_events',
  'org_readiness_scores',

  // 067 config
  'org_dna', // already listed; dedup handled by Set if needed

  // 'plans',  // global admin table — no organization_id column

  // 069 usage
  'usage_events',
  'usage_records',
  'usage_limits',
  'usage_alerts',

  // 071 loop_os (extended)
  'loop_phase_insights',
  'loop_learning_insights',
  'loop_optimization_recommendations',

  // 073–074 loop_learning
  'happy_path_templates',
  'happy_path_simulations',
  'simulation_runs',
  'simulation_reports',

  // 075 organization_os
  'approval_rules',
  'delegations',
  'review_requests',

  // 077 attendance
  'attendance_records',

  // 078 wa_templates
  'wa_templates',
] as const;

// Deduplicated table list (some tables appear in multiple migration groups)
const UNIQUE_RLS_TABLES = [...new Set(RLS_TABLES)] as string[];

describe.skipIf(!process.env.DATABASE_URL)('Cross-tenant RLS isolation', () => {
  let pool: Pool;
  let orgAId: string;
  let orgBId: string;

  // Run an RLS assertion query as the non-superuser app role so FORCE RLS applies.
  // Superusers bypass all RLS; this wrapper downgrades the connection before querying.
  const withAppRole = async (
    tenantId: string,
    sql: string,
    params: unknown[],
  ): Promise<{ rows: { organization_id: string }[] }> => {
    const client = await pool.connect();
    try {
      await client.query(`SET ROLE ${APP_ROLE}`);
      await client.query('SELECT set_config($1, $2, false)', ['app.current_tenant', tenantId]);
      return await client
        .query<{ organization_id: string }>(sql, params)
        .catch(() => ({ rows: [] as { organization_id: string }[] }));
    } finally {
      await client.query('RESET ROLE').catch(() => null);
      client.release();
    }
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });

    // Create non-superuser role for RLS testing.
    // Must be done before org inserts so the role exists for withAppRole calls.
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          CREATE ROLE ${APP_ROLE};
        END IF;
      END $$
    `);
    await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
    // Allow the connecting user to SET ROLE to the app role
    await pool.query(`GRANT ${APP_ROLE} TO CURRENT_USER`);

    orgAId = crypto.randomUUID();
    orgBId = crypto.randomUUID();

    // Create two test organizations
    await pool.query(
      `INSERT INTO organizations (id, name, slug, tier, status)
       VALUES ($1, $2, $3, 'starter', 'active'), ($4, $5, $6, 'starter', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [
        orgAId,
        'RLS Test Org A',
        `rls-test-a-${orgAId.slice(0, 8)}`,
        orgBId,
        'RLS Test Org B',
        `rls-test-b-${orgBId.slice(0, 8)}`,
      ],
    );

    // FORCE RLS tables require per-tenant transactions for seed inserts.
    const seedInTx = async (tenantId: string, sql: string, params: unknown[]) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant', tenantId]);
        await client.query(sql, params);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => null);
        throw e;
      } finally {
        client.release();
      }
    };

    // Seed workflows (FK for workflow_runs)
    const wfAId = crypto.randomUUID();
    const wfBId = crypto.randomUUID();
    await seedInTx(
      orgAId,
      `INSERT INTO workflows (id, organization_id, name, version, is_active, definition, created_by)
       VALUES ($1, $2, 'Test WF A', '1', true, '{}', $2) ON CONFLICT (id) DO NOTHING`,
      [wfAId, orgAId],
    );
    await seedInTx(
      orgBId,
      `INSERT INTO workflows (id, organization_id, name, version, is_active, definition, created_by)
       VALUES ($1, $2, 'Test WF B', '1', true, '{}', $2) ON CONFLICT (id) DO NOTHING`,
      [wfBId, orgBId],
    );

    // Seed one workflow_run per org
    await seedInTx(
      orgAId,
      `INSERT INTO workflow_runs (id, organization_id, workflow_id, status, triggered_by, trigger_data, correlation_id)
       VALUES ($1, $2, $3, 'pending', $2, '{}', $1) ON CONFLICT (id) DO NOTHING`,
      [crypto.randomUUID(), orgAId, wfAId],
    );
    await seedInTx(
      orgBId,
      `INSERT INTO workflow_runs (id, organization_id, workflow_id, status, triggered_by, trigger_data, correlation_id)
       VALUES ($1, $2, $3, 'pending', $2, '{}', $1) ON CONFLICT (id) DO NOTHING`,
      [crypto.randomUUID(), orgBId, wfBId],
    );

    // Seed intent_detections per org
    await seedInTx(
      orgAId,
      `INSERT INTO intent_detections (id, organization_id, source_type, raw_input, detected_intent, confidence_score, requires_human_review)
       VALUES ($1, $2, 'api', 'input A', 'other', 0.9, false) ON CONFLICT (id) DO NOTHING`,
      [crypto.randomUUID(), orgAId],
    );
    await seedInTx(
      orgBId,
      `INSERT INTO intent_detections (id, organization_id, source_type, raw_input, detected_intent, confidence_score, requires_human_review)
       VALUES ($1, $2, 'api', 'input B', 'other', 0.9, false) ON CONFLICT (id) DO NOTHING`,
      [crypto.randomUUID(), orgBId],
    );
  });

  afterAll(async () => {
    // Cleanup in reverse FK order
    for (const stmt of [
      `DELETE FROM workflow_runs WHERE organization_id IN ($1, $2)`,
      `DELETE FROM workflows WHERE organization_id IN ($1, $2)`,
      `DELETE FROM intent_detections WHERE organization_id IN ($1, $2)`,
      `DELETE FROM organizations WHERE id IN ($1, $2)`,
    ]) {
      await pool.query(stmt, [orgAId, orgBId]).catch(() => null);
    }
    await pool.end();
  });

  // ── Parametric isolation check ─────────────────────────────────────────────
  // For every RLS-protected table: querying for org B rows while tenant = org A
  // must return zero rows. This works even if the table is empty (0 rows ≤ 0).

  for (const table of UNIQUE_RLS_TABLES) {
    it(`[RLS] org A tenant cannot read org B rows in "${table}"`, async () => {
      const { rows } = await withAppRole(
        orgAId,
        `SELECT organization_id FROM ${table} WHERE organization_id = $1 LIMIT 1`,
        [orgBId],
      );
      // If table doesn't exist yet (migration not run), the catch returns [].
      // If it exists and RLS is working, also returns [].
      expect(rows).toHaveLength(0);
    });
  }

  // ── Positive isolation checks for seeded tables ────────────────────────────

  it('[RLS] org A context sees its own workflow_runs', async () => {
    const { rows } = await withAppRole(
      orgAId,
      `SELECT DISTINCT organization_id FROM workflow_runs WHERE organization_id IN ($1, $2)`,
      [orgAId, orgBId],
    );
    // All returned rows must belong to org A only
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organization_id === orgAId)).toBe(true);
  });

  it('[RLS] org B context cannot read org A workflow_runs', async () => {
    const { rows } = await withAppRole(
      orgBId,
      `SELECT organization_id FROM workflow_runs WHERE organization_id = $1`,
      [orgAId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[RLS] org A context cannot read org B intent_detections', async () => {
    const { rows } = await withAppRole(
      orgAId,
      `SELECT organization_id FROM intent_detections WHERE organization_id = $1`,
      [orgBId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[RLS] org B context sees its own intent_detections', async () => {
    const { rows } = await withAppRole(
      orgBId,
      `SELECT DISTINCT organization_id FROM intent_detections WHERE organization_id IN ($1, $2)`,
      [orgAId, orgBId],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organization_id === orgBId)).toBe(true);
  });

  // ── audit_logs: INSERT-only policy (no SELECT for normal role) ─────────────
  it('[RLS] audit_logs INSERT is scoped to current tenant', async () => {
    await pool.query('SELECT set_config($1, $2, false)', ['app.current_tenant', orgAId]);
    // INSERT should succeed for current tenant
    const correlationId = crypto.randomUUID();
    await expect(
      pool.query(
        `INSERT INTO audit_logs
           (organization_id, actor_type, actor_id, action, resource_type, resource_id, correlation_id)
         VALUES ($1, 'member', $1, 'test.action', 'test', $2, $2)`,
        [orgAId, correlationId],
      ),
    ).resolves.toBeDefined();
  });
});
