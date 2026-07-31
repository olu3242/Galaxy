/**
 * Billing OS Certification Test Suite
 *
 * Certifies the Billing module lifecycle:
 * 1.  plans and subscriptions tables exist
 * 2.  Plan creation persists a plan record
 * 3.  Plan listing returns available plans
 * 4.  Subscription creation links plan to org
 * 5.  Subscription retrieval returns the active subscription
 * 6.  Usage event recording persists a record
 * 7.  Usage summary is computable
 * 8.  Invoice generation creates an open invoice
 * 9.  Invoice listing is tenant-scoped
 * 10. Cross-tenant isolation — org B cannot see org A invoices
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  PlanService,
  SubscriptionService,
  UsageMeteringService,
  InvoiceService,
} from '@galaxy/billing';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2201-4000-8000-220000000001';
const orgIdB = '00000000-2201-4000-8000-220000000002';

let sharedPlanId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Billing Test Org A', 'billing-test-a', 'starter', 'active'),
            ($2, 'Billing Test Org B', 'billing-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const planSvc = new PlanService(pool);
  const plan = await planSvc.createPlan({
    name: `Certification Plan ${crypto.randomUUID().slice(0, 8)}`,
    tier: 'starter',
    monthlyPriceCents: 2900,
    annualPriceCents: 29000,
    maxMembers: 10,
    maxWorkflows: 50,
    maxAgents: 5,
    apiCallsPerMonth: 10000,
    storageMb: 1024,
  });
  sharedPlanId = plan.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM invoices WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM usage_events WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM subscriptions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.query(`DELETE FROM plans WHERE id = $1`, [sharedPlanId]).catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Billing OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. plans and subscriptions tables exist', async () => {
    for (const table of ['plans', 'subscriptions']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Plan creation ──────────────────────────────────────────────────────
  it('2. Plan creation persists a plan record', async () => {
    const svc = new PlanService(pool);

    const plan = await svc.createPlan({
      name: `Pro Plan ${crypto.randomUUID().slice(0, 8)}`,
      tier: 'professional',
      monthlyPriceCents: 9900,
      annualPriceCents: 99000,
      maxMembers: 50,
      maxWorkflows: 500,
      maxAgents: 25,
      apiCallsPerMonth: 100000,
      storageMb: 10240,
    });

    expect(plan.id).toBeTruthy();
    expect(plan.tier).toBe('professional');
    expect(plan.monthlyPriceCents).toBe(9900);

    await svc.deactivatePlan(plan.id);
  });

  // ── 3. Plan listing ───────────────────────────────────────────────────────
  it('3. Plan listing returns available plans', async () => {
    const svc = new PlanService(pool);

    const plans = await svc.listPlans(true);
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      expect(p.id).toBeTruthy();
      expect(p.tier).toBeTruthy();
    }
  });

  // ── 4. Subscription creation ──────────────────────────────────────────────
  it('4. Subscription creation links plan to org', async () => {
    const svc = new SubscriptionService(pool);

    const sub = await svc.createSubscription({
      organizationId: orgId,
      planId: sharedPlanId,
    });

    expect(sub.id).toBeTruthy();
    expect(sub.organizationId).toBe(orgId);
    expect(sub.planId).toBe(sharedPlanId);
    expect(['active', 'trialing']).toContain(sub.status);
  });

  // ── 5. Subscription retrieval ─────────────────────────────────────────────
  it('5. Subscription retrieval returns the active subscription', async () => {
    const svc = new SubscriptionService(pool);

    const sub = await svc.getSubscription(orgId);
    expect(sub).not.toBeNull();
    expect(sub?.organizationId).toBe(orgId);
    expect(sub?.planId).toBe(sharedPlanId);
  });

  // ── 6. Usage event recording ──────────────────────────────────────────────
  it('6. Usage event recording persists a record', async () => {
    const subSvc = new SubscriptionService(pool);
    const usageSvc = new UsageMeteringService(pool);

    const sub = await subSvc.getSubscription(orgId);
    if (!sub) throw new Error('No subscription found for orgId');

    const event = await usageSvc.recordUsage({
      organizationId: orgId,
      subscriptionId: sub.id,
      eventType: 'workflow_run',
      quantity: 1,
    });

    expect(event.id).toBeTruthy();
    expect(event.organizationId).toBe(orgId);
    expect(event.eventType).toBe('workflow_run');
  });

  // ── 7. Usage summary ─────────────────────────────────────────────────────
  it('7. Usage summary is computable', async () => {
    const subSvc = new SubscriptionService(pool);
    const usageSvc = new UsageMeteringService(pool);

    const sub = await subSvc.getSubscription(orgId);
    if (!sub) throw new Error('No subscription found for orgId');

    const period = {
      start: new Date(Date.now() - 30 * 86400000).toISOString(),
      end: new Date().toISOString(),
    };

    const summary = await usageSvc.getUsageSummary(orgId, sub.id, period);
    expect(summary.organizationId).toBe(orgId);
    expect(typeof summary.workflowRuns).toBe('number');
    expect(summary.workflowRuns).toBeGreaterThanOrEqual(0);
  });

  // ── 8. Invoice generation ─────────────────────────────────────────────────
  it('8. Invoice generation creates an open invoice', async () => {
    const subSvc = new SubscriptionService(pool);
    const invoiceSvc = new InvoiceService(pool);

    const sub = await subSvc.getSubscription(orgId);
    if (!sub) throw new Error('No subscription found for orgId');

    const invoice = await invoiceSvc.generateInvoice({
      organizationId: orgId,
      subscriptionId: sub.id,
      periodStart: new Date(Date.now() - 30 * 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    expect(invoice.id).toBeTruthy();
    expect(invoice.organizationId).toBe(orgId);
    expect(invoice.status).toBe('open');
  });

  // ── 9. Invoice listing ────────────────────────────────────────────────────
  it('9. Invoice listing is tenant-scoped', async () => {
    const invoiceSvc = new InvoiceService(pool);

    const invoices = await invoiceSvc.listByOrg(orgId);
    expect(Array.isArray(invoices)).toBe(true);
    expect(invoices.length).toBeGreaterThan(0);
    for (const inv of invoices) {
      expect(inv.organizationId).toBe(orgId);
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A invoices', async () => {
    const invoiceSvc = new InvoiceService(pool);

    const invoicesB = await invoiceSvc.listByOrg(orgIdB);
    const leaked = invoicesB.some((i) => i.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
