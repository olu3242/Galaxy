import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionService } from '../subscriptions/SubscriptionService.js';
import type { Pool, QueryResult } from 'pg';

function makePool(rows: unknown[][]): Pool {
  let callIdx = 0;
  const query = vi.fn().mockImplementation(() => {
    const currentRows = rows[callIdx] ?? [];
    callIdx++;
    return Promise.resolve({ rows: currentRows, rowCount: currentRows.length } as QueryResult);
  });
  return { query } as unknown as Pool;
}

const subRow = {
  id: 'sub-1',
  organization_id: 'org-1',
  plan_id: 'plan-1',
  status: 'active',
  current_period_start: '2024-01-01',
  current_period_end: '2024-02-01',
  cancel_at_period_end: false,
  trial_end: null,
  metadata: {},
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

describe('SubscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createSubscription creates active subscription', async () => {
    const pool = makePool([
      [], // set_config
      [subRow], // INSERT subscriptions
    ]);
    const svc = new SubscriptionService(pool);
    const sub = await svc.createSubscription({ organizationId: 'org-1', planId: 'plan-1' });
    expect(sub.id).toBe('sub-1');
    expect(sub.status).toBe('active');
  });

  it('createSubscription sets trialing status when trialEnd provided', async () => {
    const trialRow = { ...subRow, status: 'trialing', trial_end: '2024-01-15' };
    const pool = makePool([[], [trialRow]]);
    const svc = new SubscriptionService(pool);
    const sub = await svc.createSubscription({
      organizationId: 'org-1',
      planId: 'plan-1',
      trialEnd: '2024-01-15',
    });
    expect(sub.status).toBe('trialing');
    expect(sub.trialEnd).toBe('2024-01-15');
  });

  it('getSubscription returns null when no subscription', async () => {
    const pool = makePool([[], []]);
    const svc = new SubscriptionService(pool);
    const result = await svc.getSubscription('org-999');
    expect(result).toBeNull();
  });

  it('cancelSubscription sets cancelled status', async () => {
    const cancelledRow = { ...subRow, status: 'cancelled' };
    const pool = makePool([
      [], // set_config (updateSubscription)
      [cancelledRow], // UPDATE subscriptions
    ]);
    const svc = new SubscriptionService(pool);
    const sub = await svc.cancelSubscription('org-1', 'sub-1');
    expect(sub.status).toBe('cancelled');
  });

  it('upgradeSubscription updates plan', async () => {
    const upgradedRow = { ...subRow, plan_id: 'plan-2' };
    const pool = makePool([[], [upgradedRow]]);
    const svc = new SubscriptionService(pool);
    const sub = await svc.upgradeSubscription('org-1', 'sub-1', 'plan-2');
    expect(sub.planId).toBe('plan-2');
  });
});
