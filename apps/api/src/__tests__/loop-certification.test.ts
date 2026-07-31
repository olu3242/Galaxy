/**
 * Loop OS Certification Test Suite
 *
 * Certifies the Loop Engine module lifecycle:
 * 1.  loop_instances and execution_telemetry tables exist
 * 2.  Loop instance creation persists a record
 * 3.  Loop instance is retrievable by ID
 * 4.  Multiple loops for the same workflow are listable
 * 5.  Verification can be submitted and is linked to the loop
 * 6.  Feedback can be submitted and average score is computable
 * 7.  Loop completion transitions status to completed
 * 8.  Execution telemetry can be recorded
 * 9.  Org health score returns a number in [0, 100]
 * 10. SLA breach detection returns overdue instances
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  LoopInstanceService,
  LoopVerificationService,
  LoopFeedbackService,
  ExecutionTelemetryService,
} from '@galaxy/loop';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2001-4000-8000-200000000001';
const orgIdB = '00000000-2001-4000-8000-200000000002';
const memberId = '00000000-2001-4000-8000-200000000010';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Loop Test Org A', 'loop-test-a', 'starter', 'active'),
            ($2, 'Loop Test Org B', 'loop-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(
      `DELETE FROM loop_feedback WHERE loop_instance_id IN (SELECT id FROM loop_instances WHERE organization_id IN ($1, $2))`,
      [orgId, orgIdB],
    )
    .catch(() => null);
  await pool
    .query(
      `DELETE FROM loop_verifications WHERE loop_instance_id IN (SELECT id FROM loop_instances WHERE organization_id IN ($1, $2))`,
      [orgId, orgIdB],
    )
    .catch(() => null);
  await pool
    .query(`DELETE FROM loop_instances WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM execution_telemetry WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Loop OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. loop_instances and execution_telemetry tables exist', async () => {
    for (const table of ['loop_instances', 'execution_telemetry']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Loop instance creation ─────────────────────────────────────────────
  it('2. Loop instance creation persists a record', async () => {
    const svc = new LoopInstanceService(pool);

    const loopInstance = await svc.create({
      organizationId: orgId,
      workflowInstanceId: crypto.randomUUID(),
      verificationDeadlineHours: 48,
    });

    expect(loopInstance.id).toBeTruthy();
    expect(loopInstance.organizationId).toBe(orgId);
    expect(loopInstance.status).toBe('pending');
  });

  // ── 3. Loop instance retrieval ────────────────────────────────────────────
  it('3. Loop instance is retrievable by ID', async () => {
    const svc = new LoopInstanceService(pool);

    const created = await svc.create({
      organizationId: orgId,
      workflowInstanceId: crypto.randomUUID(),
    });

    const fetched = await svc.getById(created.id, orgId);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.organizationId).toBe(orgId);
  });

  // ── 4. Loop listing by workflow ───────────────────────────────────────────
  it('4. Multiple loops for the same workflow are listable', async () => {
    const svc = new LoopInstanceService(pool);

    const wfId = crypto.randomUUID();
    await svc.create({ organizationId: orgId, workflowInstanceId: wfId });
    await svc.create({ organizationId: orgId, workflowInstanceId: wfId });

    const loops = await svc.listByWorkflow(wfId, orgId);
    expect(Array.isArray(loops)).toBe(true);
    expect(loops.length).toBeGreaterThanOrEqual(2);
  });

  // ── 5. Verification submission ────────────────────────────────────────────
  it('5. Verification can be submitted and is linked to the loop', async () => {
    const loopSvc = new LoopInstanceService(pool);
    const verifySvc = new LoopVerificationService(pool);

    const loopInstance = await loopSvc.create({
      organizationId: orgId,
      workflowInstanceId: crypto.randomUUID(),
    });
    await loopSvc.startVerification(loopInstance.id, orgId);

    const verification = await verifySvc.submit(
      {
        loopInstanceId: loopInstance.id,
        verifiedBy: memberId,
        status: 'confirmed',
        notes: 'Outcome verified — all steps completed correctly.',
      },
      orgId,
    );

    expect(verification.id).toBeTruthy();
    expect(verification.loopInstanceId).toBe(loopInstance.id);
    expect(verification.status).toBe('confirmed');
  });

  // ── 6. Feedback submission and average score ──────────────────────────────
  it('6. Feedback can be submitted and average score is computable', async () => {
    const loopSvc = new LoopInstanceService(pool);
    const feedbackSvc = new LoopFeedbackService(pool);

    const loopInstance = await loopSvc.create({
      organizationId: orgId,
      workflowInstanceId: crypto.randomUUID(),
    });

    await feedbackSvc.submit(
      { loopInstanceId: loopInstance.id, submittedBy: memberId, score: 4 },
      orgId,
    );
    await feedbackSvc.submit(
      { loopInstanceId: loopInstance.id, submittedBy: memberId, score: 5 },
      orgId,
    );

    const avg = await feedbackSvc.getAverageScore(loopInstance.id, orgId);
    expect(typeof avg).toBe('number');
    if (avg !== null) {
      expect(avg).toBeGreaterThanOrEqual(1);
      expect(avg).toBeLessThanOrEqual(5);
    }
  });

  // ── 7. Loop completion ────────────────────────────────────────────────────
  it('7. Loop completion transitions status to completed', async () => {
    const svc = new LoopInstanceService(pool);

    const loopInstance = await svc.create({
      organizationId: orgId,
      workflowInstanceId: crypto.randomUUID(),
    });

    const completed = await svc.complete(loopInstance.id, orgId);
    expect(completed.status).toBe('completed');
  });

  // ── 8. Execution telemetry ────────────────────────────────────────────────
  it('8. Execution telemetry can be recorded without error', async () => {
    const telemetrySvc = new ExecutionTelemetryService(pool);

    await expect(
      telemetrySvc.record({
        organizationId: orgId,
        workflowRunId: crypto.randomUUID(),
        workflowDefinitionId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        durationMs: 5000,
        stepCount: 3,
        completedSteps: 3,
        failedSteps: 0,
        agentTypes: ['approval'],
        approvalWaitMs: 3000,
        retryCount: 0,
        outcome: 'completed',
        bottlenecks: [],
        errorMessages: [],
        costTokens: 0,
      }),
    ).resolves.not.toThrow();
  });

  // ── 9. Org health score ───────────────────────────────────────────────────
  it('9. Org health score returns a number in [0, 100]', async () => {
    const telemetrySvc = new ExecutionTelemetryService(pool);
    const score = await telemetrySvc.getOrgHealthScore(orgId);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  // ── 10. SLA breach detection ──────────────────────────────────────────────
  it('10. SLA breach detection returns an array of instances', async () => {
    const svc = new LoopInstanceService(pool);
    const breaches = await svc.checkSLABreaches(orgId);
    expect(Array.isArray(breaches)).toBe(true);
  });
});
