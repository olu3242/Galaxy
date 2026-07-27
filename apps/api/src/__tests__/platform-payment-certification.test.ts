/**
 * Platform Payment OS Certification Test Suite — Phase 67
 *
 * Certifies PaymentService:
 * 1.  recordPayment creates a pending payment
 * 2.  recordPayment with status 'succeeded' sets paidAt
 * 3.  listPayments returns payments for the org
 * 4.  listPayments respects limit
 * 5.  issueCredit creates a credit record
 * 6.  issueCredit with expiresAt stores the expiration date
 * 7.  recordPayment with explicit currency stores it
 * 8.  recordPayment with invoiceId associates it
 * 9.  recordPayment with status 'failed' does not set paidAt
 * 10. Cross-tenant isolation — org B payments not in org A list
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { PaymentService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-6701-4000-8000-670000000001';
const orgIdB = '00000000-6701-4000-8000-670000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Payment Phase 67 Org A', 'payment-phase67-a', 'starter', 'active'),
            ($2, 'Payment Phase 67 Org B', 'payment-phase67-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM credits WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM payments WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Payment OS Certification', () => {
  // ── 1. recordPayment creates pending payment ──────────────────────────────
  it('1. recordPayment creates a pending payment', async () => {
    const svc = new PaymentService(pool);
    const payment = await svc.recordPayment({ organizationId: orgId, amountCents: 4900 });
    expect(payment).toBeTruthy();
    expect(payment.id).toBeTruthy();
    expect(payment.organizationId).toBe(orgId);
    expect(payment.amountCents).toBe(4900);
    expect(payment.status).toBe('pending');
  });

  // ── 2. succeeded payment sets paidAt ─────────────────────────────────────
  it('2. recordPayment with status succeeded sets paidAt', async () => {
    const svc = new PaymentService(pool);
    const payment = await svc.recordPayment({
      organizationId: orgId,
      amountCents: 9900,
      status: 'succeeded',
    });
    expect(payment.status).toBe('succeeded');
    expect(payment.paidAt).toBeTruthy();
  });

  // ── 3. listPayments returns payments ─────────────────────────────────────
  it('3. listPayments returns payments for the org', async () => {
    const svc = new PaymentService(pool);
    const payments = await svc.listPayments(orgId);
    expect(Array.isArray(payments)).toBe(true);
    expect(payments.length).toBeGreaterThanOrEqual(2);
    expect(payments.every((p) => p.organizationId === orgId)).toBe(true);
  });

  // ── 4. listPayments respects limit ───────────────────────────────────────
  it('4. listPayments respects limit option', async () => {
    const svc = new PaymentService(pool);
    const payments = await svc.listPayments(orgId, { limit: 1 });
    expect(payments.length).toBeLessThanOrEqual(1);
  });

  // ── 5. issueCredit creates a credit ──────────────────────────────────────
  it('5. issueCredit creates a credit record', async () => {
    const svc = new PaymentService(pool);
    const credit = await svc.issueCredit({
      organizationId: orgId,
      amountCents: 1000,
      reason: 'Phase 67 certification credit',
    });
    expect(credit).toBeTruthy();
    expect(credit.id).toBeTruthy();
    expect(credit.organizationId).toBe(orgId);
    expect(credit.amountCents).toBe(1000);
    expect(credit.reason).toBe('Phase 67 certification credit');
  });

  // ── 6. issueCredit with expiresAt ────────────────────────────────────────
  it('6. issueCredit with expiresAt stores the expiration date', async () => {
    const svc = new PaymentService(pool);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const credit = await svc.issueCredit({
      organizationId: orgId,
      amountCents: 500,
      reason: 'Expiring credit',
      expiresAt,
    });
    expect(credit.expiresAt).toBeTruthy();
  });

  // ── 7. recordPayment with explicit currency ───────────────────────────────
  it('7. recordPayment with explicit currency stores it', async () => {
    const svc = new PaymentService(pool);
    const payment = await svc.recordPayment({
      organizationId: orgId,
      amountCents: 2000,
      currency: 'EUR',
    });
    expect(payment.currency).toBe('EUR');
  });

  // ── 8. recordPayment with invoiceId ──────────────────────────────────────
  it('8. recordPayment with invoiceId associates it', async () => {
    const svc = new PaymentService(pool);
    const fakeInvoiceId = '00000000-6701-4000-8000-670000000099';
    const payment = await svc.recordPayment({
      organizationId: orgId,
      amountCents: 3000,
      invoiceId: fakeInvoiceId,
    });
    expect(payment.invoiceId).toBe(fakeInvoiceId);
  });

  // ── 9. failed payment does not set paidAt ────────────────────────────────
  it('9. recordPayment with status failed does not set paidAt', async () => {
    const svc = new PaymentService(pool);
    const payment = await svc.recordPayment({
      organizationId: orgId,
      amountCents: 1500,
      status: 'failed',
    });
    expect(payment.status).toBe('failed');
    expect(payment.paidAt).toBeNull();
  });

  // ── 10. Cross-tenant isolation ───────────────────────────────────────────
  it('10. Org B payments are not visible in org A listPayments', async () => {
    const svc = new PaymentService(pool);
    await svc.recordPayment({ organizationId: orgIdB, amountCents: 7700 });
    const paymentsA = await svc.listPayments(orgId);
    const paymentsB = await svc.listPayments(orgIdB);
    expect(paymentsA.every((p) => p.organizationId === orgId)).toBe(true);
    expect(paymentsB.every((p) => p.organizationId === orgIdB)).toBe(true);
    expect(paymentsA.some((p) => p.organizationId === orgIdB)).toBe(false);
  });
});
