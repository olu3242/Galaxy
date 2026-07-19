import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PlanLimitsService } from '../limits/PlanLimitsService.js';

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

const planLimitsRow = {
  tier: 'professional',
  max_members: 50,
  max_workflows: 50,
  max_agents: 10,
  api_calls_per_month: 50000,
  storage_mb: 10240,
};

describe('PlanLimitsService', () => {
  describe('getPlanLimits', () => {
    it('returns plan limits from db row', async () => {
      const pool = makePool([ok([]), ok([planLimitsRow])]);
      const svc = new PlanLimitsService(pool);
      const limits = await svc.getPlanLimits('org-1');
      expect(limits.maxMembers).toBe(50);
      expect(limits.maxWorkflows).toBe(50);
      expect(limits.maxAgents).toBe(10);
      expect(limits.apiCallsPerMonth).toBe(50000);
      expect(limits.storageMb).toBe(10240);
    });

    it('returns starter defaults when no subscription found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PlanLimitsService(pool);
      const limits = await svc.getPlanLimits('org-1');
      expect(limits.maxMembers).toBe(10);
      expect(limits.maxWorkflows).toBe(5);
      expect(limits.apiCallsPerMonth).toBe(1000);
    });

    it('sets tenant context first', async () => {
      const pool = makePool([ok([]), ok([planLimitsRow])]);
      const svc = new PlanLimitsService(pool);
      await svc.getPlanLimits('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0] as [string, unknown[]])[0]).toContain('set_config');
      expect((calls[0] as [string, unknown[]])[1]).toContain('org-1');
    });
  });

  describe('checkMemberLimit', () => {
    it('returns allowed when under limit', async () => {
      // set_config, getPlanLimits(set_config + query), members count
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ count: '5' }])]);
      const svc = new PlanLimitsService(pool);
      const result = await svc.checkMemberLimit('org-1');
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(5);
      expect(result.limit).toBe(50);
      expect(result.resource).toBe('members');
    });

    it('returns not allowed when at limit', async () => {
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ count: '50' }])]);
      const svc = new PlanLimitsService(pool);
      const result = await svc.checkMemberLimit('org-1');
      expect(result.allowed).toBe(false);
    });

    it('handles zero members', async () => {
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ count: '0' }])]);
      const svc = new PlanLimitsService(pool);
      const result = await svc.checkMemberLimit('org-1');
      expect(result.current).toBe(0);
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkWorkflowLimit', () => {
    it('returns allowed when under limit', async () => {
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ count: '10' }])]);
      const svc = new PlanLimitsService(pool);
      const result = await svc.checkWorkflowLimit('org-1');
      expect(result.allowed).toBe(true);
      expect(result.resource).toBe('workflows');
    });

    it('returns not allowed when at limit', async () => {
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ count: '50' }])]);
      const svc = new PlanLimitsService(pool);
      const result = await svc.checkWorkflowLimit('org-1');
      expect(result.allowed).toBe(false);
    });
  });

  describe('checkAgentLimit', () => {
    it('returns allowed when under limit', async () => {
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ count: '3' }])]);
      const svc = new PlanLimitsService(pool);
      const result = await svc.checkAgentLimit('org-1');
      expect(result.allowed).toBe(true);
      expect(result.resource).toBe('agents');
      expect(result.current).toBe(3);
    });

    it('returns not allowed when at limit', async () => {
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ count: '10' }])]);
      const svc = new PlanLimitsService(pool);
      const result = await svc.checkAgentLimit('org-1');
      expect(result.allowed).toBe(false);
    });
  });

  describe('checkApiCallLimit', () => {
    it('returns allowed when under limit', async () => {
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ total: '100' }])]);
      const svc = new PlanLimitsService(pool);
      const result = await svc.checkApiCallLimit('org-1', 'sub-1');
      expect(result.allowed).toBe(true);
      expect(result.resource).toBe('api_calls');
      expect(result.current).toBe(100);
    });

    it('returns not allowed when limit exceeded', async () => {
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ total: '50000' }])]);
      const svc = new PlanLimitsService(pool);
      const result = await svc.checkApiCallLimit('org-1', 'sub-1');
      expect(result.allowed).toBe(false);
    });

    it('passes subscriptionId as parameter', async () => {
      const pool = makePool([ok([]), ok([]), ok([planLimitsRow]), ok([{ total: '0' }])]);
      const svc = new PlanLimitsService(pool);
      await svc.checkApiCallLimit('org-1', 'sub-42');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[1]).toContain('sub-42');
    });
  });
});
