/**
 * AI Deployment OS Certification Test Suite
 *
 * Certifies the AI Deployment module lifecycle:
 * 1.  deployment_plans and deployment_resources tables exist
 * 2.  Deployment plan creation persists a record
 * 3.  Plan retrieval returns the plan
 * 4.  Plan listing is tenant-scoped
 * 5.  Plan analysis transitions status to complete
 * 6.  Analyzed plan has resources
 * 7.  Multiple plans are all listed
 * 8.  Plan listing returns only org's plans
 * 9.  getPlan throws for unknown plan
 * 10. Cross-tenant isolation — org B cannot see org A plans
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { DeploymentPlanService } from '@galaxy/ai-deployment';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4101-4000-8000-410000000001';
const orgIdB = '00000000-4101-4000-8000-410000000002';

let sharedPlanId: string;
let secondPlanId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'AI Deploy Test Org A', 'ai-deploy-test-a', 'starter', 'active'),
            ($2, 'AI Deploy Test Org B', 'ai-deploy-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new DeploymentPlanService(pool);
  const plan = await svc.createPlan(orgId, 'Shared cert plan for finance approvals', 'fintech');
  sharedPlanId = plan.id;

  const plan2 = await svc.createPlan(orgId, 'Second cert plan for HR onboarding', 'hr');
  secondPlanId = plan2.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM deployment_resources WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM deployment_plans WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('AI Deployment OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. deployment_plans and deployment_resources tables exist', async () => {
    for (const table of ['deployment_plans', 'deployment_resources']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Plan creation ──────────────────────────────────────────────────────
  it('2. Deployment plan creation persists a record', async () => {
    const svc = new DeploymentPlanService(pool);

    const plan = await svc.createPlan(orgId, 'Expense approval workflow deployment', 'fintech');

    expect(plan.id).toBeTruthy();
    expect(plan.organizationId).toBe(orgId);
    expect(plan.naturalLanguageDescription).toBe('Expense approval workflow deployment');
    expect(plan.status).toBe('pending');
  });

  // ── 3. Plan retrieval ─────────────────────────────────────────────────────
  it('3. Plan retrieval returns the plan', async () => {
    const svc = new DeploymentPlanService(pool);

    const plan = await svc.getPlan(orgId, sharedPlanId);
    expect(plan.id).toBe(sharedPlanId);
    expect(plan.organizationId).toBe(orgId);
  });

  // ── 4. Plan listing is tenant-scoped ──────────────────────────────────────
  it('4. Plan listing is tenant-scoped', async () => {
    const svc = new DeploymentPlanService(pool);

    const plans = await svc.listPlans(orgId);
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      expect(p.organizationId).toBe(orgId);
    }
  });

  // ── 5. Plan analysis sets status to complete ──────────────────────────────
  it('5. Plan analysis transitions status to complete', async () => {
    const svc = new DeploymentPlanService(pool);

    const analyzed = await svc.analyzePlan(orgId, sharedPlanId);
    expect(analyzed.status).toBe('complete');
  });

  // ── 6. Analyzed plan has resources ───────────────────────────────────────
  it('6. Analyzed plan has resources', async () => {
    const svc = new DeploymentPlanService(pool);

    const plan = await svc.getPlan(orgId, sharedPlanId);
    expect(Array.isArray(plan.resources)).toBe(true);
    expect(plan.resources.length).toBeGreaterThan(0);
  });

  // ── 7. Multiple plans are all listed ─────────────────────────────────────
  it('7. Multiple plans are all listed', async () => {
    const svc = new DeploymentPlanService(pool);

    const plans = await svc.listPlans(orgId);
    const ids = plans.map((p) => p.id);
    expect(ids).toContain(sharedPlanId);
    expect(ids).toContain(secondPlanId);
  });

  // ── 8. Plan listing returns only org's plans ──────────────────────────────
  it('8. Plan listing returns only org A plans', async () => {
    const svc = new DeploymentPlanService(pool);

    const plans = await svc.listPlans(orgId);
    for (const p of plans) {
      expect(p.organizationId).toBe(orgId);
    }
  });

  // ── 9. getPlan throws for unknown plan ────────────────────────────────────
  it('9. getPlan throws for an unknown plan id', async () => {
    const svc = new DeploymentPlanService(pool);

    await expect(svc.getPlan(orgId, '00000000-4101-4000-8000-000000000000')).rejects.toThrow();
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A plans', async () => {
    const svc = new DeploymentPlanService(pool);

    const plansB = await svc.listPlans(orgIdB);
    const leaked = plansB.some((p) => p.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
