/**
 * Reliability OS Certification Test Suite
 *
 * Certifies the Reliability module lifecycle:
 * 1.  happy_path_templates and failure_records tables exist
 * 2.  Happy path template registration persists a record
 * 3.  Happy path simulation runs and returns a result
 * 4.  Failure recording creates a retrievable failure record
 * 5.  Failure resolution transitions status to recovered
 * 6.  Failure metrics return structured counts
 * 7.  Reliability score computation returns a report with a numeric score
 * 8.  Reliability score is within [0, 100]
 * 9.  Cross-tenant isolation — org B cannot see org A failure records
 * 10. Latest reliability report is retrievable after computation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  HappyPathService,
  FailureRegistryService,
  ReliabilityScoreService,
} from '@galaxy/reliability';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-1801-4000-8000-180000000001';
const orgIdB = '00000000-1801-4000-8000-180000000002';
const actorId = '00000000-1801-4000-8000-180000000010';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Reliability Test Org A', 'reliability-test-a', 'starter', 'active'),
            ($2, 'Reliability Test Org B', 'reliability-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM happy_path_simulations WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM happy_path_templates WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM failure_records WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM reliability_reports WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Reliability OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. happy_path_templates and failure_records tables exist', async () => {
    for (const table of ['happy_path_templates', 'failure_records']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Happy path template registration ──────────────────────────────────
  it('2. Happy path template registration persists a record', async () => {
    const svc = new HappyPathService(pool);

    const template = await svc.registerTemplate(
      orgId,
      'workflow_automation',
      'Standard Approval Flow',
      'Standard leave request approval flow',
      [
        {
          order: 1,
          name: 'Submit Request',
          action: 'submit',
          expectedOutcome: 'submitted',
          timeoutSeconds: 60,
        },
        {
          order: 2,
          name: 'Manager Review',
          action: 'approve',
          expectedOutcome: 'approved',
          timeoutSeconds: 86400,
        },
        {
          order: 3,
          name: 'HR Approval',
          action: 'approve',
          expectedOutcome: 'approved',
          timeoutSeconds: 43200,
        },
      ],
    );

    expect(template.id).toBeTruthy();
    expect(template.organizationId).toBe(orgId);
    expect(template.scenario).toBe('workflow_automation');
    expect(template.steps.length).toBe(3);
  });

  // ── 3. Happy path simulation ──────────────────────────────────────────────
  it('3. Happy path simulation runs and returns a result', async () => {
    const svc = new HappyPathService(pool);

    const template = await svc.registerTemplate(
      orgId,
      'approval_routing',
      `Sim Test ${crypto.randomUUID().slice(0, 8)}`,
      'Simulation test template',
      [{ order: 1, name: 'Step One', action: 'run', expectedOutcome: 'done', timeoutSeconds: 60 }],
    );

    const simulation = await svc.runSimulation(orgId, template.id);
    expect(simulation.id).toBeTruthy();
    expect(simulation.templateId).toBe(template.id);
    expect(['pass', 'fail', 'skipped']).toContain(simulation.result);
  });

  // ── 4. Failure recording ──────────────────────────────────────────────────
  it('4. Failure recording creates a retrievable failure record', async () => {
    const svc = new FailureRegistryService(pool);

    const failure = await svc.recordFailure(
      orgId,
      'workflow_failure',
      'high',
      'Approval workflow stuck at step 2 for 3 days',
      { workflowId: 'wf-001', stuckStep: 2 },
    );

    expect(failure.id).toBeTruthy();
    expect(failure.organizationId).toBe(orgId);
    expect(failure.severity).toBe('high');
    expect(failure.status).toBe('open');
  });

  // ── 5. Failure resolution ─────────────────────────────────────────────────
  it('5. Failure resolution transitions status to recovered', async () => {
    const svc = new FailureRegistryService(pool);

    const failure = await svc.recordFailure(
      orgId,
      'approval_failure',
      'medium',
      'SLA breach on expense approval',
    );

    const resolved = await svc.resolveFailure(orgId, failure.id, actorId);
    expect(resolved.status).toBe('recovered');
  });

  // ── 6. Failure metrics ────────────────────────────────────────────────────
  it('6. Failure metrics return structured counts', async () => {
    const svc = new FailureRegistryService(pool);
    const metrics = await svc.getFailureMetrics(orgId);
    expect(typeof metrics).toBe('object');
  });

  // ── 7. Reliability score computation ─────────────────────────────────────
  it('7. Reliability score computation returns a report', async () => {
    const svc = new ReliabilityScoreService(pool);
    const report = await svc.computeScore(orgId);
    expect(report).toBeDefined();
    expect(report.organizationId).toBe(orgId);
    expect(typeof report.overallScore).toBe('number');
  });

  // ── 8. Score within bounds ────────────────────────────────────────────────
  it('8. Reliability score is within [0, 100]', async () => {
    const svc = new ReliabilityScoreService(pool);
    const report = await svc.computeScore(orgId);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  // ── 9. Cross-tenant isolation ─────────────────────────────────────────────
  it('9. Org B cannot see org A failure records', async () => {
    const svc = new FailureRegistryService(pool);

    await svc.recordFailure(orgId, 'data_integrity_failure', 'critical', 'Isolation test failure');

    const failuresB = await svc.listFailures(orgIdB);
    const leaked = failuresB.some((f) => f.organizationId === orgId);
    expect(leaked).toBe(false);
  });

  // ── 10. Latest report retrieval ───────────────────────────────────────────
  it('10. Latest reliability report is retrievable after computation', async () => {
    const svc = new ReliabilityScoreService(pool);
    await svc.computeScore(orgId);

    const latest = await svc.getLatestReport(orgId);
    expect(latest).not.toBeNull();
    expect(latest?.organizationId).toBe(orgId);
    expect(typeof latest?.overallScore).toBe('number');
  });
});
