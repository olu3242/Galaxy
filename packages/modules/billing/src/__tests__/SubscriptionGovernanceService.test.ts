import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { SubscriptionGovernanceService } from '../commercial/SubscriptionGovernanceService.js';

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
  current_period_start: '2024-01-01T00:00:00Z',
  current_period_end: '2024-01-31T00:00:00Z',
  cancel_at_period_end: false,
  trial_end: null,
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const updatedSubRow = {
  ...subRow,
  current_period_start: '2024-01-31T00:00:00Z',
  current_period_end: '2024-02-29T00:00:00Z',
  updated_at: '2024-01-31T00:00:00Z',
};

describe('SubscriptionGovernanceService', () => {
  describe('enforceRenewal', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SubscriptionGovernanceService(pool);
      await svc.enforceRenewal('org-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
      expect(calls[0]?.[1]).toContain('org-1');
    });

    it('returns empty array when no subscriptions near renewal', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SubscriptionGovernanceService(pool);
      const renewed = await svc.enforceRenewal('org-1');
      expect(renewed).toHaveLength(0);
    });

    it('renews each matching subscription', async () => {
      const pool = makePool([ok([]), ok([subRow]), ok([updatedSubRow])]);
      const svc = new SubscriptionGovernanceService(pool);
      const renewed = await svc.enforceRenewal('org-1');
      expect(renewed).toHaveLength(1);
      expect(renewed[0]?.id).toBe('sub-1');
    });

    it('maps renewed subscription fields correctly', async () => {
      const pool = makePool([ok([]), ok([subRow]), ok([updatedSubRow])]);
      const svc = new SubscriptionGovernanceService(pool);
      const renewed = await svc.enforceRenewal('org-1');
      expect(renewed[0]?.organizationId).toBe('org-1');
      expect(renewed[0]?.planId).toBe('plan-1');
      expect(renewed[0]?.status).toBe('active');
    });

    it('handles multiple subscriptions to renew', async () => {
      const sub2 = { ...subRow, id: 'sub-2' };
      const updated2 = { ...updatedSubRow, id: 'sub-2' };
      const pool = makePool([ok([]), ok([subRow, sub2]), ok([updatedSubRow]), ok([updated2])]);
      const svc = new SubscriptionGovernanceService(pool);
      const renewed = await svc.enforceRenewal('org-1');
      expect(renewed).toHaveLength(2);
    });
  });

  describe('validateEnterpriseAccess', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([{ tier: 'enterprise' }])]);
      const svc = new SubscriptionGovernanceService(pool);
      await svc.validateEnterpriseAccess('org-1', 'sso');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
    });

    it('returns false when no active subscription', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SubscriptionGovernanceService(pool);
      const allowed = await svc.validateEnterpriseAccess('org-1', 'sso');
      expect(allowed).toBe(false);
    });

    it('returns false for enterprise feature on non-enterprise tier', async () => {
      const pool = makePool([ok([]), ok([{ tier: 'starter' }])]);
      const svc = new SubscriptionGovernanceService(pool);
      const allowed = await svc.validateEnterpriseAccess('org-1', 'sso');
      expect(allowed).toBe(false);
    });

    it('returns true for enterprise feature on enterprise tier', async () => {
      const pool = makePool([ok([]), ok([{ tier: 'enterprise' }])]);
      const svc = new SubscriptionGovernanceService(pool);
      const allowed = await svc.validateEnterpriseAccess('org-1', 'sso');
      expect(allowed).toBe(true);
    });

    it('returns true for non-enterprise feature on any tier', async () => {
      const pool = makePool([ok([]), ok([{ tier: 'starter' }])]);
      const svc = new SubscriptionGovernanceService(pool);
      const allowed = await svc.validateEnterpriseAccess('org-1', 'basic_workflows');
      expect(allowed).toBe(true);
    });

    it('passes orgId as parameter to subscription query', async () => {
      const pool = makePool([ok([]), ok([{ tier: 'enterprise' }])]);
      const svc = new SubscriptionGovernanceService(pool);
      await svc.validateEnterpriseAccess('org-42', 'sso');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[1]).toContain('org-42');
    });
  });
});
