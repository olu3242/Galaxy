/**
 * Platform Billing OS Certification Test Suite
 *
 * Certifies the billing, invoice, subscription, and plan services:
 * 1.  createAccount returns a BillingAccount with status 'active'
 * 2.  getAccount retrieves billing account by org ID
 * 3.  createInvoice defaults to status 'draft'
 * 4.  listInvoices returns invoices filtered by org
 * 5.  addItem persists an invoice line item
 * 6.  markPaid transitions invoice to 'paid'
 * 7.  createPlan persists a billing plan
 * 8.  createSubscription defaults to status 'active' and creates a subscription event
 * 9.  getSubscription returns the active subscription
 * 10. Cross-tenant isolation — org B invoices not visible to org A query
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { BillingService, InvoiceService, SubscriptionService, PlanService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-5401-4000-8000-540000000001';
const orgIdB = '00000000-5401-4000-8000-540000000002';
let invoiceId: string;
let planId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Billing Test Org A', 'billing-test-a', 'starter', 'active'),
            ($2, 'Billing Test Org B', 'billing-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM subscription_events WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM subscriptions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM invoice_items WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM invoices WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM billing_profiles WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM billing_accounts WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  if (planId) {
    await pool.query(`DELETE FROM plans WHERE id = $1`, [planId]).catch(() => null);
  }
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Billing OS Certification', () => {
  // ── 1. createAccount returns BillingAccount ───────────────────────────────
  it('1. createAccount returns a BillingAccount with status active', async () => {
    const svc = new BillingService(pool);
    const account = await svc.createAccount({ organizationId: orgId });
    expect(account).toBeTruthy();
    expect(account.organizationId).toBe(orgId);
    expect(account.status).toBe('active');
  });

  // ── 2. getAccount retrieves by org ID ────────────────────────────────────
  it('2. getAccount retrieves billing account by org ID', async () => {
    const svc = new BillingService(pool);
    const account = await svc.getAccount(orgId);
    expect(account).not.toBeNull();
    expect(account?.organizationId).toBe(orgId);
  });

  // ── 3. createInvoice defaults to draft ───────────────────────────────────
  it('3. createInvoice defaults to status draft', async () => {
    const svc = new InvoiceService(pool);
    const invoice = await svc.createInvoice({ organizationId: orgId, amountCents: 5000 });
    expect(invoice).toBeTruthy();
    expect(invoice.status).toBe('draft');
    expect(invoice.amountCents).toBe(5000);
    invoiceId = invoice.id;
  });

  // ── 4. listInvoices filters by org ───────────────────────────────────────
  it('4. listInvoices returns invoices filtered by org', async () => {
    const svc = new InvoiceService(pool);
    const invoices = await svc.listInvoices(orgId);
    expect(invoices.length).toBeGreaterThan(0);
    expect(invoices.every((i) => i.organizationId === orgId)).toBe(true);
  });

  // ── 5. addItem persists a line item ──────────────────────────────────────
  it('5. addItem persists an invoice line item', async () => {
    const svc = new InvoiceService(pool);
    const item = await svc.addItem({
      invoiceId,
      organizationId: orgId,
      description: 'Monthly subscription',
      quantity: 1,
      unitPriceCents: 5000,
    });
    expect(item).toBeTruthy();
    expect(item.invoiceId).toBe(invoiceId);
    expect(item.quantity).toBe(1);
  });

  // ── 6. markPaid transitions to paid ──────────────────────────────────────
  it('6. markPaid transitions invoice to paid', async () => {
    const svc = new InvoiceService(pool);
    const paid = await svc.markPaid(invoiceId);
    expect(paid).not.toBeNull();
    expect(paid?.status).toBe('paid');
    expect(paid?.paidAt).toBeTruthy();
  });

  // ── 7. createPlan persists a billing plan ────────────────────────────────
  it('7. createPlan persists a billing plan', async () => {
    const svc = new PlanService(pool);
    const plan = await svc.createPlan({
      name: `billing-cert-plan-${String(Date.now())}`,
      displayName: 'Billing Cert Plan',
      priceCentsMonthly: 2900,
      priceCentsAnnual: 29000,
    });
    expect(plan).toBeTruthy();
    expect(plan.active).toBe(true);
    expect(plan.priceCentsMonthly).toBe(2900);
    planId = plan.id;
  });

  // ── 8. createSubscription defaults to active + creates event ─────────────
  it('8. createSubscription defaults to status active and creates a subscription event', async () => {
    const svc = new SubscriptionService(pool);
    const sub = await svc.createSubscription({ organizationId: orgId, planId });
    expect(sub).toBeTruthy();
    expect(sub.status).toBe('active');

    const events = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM subscription_events WHERE subscription_id = $1`,
      [sub.id],
    );
    expect(events.rows.length).toBeGreaterThan(0);
    expect(events.rows[0]?.event_type).toBe('created');
  });

  // ── 9. getSubscription returns active subscription ────────────────────────
  it('9. getSubscription returns the active subscription', async () => {
    const svc = new SubscriptionService(pool);
    const sub = await svc.getSubscription(orgId);
    expect(sub).not.toBeNull();
    expect(sub?.organizationId).toBe(orgId);
    expect(sub?.status).toBe('active');
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B invoices are not visible to org A invoice query', async () => {
    const svc = new InvoiceService(pool);
    await svc.createInvoice({ organizationId: orgIdB, amountCents: 9900 });
    const invoicesA = await svc.listInvoices(orgId);
    const invoicesB = await svc.listInvoices(orgIdB);
    expect(invoicesA.every((i) => i.organizationId === orgId)).toBe(true);
    expect(invoicesB.every((i) => i.organizationId === orgIdB)).toBe(true);
    expect(invoicesA.some((i) => i.organizationId === orgIdB)).toBe(false);
  });
});
