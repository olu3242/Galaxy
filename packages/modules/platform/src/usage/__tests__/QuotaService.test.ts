import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { QuotaService } from '../QuotaService.js';

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

const limitRow = {
  id: 'lim-1',
  organization_id: 'org-1',
  resource_type: 'api_calls',
  limit_value: '1000',
  reset_period: 'monthly',
  created_at: '2024-01-01T00:00:00Z',
};

const alertRow = {
  id: 'alr-1',
  organization_id: 'org-1',
  resource_type: 'api_calls',
  threshold_pct: '80',
  triggered_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

describe('QuotaService', () => {
  describe('setLimit', () => {
    it('sets tenant context and returns limit', async () => {
      const pool = makePool([ok([]), ok([limitRow])]);
      const svc = new QuotaService(pool);
      const result = await svc.setLimit({
        organizationId: 'org-1',
        resourceType: 'api_calls',
        limitValue: 1000,
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('lim-1');
      expect(result.limitValue).toBe(1000);
    });

    it('throws when upsert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new QuotaService(pool);
      await expect(
        svc.setLimit({ organizationId: 'org-1', resourceType: 'x', limitValue: 100 }),
      ).rejects.toThrow('Failed to set usage limit');
    });
  });

  describe('getLimits', () => {
    it('sets tenant context and returns limits', async () => {
      const pool = makePool([ok([]), ok([limitRow])]);
      const svc = new QuotaService(pool);
      const result = await svc.getLimits('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result[0]?.resourceType).toBe('api_calls');
    });
  });

  describe('checkQuota', () => {
    it('returns allowed=true with usage when under limit', async () => {
      // set_config, SELECT limit, SELECT current usage
      const pool = makePool([ok([]), ok([{ limit_value: '1000' }]), ok([{ total: '250' }])]);
      const svc = new QuotaService(pool);
      const result = await svc.checkQuota('org-1', 'api_calls');
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(250);
      expect(result.limit).toBe(1000);
      expect(result.percentUsed).toBeCloseTo(25);
    });

    it('returns allowed=false when at or over limit', async () => {
      const pool = makePool([ok([]), ok([{ limit_value: '1000' }]), ok([{ total: '1000' }])]);
      const svc = new QuotaService(pool);
      const result = await svc.checkQuota('org-1', 'api_calls');
      expect(result.allowed).toBe(false);
    });

    it('returns allowed=true with limit=-1 when no limit configured', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new QuotaService(pool);
      const result = await svc.checkQuota('org-1', 'api_calls');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    });
  });

  describe('createAlert', () => {
    it('sets tenant context and returns alert', async () => {
      const pool = makePool([ok([]), ok([alertRow])]);
      const svc = new QuotaService(pool);
      const result = await svc.createAlert({
        organizationId: 'org-1',
        resourceType: 'api_calls',
        thresholdPct: 80,
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('alr-1');
      expect(result.thresholdPct).toBe(80);
      expect(result.triggeredAt).toBeNull();
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new QuotaService(pool);
      await expect(
        svc.createAlert({ organizationId: 'org-1', resourceType: 'x', thresholdPct: 80 }),
      ).rejects.toThrow('Failed to create usage alert');
    });
  });
});
