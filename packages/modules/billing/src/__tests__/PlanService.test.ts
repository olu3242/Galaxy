import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PlanService } from '../subscriptions/PlanService.js';

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
  name: 'Starter',
  tier: 'starter',
  monthly_price_cents: 1000,
  annual_price_cents: 10000,
  max_members: 10,
  max_workflows: 5,
  max_agents: 2,
  api_calls_per_month: 1000,
  storage_mb: 1024,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('PlanService', () => {
  describe('listPlans', () => {
    it('returns active plans by default', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      const plans = await svc.listPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0]?.id).toBe('plan-1');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('is_active = true');
    });

    it('includes inactive plans when activeOnly is false', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      await svc.listPlans(false);
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]?.[0]).not.toContain('is_active');
    });

    it('maps plan limits correctly', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      const plans = await svc.listPlans();
      expect(plans[0]?.limits.maxMembers).toBe(10);
      expect(plans[0]?.limits.maxWorkflows).toBe(5);
      expect(plans[0]?.limits.storageMb).toBe(1024);
    });

    it('returns empty array when no plans', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlanService(pool);
      const plans = await svc.listPlans();
      expect(plans).toHaveLength(0);
    });
  });

  describe('getPlan', () => {
    it('returns plan when found', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      const plan = await svc.getPlan('plan-1');
      expect(plan?.id).toBe('plan-1');
      expect(plan?.name).toBe('Starter');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlanService(pool);
      const plan = await svc.getPlan('plan-missing');
      expect(plan).toBeNull();
    });

    it('passes planId as parameter', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      await svc.getPlan('plan-1');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]?.[1]).toContain('plan-1');
    });
  });

  describe('createPlan', () => {
    it('inserts and returns new plan', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      const plan = await svc.createPlan({
        name: 'Starter',
        tier: 'starter',
        monthlyPriceCents: 1000,
        annualPriceCents: 10000,
        maxMembers: 10,
        maxWorkflows: 5,
        maxAgents: 2,
        apiCallsPerMonth: 1000,
        storageMb: 1024,
      });
      expect(plan.id).toBe('plan-1');
      expect(plan.isActive).toBe(true);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlanService(pool);
      await expect(
        svc.createPlan({
          name: 'Starter',
          tier: 'starter',
          monthlyPriceCents: 1000,
          annualPriceCents: 10000,
          maxMembers: 10,
          maxWorkflows: 5,
          maxAgents: 2,
          apiCallsPerMonth: 1000,
          storageMb: 1024,
        }),
      ).rejects.toThrow('Plan creation failed');
    });
  });

  describe('updatePlan', () => {
    it('updates specified fields and returns updated plan', async () => {
      const updated = { ...planRow, name: 'Starter Pro' };
      const pool = makePool([ok([updated])]);
      const svc = new PlanService(pool);
      const plan = await svc.updatePlan('plan-1', { name: 'Starter Pro' });
      expect(plan?.name).toBe('Starter Pro');
    });

    it('returns null when plan not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlanService(pool);
      const plan = await svc.updatePlan('plan-missing', { name: 'New Name' });
      expect(plan).toBeNull();
    });

    it('fetches plan instead when no fields to update', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new PlanService(pool);
      const plan = await svc.updatePlan('plan-1', {});
      expect(plan?.id).toBe('plan-1');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      // Should SELECT not UPDATE
      expect(calls[0]?.[0]).toContain('SELECT');
    });
  });

  describe('deactivatePlan', () => {
    it('returns true when plan was deactivated', async () => {
      const pool = makePool([
        { rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] } as QueryResult,
      ]);
      const svc = new PlanService(pool);
      const result = await svc.deactivatePlan('plan-1');
      expect(result).toBe(true);
    });

    it('returns false when plan not found', async () => {
      const pool = makePool([
        { rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] } as QueryResult,
      ]);
      const svc = new PlanService(pool);
      const result = await svc.deactivatePlan('plan-missing');
      expect(result).toBe(false);
    });

    it('passes planId as parameter', async () => {
      const pool = makePool([
        { rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] } as QueryResult,
      ]);
      const svc = new PlanService(pool);
      await svc.deactivatePlan('plan-42');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]?.[1]).toContain('plan-42');
    });
  });
});
