import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { SubscriptionService } from '../SubscriptionService.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

const subRow = {
  id: 'sub-1',
  organization_id: 'org-1',
  plan_id: 'plan-1',
  status: 'active',
  trial_ends_at: null,
  current_period_start: '2024-01-01T00:00:00Z',
  current_period_end: '2024-02-01T00:00:00Z',
  cancelled_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const eventRow = {
  id: 'evt-1',
  organization_id: 'org-1',
  subscription_id: 'sub-1',
  event_type: 'created',
  metadata: {},
  occurred_at: '2024-01-01T00:00:00Z',
};

describe('SubscriptionService', () => {
  describe('createSubscription', () => {
    it('sets tenant context, creates subscription, and records event', async () => {
      // set_config, INSERT sub, INSERT event
      const pool = makePool([ok([]), ok([subRow]), ok([eventRow])]);
      const svc = new SubscriptionService(pool);
      const result = await svc.createSubscription({ organizationId: 'org-1', planId: 'plan-1' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('sub-1');
      expect(result.status).toBe('active');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SubscriptionService(pool);
      await expect(
        svc.createSubscription({ organizationId: 'org-1', planId: 'plan-1' }),
      ).rejects.toThrow('Failed to create subscription');
    });
  });

  describe('getSubscription', () => {
    it('sets tenant context and returns subscription', async () => {
      const pool = makePool([ok([]), ok([subRow])]);
      const svc = new SubscriptionService(pool);
      const result = await svc.getSubscription('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result?.planId).toBe('plan-1');
    });

    it('returns null when no active subscription', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SubscriptionService(pool);
      const result = await svc.getSubscription('org-missing');
      expect(result).toBeNull();
    });
  });

  describe('listSubscriptions', () => {
    it('returns subscriptions list', async () => {
      const pool = makePool([ok([subRow])]);
      const svc = new SubscriptionService(pool);
      const result = await svc.listSubscriptions();
      expect(result[0]?.organizationId).toBe('org-1');
    });

    it('passes status filter', async () => {
      const pool = makePool([ok([])]);
      const svc = new SubscriptionService(pool);
      await svc.listSubscriptions({ status: 'active', limit: 5 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain('active');
      expect(params).toContain(5);
    });
  });

  describe('updateStatus', () => {
    it('sets tenant context, updates status, and records event', async () => {
      // set_config, UPDATE, INSERT event
      const cancelled = { ...subRow, status: 'cancelled', cancelled_at: '2024-01-10T00:00:00Z' };
      const pool = makePool([ok([]), ok([cancelled]), ok([eventRow])]);
      const svc = new SubscriptionService(pool);
      const result = await svc.updateStatus('sub-1', 'cancelled', 'org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result?.status).toBe('cancelled');
    });

    it('returns null when subscription not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SubscriptionService(pool);
      const result = await svc.updateStatus('missing', 'active', 'org-1');
      expect(result).toBeNull();
    });
  });
});
