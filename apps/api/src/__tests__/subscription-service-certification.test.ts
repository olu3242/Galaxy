/**
 * Subscription Service Certification Test Suite — Phase 83
 *
 * Certifies SubscriptionService from @galaxy/platform:
 * 1.  createSubscription creates an active subscription
 * 2.  created subscription has correct organizationId and planId
 * 3.  getActiveSubscription returns the active subscription for an org
 * 4.  getActiveSubscription returns null for org with no subscription
 * 5.  listSubscriptions returns an array
 * 6.  listSubscriptions filters by status
 * 7.  updateStatus cancels a subscription
 * 8.  getActiveSubscription returns null after cancellation
 * 9.  updateStatus records a subscription event
 * 10. Cross-org: getActiveSubscription returns correct sub per org
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { SubscriptionService, type Subscription } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-8301-4000-8000-830100000001';
const orgIdB = '00000000-8301-4000-8000-830100000002';
const orgIdC = '00000000-8301-4000-8000-830100000003';
let planId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Subscription Phase 83 Org A', 'subscription-phase83-a', 'starter', 'active'),
            ($2, 'Subscription Phase 83 Org B', 'subscription-phase83-b', 'starter', 'active'),
            ($3, 'Subscription Phase 83 Org C', 'subscription-phase83-c', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB, orgIdC],
  );
  const planResult = await pool.query<{ id: string }>(
    `INSERT INTO plans (name, tier, monthly_price_cents, annual_price_cents)
     VALUES ('Cert83 Starter', 'starter', 0, 0)
     RETURNING id`,
  );
  const firstRow = planResult.rows[0] as { id: string } | undefined;
  if (!firstRow) throw new Error('Plan insert returned no rows');
  planId = firstRow.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM subscription_events WHERE organization_id IN ($1, $2, $3)`, [
      orgId,
      orgIdB,
      orgIdC,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM subscriptions WHERE organization_id IN ($1, $2, $3)`, [
      orgId,
      orgIdB,
      orgIdC,
    ])
    .catch(() => null);
  await pool.query(`DELETE FROM plans WHERE name = 'Cert83 Starter'`).catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2, $3)`, [orgId, orgIdB, orgIdC])
    .catch(() => null);
  await pool.end();
});

describe('Subscription Service Certification', () => {
  let subscriptionId: string;
  let _subscriptionBId: string;

  // ── 1. createSubscription creates subscription ────────────────────────────
  it('1. createSubscription creates an active subscription', async () => {
    const svc = new SubscriptionService(pool);
    const sub = await svc.createSubscription({
      organizationId: orgId,
      planId,
      status: 'active',
    });
    expect(sub).toBeTruthy();
    expect(sub.id).toBeTruthy();
    expect(sub.status).toBe('active');
    subscriptionId = sub.id;
  });

  // ── 2. subscription has correct org and plan ──────────────────────────────
  it('2. created subscription has correct organizationId and planId', async () => {
    const svc = new SubscriptionService(pool);
    const sub = await svc.createSubscription({
      organizationId: orgIdB,
      planId,
      status: 'active',
    });
    expect(sub.organizationId).toBe(orgIdB);
    expect(sub.planId).toBe(planId);
    _subscriptionBId = sub.id;
  });

  // ── 3. getActiveSubscription returns subscription ─────────────────────────
  it('3. getActiveSubscription returns the active subscription for the org', async () => {
    const svc = new SubscriptionService(pool);
    const sub: Subscription | null = await svc.getActiveSubscription(orgId);
    expect(sub).toBeTruthy();
    expect(sub?.organizationId).toBe(orgId);
    expect(sub?.status).toBe('active');
  });

  // ── 4. getActiveSubscription returns null for no subscription ─────────────
  it('4. getActiveSubscription returns null for org with no subscription', async () => {
    const svc = new SubscriptionService(pool);
    const sub: Subscription | null = await svc.getActiveSubscription(orgIdC);
    expect(sub).toBeNull();
  });

  // ── 5. listSubscriptions returns array ───────────────────────────────────
  it('5. listSubscriptions returns an array', async () => {
    const svc = new SubscriptionService(pool);
    const subs: Subscription[] = await svc.listSubscriptions();
    expect(Array.isArray(subs)).toBe(true);
    expect(subs.length).toBeGreaterThan(0);
  });

  // ── 6. listSubscriptions filters by status ──────────────────────────────
  it('6. listSubscriptions filters by status=active', async () => {
    const svc = new SubscriptionService(pool);
    const subs: Subscription[] = await svc.listSubscriptions({ status: 'active' });
    expect(subs.every((s) => s.status === 'active')).toBe(true);
  });

  // ── 7. updateStatus cancels a subscription ───────────────────────────────
  it('7. updateStatus cancels the subscription', async () => {
    const svc = new SubscriptionService(pool);
    const updated: Subscription | null = await svc.updateStatus(subscriptionId, 'cancelled', orgId);
    expect(updated).toBeTruthy();
    expect(updated?.status).toBe('cancelled');
  });

  // ── 8. getActiveSubscription returns null after cancellation ──────────────
  it('8. getActiveSubscription returns null after cancellation', async () => {
    const svc = new SubscriptionService(pool);
    const sub: Subscription | null = await svc.getActiveSubscription(orgId);
    expect(sub).toBeNull();
  });

  // ── 9. updateStatus records a subscription event ─────────────────────────
  it('9. updateStatus triggers a subscription event record', async () => {
    const result = await pool.query(
      `SELECT * FROM subscription_events WHERE subscription_id = $1 ORDER BY created_at DESC`,
      [subscriptionId],
    );
    expect(result.rows.length).toBeGreaterThan(0);
    const row = result.rows[0] as Record<string, unknown>;
    expect(row.event_type).toContain('cancelled');
  });

  // ── 10. Cross-org: getActiveSubscription per org ─────────────────────────
  it('10. getActiveSubscription returns correct subscription per org', async () => {
    const svc = new SubscriptionService(pool);
    const subA: Subscription | null = await svc.getActiveSubscription(orgId);
    const subB: Subscription | null = await svc.getActiveSubscription(orgIdB);
    // orgA sub is cancelled so null; orgB still active
    expect(subA).toBeNull();
    expect(subB).toBeTruthy();
    expect(subB?.organizationId).toBe(orgIdB);
  });
});
