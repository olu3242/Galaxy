import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PlanService } from '../PlanService.js';

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

const planRow = {
  id: 'plan-1',
  name: 'pro',
  display_name: 'Pro Plan',
  price_cents_monthly: '2900',
  price_cents_annual: '29000',
  features: { api_access: true },
  active: true,
  created_at: '2024-01-01T00:00:00Z',
};

describe('PlanService', () => {
  describe('createPlan', () => {
    it('returns created plan', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      const result = await svc.createPlan({
        name: 'pro',
        displayName: 'Pro Plan',
        priceCentsMonthly: 2900,
        priceCentsAnnual: 29000,
      });
      expect(result.id).toBe('plan-1');
      expect(result.priceCentsMonthly).toBe(2900);
      expect(result.active).toBe(true);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlanService(pool);
      await expect(
        svc.createPlan({
          name: 'x',
          displayName: 'X',
          priceCentsMonthly: 0,
          priceCentsAnnual: 0,
        }),
      ).rejects.toThrow('Failed to create plan');
    });
  });

  describe('listPlans', () => {
    it('lists active plans by default', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      const result = await svc.listPlans();
      expect(result[0]?.name).toBe('pro');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(String(calls[0]?.[0])).toContain('active = true');
    });

    it('lists all plans when activeOnly is false', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      const result = await svc.listPlans(false);
      expect(result).toHaveLength(1);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(String(calls[0]?.[0])).not.toContain('active = true');
    });
  });

  describe('getPlanByName', () => {
    it('returns plan when found', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      const result = await svc.getPlanByName('pro');
      expect(result?.displayName).toBe('Pro Plan');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlanService(pool);
      const result = await svc.getPlanByName('missing');
      expect(result).toBeNull();
    });
  });

  describe('togglePlan', () => {
    it('returns updated plan', async () => {
      const inactive = { ...planRow, active: false };
      const pool = makePool([ok([inactive])]);
      const svc = new PlanService(pool);
      const result = await svc.togglePlan('plan-1', false);
      expect(result?.active).toBe(false);
    });

    it('returns null when plan not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlanService(pool);
      const result = await svc.togglePlan('missing', true);
      expect(result).toBeNull();
    });
  });
});
