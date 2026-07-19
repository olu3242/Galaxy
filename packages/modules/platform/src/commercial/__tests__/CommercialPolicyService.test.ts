import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { CommercialPolicyService } from '../CommercialPolicyService.js';

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

const policyRow = {
  id: 'pol-1',
  policy_type: 'discount',
  rules: { pct: 10 },
  active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('CommercialPolicyService', () => {
  describe('createPolicy', () => {
    it('returns mapped policy', async () => {
      const pool = makePool([ok([policyRow])]);
      const svc = new CommercialPolicyService(pool);
      const result = await svc.createPolicy({ policyType: 'discount', rules: { pct: 10 } });
      expect(result.id).toBe('pol-1');
      expect(result.policyType).toBe('discount');
      expect(result.active).toBe(true);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new CommercialPolicyService(pool);
      await expect(svc.createPolicy({ policyType: 'x', rules: {} })).rejects.toThrow(
        'Failed to create commercial policy',
      );
    });
  });

  describe('listPolicies', () => {
    it('returns all policies without filter', async () => {
      const pool = makePool([ok([policyRow])]);
      const svc = new CommercialPolicyService(pool);
      const result = await svc.listPolicies();
      expect(result).toHaveLength(1);
      expect(result[0]?.policyType).toBe('discount');
    });

    it('passes policyType filter', async () => {
      const pool = makePool([ok([policyRow])]);
      const svc = new CommercialPolicyService(pool);
      await svc.listPolicies('discount');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain('discount');
    });
  });

  describe('togglePolicy', () => {
    it('returns updated policy', async () => {
      const updated = { ...policyRow, active: false };
      const pool = makePool([ok([updated])]);
      const svc = new CommercialPolicyService(pool);
      const result = await svc.togglePolicy('pol-1', false);
      expect(result?.active).toBe(false);
    });

    it('returns null when policy not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new CommercialPolicyService(pool);
      const result = await svc.togglePolicy('missing', true);
      expect(result).toBeNull();
    });
  });

  describe('getActivePolicies', () => {
    it('returns active policies for type', async () => {
      const pool = makePool([ok([policyRow])]);
      const svc = new CommercialPolicyService(pool);
      const result = await svc.getActivePolicies('discount');
      expect(result[0]?.active).toBe(true);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain('discount');
    });

    it('returns empty array when no active policies', async () => {
      const pool = makePool([ok([])]);
      const svc = new CommercialPolicyService(pool);
      const result = await svc.getActivePolicies('nonexistent');
      expect(result).toHaveLength(0);
    });
  });
});
