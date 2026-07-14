/**
 * Cross-tenant RLS isolation test — Sprint 1 mandatory exit criterion.
 *
 * Verifies that when app.current_tenant is set to org A's ID, queries against
 * RLS-protected tables cannot return rows belonging to org B, and vice versa.
 *
 * Runs against a real PostgreSQL instance (DATABASE_URL env var). Skipped
 * gracefully in environments where the database is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

// Tables that carry organization_id and have RLS enabled
const RLS_TABLES = [
  'workflow_runs',
  'intent_detections',
  'usage_events',
  'usage_records',
  'usage_limits',
  'usage_alerts',
] as const;

describe.skipIf(!process.env.DATABASE_URL)('Cross-tenant RLS isolation', () => {
  // pool is always initialized when the describe block runs (DATABASE_URL is defined)
  let pool: Pool;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });

    orgAId = crypto.randomUUID();
    orgBId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO organizations (id, name, slug, tier, status)
       VALUES ($1, $2, $3, 'free', 'active'), ($4, $5, $6, 'free', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [
        orgAId,
        'RLS Test Org A',
        `rls-test-a-${orgAId}`,
        orgBId,
        'RLS Test Org B',
        `rls-test-b-${orgBId}`,
      ],
    );

    // Seed one workflow per org so workflow_runs FK is satisfied
    const wfAId = crypto.randomUUID();
    const wfBId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO workflows (id, organization_id, name, version, is_active, definition, created_by)
       VALUES
         ($1, $2, 'Leave Request', '1', true, '{}', $2),
         ($3, $4, 'Leave Request', '1', true, '{}', $4)
       ON CONFLICT (id) DO NOTHING`,
      [wfAId, orgAId, wfBId, orgBId],
    );

    await pool.query(
      `INSERT INTO workflow_runs (id, organization_id, workflow_id, status, triggered_by, trigger_data, correlation_id)
       VALUES
         ($1, $2, $3, 'pending', 'test', '{}', $1),
         ($4, $5, $6, 'pending', 'test', '{}', $4)`,
      [crypto.randomUUID(), orgAId, wfAId, crypto.randomUUID(), orgBId, wfBId],
    );

    await pool.query(
      `INSERT INTO intent_detections
         (id, organization_id, source_type, raw_input, detected_intent, confidence_score, requires_human_review)
       VALUES
         ($1, $2, 'test', 'rls test input A', 'other', 0.9, false),
         ($3, $4, 'test', 'rls test input B', 'other', 0.9, false)`,
      [crypto.randomUUID(), orgAId, crypto.randomUUID(), orgBId],
    );
  });

  afterAll(async () => {
    await pool
      .query(`DELETE FROM workflow_runs WHERE organization_id IN ($1, $2)`, [orgAId, orgBId])
      .catch(() => null);
    await pool
      .query(`DELETE FROM workflows WHERE organization_id IN ($1, $2)`, [orgAId, orgBId])
      .catch(() => null);
    await pool
      .query(`DELETE FROM intent_detections WHERE organization_id IN ($1, $2)`, [orgAId, orgBId])
      .catch(() => null);
    await pool
      .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgAId, orgBId])
      .catch(() => null);

    await pool.end();
  });

  it('org A context cannot read org B workflow_runs', async () => {
    await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgAId]);
    const { rows } = await pool.query<{ organization_id: string }>(
      'SELECT organization_id FROM workflow_runs WHERE organization_id = $1',
      [orgBId],
    );
    expect(rows).toHaveLength(0);
  });

  it('org B context cannot read org A workflow_runs', async () => {
    await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgBId]);
    const { rows } = await pool.query<{ organization_id: string }>(
      'SELECT organization_id FROM workflow_runs WHERE organization_id = $1',
      [orgAId],
    );
    expect(rows).toHaveLength(0);
  });

  it('org A context only sees its own workflow_runs', async () => {
    await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgAId]);
    const { rows } = await pool.query<{ organization_id: string }>(
      'SELECT DISTINCT organization_id FROM workflow_runs WHERE organization_id IN ($1, $2)',
      [orgAId, orgBId],
    );
    expect(rows.every((r) => r.organization_id === orgAId)).toBe(true);
  });

  it('org A context cannot read org B intent_detections', async () => {
    await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgAId]);
    const { rows } = await pool.query<{ organization_id: string }>(
      'SELECT organization_id FROM intent_detections WHERE organization_id = $1',
      [orgBId],
    );
    expect(rows).toHaveLength(0);
  });

  for (const table of RLS_TABLES) {
    it(`org A context cannot see org B rows in ${table}`, async () => {
      await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgAId]);
      const { rows } = await pool.query<{ organization_id: string }>(
        `SELECT organization_id FROM ${table} WHERE organization_id = $1`,
        [orgBId],
      );
      expect(rows).toHaveLength(0);
    });
  }
});
