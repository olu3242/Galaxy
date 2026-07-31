/**
 * Billing Service Certification Test Suite — Phase 86
 *
 * Certifies BillingService from @galaxy/platform:
 * 1.  createAccount creates a billing account
 * 2.  account has correct organizationId and currency
 * 3.  getAccount returns the account for an org
 * 4.  getAccount returns null for org with no account
 * 5.  listAccounts returns an array
 * 6.  listAccounts respects limit
 * 7.  createProfile creates a billing profile
 * 8.  profile has correct billingName and billingEmail
 * 9.  createAccount defaults to USD currency
 * 10. Cross-org: getAccount returns correct account per org
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { BillingService, type BillingAccount, type BillingProfile } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-8601-4000-8000-860100000001';
const orgIdB = '00000000-8601-4000-8000-860100000002';
const orgIdC = '00000000-8601-4000-8000-860100000003';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Billing Phase 86 Org A', 'billing-phase86-a', 'starter', 'active'),
            ($2, 'Billing Phase 86 Org B', 'billing-phase86-b', 'starter', 'active'),
            ($3, 'Billing Phase 86 Org C', 'billing-phase86-c', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB, orgIdC],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM billing_profiles WHERE organization_id IN ($1, $2, $3)`, [
      orgId,
      orgIdB,
      orgIdC,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM billing_accounts WHERE organization_id IN ($1, $2, $3)`, [
      orgId,
      orgIdB,
      orgIdC,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2, $3)`, [orgId, orgIdB, orgIdC])
    .catch(() => null);
  await pool.end();
});

describe('Billing Service Certification', () => {
  let _accountId: string;

  // ── 1. createAccount creates a billing account ────────────────────────────
  it('1. createAccount creates a billing account', async () => {
    const svc = new BillingService(pool);
    const account: BillingAccount = await svc.createAccount({ organizationId: orgId });
    expect(account).toBeTruthy();
    expect(account.id).toBeTruthy();
    expect(account.status).toBe('active');
    _accountId = account.id;
  });

  // ── 2. account has correct organizationId and currency ────────────────────
  it('2. account has correct organizationId and currency', async () => {
    const svc = new BillingService(pool);
    const account: BillingAccount = await svc.createAccount({
      organizationId: orgIdB,
      currency: 'EUR',
    });
    expect(account.organizationId).toBe(orgIdB);
    expect(account.currency).toBe('EUR');
  });

  // ── 3. getAccount returns account for org ─────────────────────────────────
  it('3. getAccount returns the account for the org', async () => {
    const svc = new BillingService(pool);
    const account: BillingAccount | null = await svc.getAccount(orgId);
    expect(account).toBeTruthy();
    expect(account?.organizationId).toBe(orgId);
  });

  // ── 4. getAccount returns null for org with no account ────────────────────
  it('4. getAccount returns null for org with no account', async () => {
    const svc = new BillingService(pool);
    const account: BillingAccount | null = await svc.getAccount(orgIdC);
    expect(account).toBeNull();
  });

  // ── 5. listAccounts returns an array ──────────────────────────────────────
  it('5. listAccounts returns an array', async () => {
    const svc = new BillingService(pool);
    const accounts: BillingAccount[] = await svc.listAccounts();
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);
  });

  // ── 6. listAccounts respects limit ────────────────────────────────────────
  it('6. listAccounts respects limit', async () => {
    const svc = new BillingService(pool);
    const accounts: BillingAccount[] = await svc.listAccounts({ limit: 1 });
    expect(accounts.length).toBeLessThanOrEqual(1);
  });

  // ── 7. createProfile creates a billing profile ────────────────────────────
  it('7. createProfile creates a billing profile', async () => {
    const svc = new BillingService(pool);
    const profile: BillingProfile = await svc.createProfile({
      organizationId: orgId,
      billingName: 'Acme Corp',
      billingEmail: 'billing@acme.example',
    });
    expect(profile).toBeTruthy();
    expect(profile.id).toBeTruthy();
  });

  // ── 8. profile has correct billingName and billingEmail ───────────────────
  it('8. profile has correct billingName and billingEmail', async () => {
    const svc = new BillingService(pool);
    const profile: BillingProfile = await svc.createProfile({
      organizationId: orgId,
      billingName: 'Certified Corp',
      billingEmail: 'cert@example.com',
    });
    expect(profile.billingName).toBe('Certified Corp');
    expect(profile.billingEmail).toBe('cert@example.com');
    expect(profile.organizationId).toBe(orgId);
  });

  // ── 9. createAccount defaults to USD ──────────────────────────────────────
  it('9. createAccount defaults currency to USD', async () => {
    const svc = new BillingService(pool);
    const account: BillingAccount = await svc.createAccount({ organizationId: orgIdC });
    expect(account.currency).toBe('USD');
  });

  // ── 10. Cross-org: getAccount per org ─────────────────────────────────────
  it('10. getAccount returns correct account per org', async () => {
    const svc = new BillingService(pool);
    const accA: BillingAccount | null = await svc.getAccount(orgId);
    const accB: BillingAccount | null = await svc.getAccount(orgIdB);
    expect(accA?.organizationId).toBe(orgId);
    expect(accB?.organizationId).toBe(orgIdB);
    expect(accA?.organizationId).not.toBe(accB?.organizationId);
  });
});
