/**
 * Invoice Service Certification Test Suite — Phase 87
 *
 * Certifies InvoiceService from @galaxy/platform:
 * 1.  createInvoice creates an invoice
 * 2.  invoice has correct organizationId and amountCents
 * 3.  invoice defaults to USD currency
 * 4.  listInvoices returns invoices for org
 * 5.  listInvoices respects limit
 * 6.  markPaid updates status to paid
 * 7.  markPaid sets paidAt timestamp
 * 8.  addItem adds an item to an invoice
 * 9.  addItem has correct description and unitPriceCents
 * 10. Cross-org: listInvoices returns correct invoices per org
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { InvoiceService, type Invoice, type InvoiceItem } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-8701-4000-8000-870100000001';
const orgIdB = '00000000-8701-4000-8000-870100000002';
const orgIdC = '00000000-8701-4000-8000-870100000003';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Invoice Phase 87 Org A', 'invoice-phase87-a', 'starter', 'active'),
            ($2, 'Invoice Phase 87 Org B', 'invoice-phase87-b', 'starter', 'active'),
            ($3, 'Invoice Phase 87 Org C', 'invoice-phase87-c', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB, orgIdC],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM invoice_items WHERE organization_id IN ($1, $2, $3)`, [
      orgId,
      orgIdB,
      orgIdC,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM invoices WHERE organization_id IN ($1, $2, $3)`, [orgId, orgIdB, orgIdC])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2, $3)`, [orgId, orgIdB, orgIdC])
    .catch(() => null);
  await pool.end();
});

describe('Invoice Service Certification', () => {
  let invoiceId: string;

  // ── 1. createInvoice creates an invoice ───────────────────────────────────
  it('1. createInvoice creates an invoice', async () => {
    const svc = new InvoiceService(pool);
    const invoice: Invoice = await svc.createInvoice({
      organizationId: orgId,
      amountCents: 5000,
    });
    expect(invoice).toBeTruthy();
    expect(invoice.id).toBeTruthy();
    expect(invoice.status).toBe('draft');
    invoiceId = invoice.id;
  });

  // ── 2. invoice has correct organizationId and amountCents ─────────────────
  it('2. invoice has correct organizationId and amountCents', async () => {
    const svc = new InvoiceService(pool);
    const invoice: Invoice = await svc.createInvoice({
      organizationId: orgIdB,
      amountCents: 9900,
    });
    expect(invoice.organizationId).toBe(orgIdB);
    expect(invoice.amountCents).toBe(9900);
  });

  // ── 3. invoice defaults to USD currency ───────────────────────────────────
  it('3. createInvoice defaults currency to USD', async () => {
    const svc = new InvoiceService(pool);
    const invoice: Invoice = await svc.createInvoice({
      organizationId: orgIdC,
      amountCents: 1000,
    });
    expect(invoice.currency).toBe('USD');
  });

  // ── 4. listInvoices returns invoices for org ──────────────────────────────
  it('4. listInvoices returns invoices for the org', async () => {
    const svc = new InvoiceService(pool);
    const invoices: Invoice[] = await svc.listInvoices(orgId);
    expect(Array.isArray(invoices)).toBe(true);
    expect(invoices.length).toBeGreaterThan(0);
    expect(invoices.every((inv) => inv.organizationId === orgId)).toBe(true);
  });

  // ── 5. listInvoices respects limit ────────────────────────────────────────
  it('5. listInvoices respects limit', async () => {
    const svc = new InvoiceService(pool);
    const invoices: Invoice[] = await svc.listInvoices(orgId, { limit: 1 });
    expect(invoices.length).toBeLessThanOrEqual(1);
  });

  // ── 6. markPaid updates status to paid ────────────────────────────────────
  it('6. markPaid updates status to paid', async () => {
    const svc = new InvoiceService(pool);
    const updated: Invoice | null = await svc.markPaid(invoiceId);
    expect(updated).toBeTruthy();
    expect(updated?.status).toBe('paid');
  });

  // ── 7. markPaid sets paidAt timestamp ─────────────────────────────────────
  it('7. markPaid sets paidAt timestamp', async () => {
    const svc = new InvoiceService(pool);
    const invoices: Invoice[] = await svc.listInvoices(orgId, { status: 'paid' });
    const paid = invoices.find((inv) => inv.id === invoiceId);
    expect(paid).toBeTruthy();
    expect(paid?.paidAt).toBeTruthy();
  });

  // ── 8. addItem adds an item to an invoice ─────────────────────────────────
  it('8. addItem adds an item to an invoice', async () => {
    const svc = new InvoiceService(pool);
    const invoice: Invoice = await svc.createInvoice({
      organizationId: orgId,
      amountCents: 2000,
    });
    const item: InvoiceItem = await svc.addItem({
      invoiceId: invoice.id,
      organizationId: orgId,
      description: 'Starter seat',
      quantity: 1,
      unitPriceCents: 2000,
    });
    expect(item).toBeTruthy();
    expect(item.id).toBeTruthy();
    expect(item.invoiceId).toBe(invoice.id);
  });

  // ── 9. addItem has correct description and unitPriceCents ─────────────────
  it('9. addItem has correct description and unitPriceCents', async () => {
    const svc = new InvoiceService(pool);
    const invoice: Invoice = await svc.createInvoice({
      organizationId: orgIdB,
      amountCents: 4000,
    });
    const item: InvoiceItem = await svc.addItem({
      invoiceId: invoice.id,
      organizationId: orgIdB,
      description: 'Growth plan',
      quantity: 2,
      unitPriceCents: 2000,
    });
    expect(item.description).toBe('Growth plan');
    expect(item.unitPriceCents).toBe(2000);
    expect(item.quantity).toBe(2);
  });

  // ── 10. Cross-org: listInvoices per org ───────────────────────────────────
  it('10. listInvoices returns correct invoices per org', async () => {
    const svc = new InvoiceService(pool);
    const invoicesA: Invoice[] = await svc.listInvoices(orgId);
    const invoicesB: Invoice[] = await svc.listInvoices(orgIdB);
    expect(invoicesA.every((inv) => inv.organizationId === orgId)).toBe(true);
    expect(invoicesB.every((inv) => inv.organizationId === orgIdB)).toBe(true);
    expect(invoicesA.length).toBeGreaterThan(0);
    expect(invoicesB.length).toBeGreaterThan(0);
  });
});
