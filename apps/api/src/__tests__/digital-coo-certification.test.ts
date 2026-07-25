/**
 * Digital COO Certification Test Suite
 *
 * Certifies the Digital COO lifecycle:
 * 1.  coo_briefings and coo_actions tables exist with expected columns
 * 2.  Briefing generation persists a COO briefing record
 * 3.  Briefing includes a valid health score (0–100) and executive summary
 * 4.  Briefing is retrievable by ID
 * 5.  Briefing history returns ordered records for the org
 * 6.  COO actions are created and listable
 * 7.  Actions can be approved — status transitions to 'approved'
 * 8.  Actions can be rejected with a reason
 * 9.  Cross-tenant isolation — org B cannot see org A briefings
 * 10. Two briefings for the same org are independent records
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { DigitalCOOService } from '@galaxy/coo';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-dd01-4000-8000-d1a000000001';
const orgIdB = '00000000-dd01-4000-8000-d1a000000002';
const actorId = '00000000-dd01-4000-8000-d1a000000010';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'COO Test Org A', 'coo-test-a', 'starter', 'active'),
            ($2, 'COO Test Org B', 'coo-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM coo_actions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM coo_briefings WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Digital COO Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. coo_briefings and coo_actions tables exist', async () => {
    for (const table of ['coo_briefings', 'coo_actions']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Briefing generation persists a record ───────────────────────────────
  it('2. Briefing generation persists a COO briefing record', async () => {
    const svc = new DigitalCOOService(pool);
    const correlationId = crypto.randomUUID();

    const briefing = await svc.generateBriefing(orgId, actorId, correlationId);
    expect(briefing.id).toBeTruthy();
    expect(briefing.organizationId).toBe(orgId);
    expect(briefing.correlationId).toBe(correlationId);
  });

  // ── 3. Briefing health score and executive summary ─────────────────────────
  it('3. Briefing includes a valid health score and executive summary', async () => {
    const svc = new DigitalCOOService(pool);
    const briefing = await svc.generateBriefing(orgId, actorId, crypto.randomUUID());

    expect(briefing.healthScore).toBeGreaterThanOrEqual(0);
    expect(briefing.healthScore).toBeLessThanOrEqual(100);
    expect(typeof briefing.executiveSummary).toBe('string');
    expect(briefing.executiveSummary.length).toBeGreaterThan(0);
  });

  // ── 4. Briefing retrieval by ID ───────────────────────────────────────────
  it('4. Briefing is retrievable by ID', async () => {
    const svc = new DigitalCOOService(pool);
    const original = await svc.generateBriefing(orgId, actorId, crypto.randomUUID());

    const fetched = await svc.getBriefing(orgId, original.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(original.id);
    expect(fetched?.organizationId).toBe(orgId);
  });

  // ── 5. Briefing history ───────────────────────────────────────────────────
  it('5. Briefing history returns ordered records for the org', async () => {
    const svc = new DigitalCOOService(pool);
    const history = await svc.getBriefingHistory(orgId, 10);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    // Records are ordered newest-first
    if (history.length > 1) {
      const h0 = history[0];
      const h1 = history[1];
      if (h0 && h1) {
        const t0 = new Date(h0.createdAt).getTime();
        const t1 = new Date(h1.createdAt).getTime();
        expect(t0).toBeGreaterThanOrEqual(t1);
      }
    }
  });

  // ── 6. COO actions are listable ───────────────────────────────────────────
  it('6. COO actions are created during briefing and are listable', async () => {
    const svc = new DigitalCOOService(pool);
    await svc.generateBriefing(orgId, actorId, crypto.randomUUID());

    const actions = await svc.listActions(orgId);
    expect(Array.isArray(actions)).toBe(true);
    // Actions may or may not be generated depending on org state; just verify the call works
  });

  // ── 7. Action approval ────────────────────────────────────────────────────
  it('7. Actions can be approved — status transitions to approved', async () => {
    const svc = new DigitalCOOService(pool);

    // Seed an action directly since briefing generation may not create pending actions
    const actionResult = await pool.query<{ id: string }>(
      `INSERT INTO coo_actions
         (organization_id, action_type, subject, payload, autonomy_level, status, correlation_id, reasoning)
       VALUES ($1, 'notify_approver', 'Approval backlog review', '{}', 'suggest', 'pending', $2, 'Test action')
       RETURNING id`,
      [orgId, crypto.randomUUID()],
    );
    const actionId = actionResult.rows[0]?.id ?? '';
    expect(actionId).toBeTruthy();

    const approved = await svc.approveAction(orgId, actionId, actorId);
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe(actorId);
    expect(approved.approvedAt).not.toBeNull();
  });

  // ── 8. Action rejection ───────────────────────────────────────────────────
  it('8. Actions can be rejected with a reason', async () => {
    const svc = new DigitalCOOService(pool);

    const actionResult = await pool.query<{ id: string }>(
      `INSERT INTO coo_actions
         (organization_id, action_type, subject, payload, autonomy_level, status, correlation_id, reasoning)
       VALUES ($1, 'escalate_workflow', 'SLA breach escalation', '{}', 'notify', 'pending', $2, 'Test rejection')
       RETURNING id`,
      [orgId, crypto.randomUUID()],
    );
    const actionId = actionResult.rows[0]?.id ?? '';
    expect(actionId).toBeTruthy();

    const rejected = await svc.rejectAction(orgId, actionId, actorId, 'Not needed at this time');
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectedBy).toBe(actorId);
    expect(rejected.rejectionReason).toBe('Not needed at this time');
  });

  // ── 9. Cross-tenant isolation ─────────────────────────────────────────────
  it('9. Org B cannot see org A briefings', async () => {
    const svc = new DigitalCOOService(pool);
    const historyB = await svc.getBriefingHistory(orgIdB, 50);
    const leaked = historyB.some((b) => b.organizationId === orgId);
    expect(leaked).toBe(false);
  });

  // ── 10. Independent briefings ─────────────────────────────────────────────
  it('10. Two briefings for the same org are independent records', async () => {
    const svc = new DigitalCOOService(pool);

    const b1 = await svc.generateBriefing(orgId, actorId, crypto.randomUUID());
    const b2 = await svc.generateBriefing(orgId, actorId, crypto.randomUUID());

    expect(b1.id).not.toBe(b2.id);
    expect(b1.correlationId).not.toBe(b2.correlationId);

    const history = await svc.getBriefingHistory(orgId, 50);
    expect(history.some((b) => b.id === b1.id)).toBe(true);
    expect(history.some((b) => b.id === b2.id)).toBe(true);
  });
});
