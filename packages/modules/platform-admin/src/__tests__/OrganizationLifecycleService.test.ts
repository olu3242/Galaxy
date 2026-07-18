import { describe, it, expect, vi } from 'vitest';
import { OrganizationLifecycleService } from '../lifecycle/OrganizationLifecycleService.js';
import type { Pool, QueryResult } from 'pg';

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

describe('OrganizationLifecycleService', () => {
  describe('getLifecycleState', () => {
    it('sets tenant context then queries metrics', async () => {
      const pool = makePool([
        ok([]),
        ok([{ member_count: '5', workflow_count: '3', last_activity: '2024-01-01T00:00:00Z' }]),
      ]);
      const svc = new OrganizationLifecycleService(pool);
      const state = await svc.getLifecycleState('org-1');
      expect(state.organizationId).toBe('org-1');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![0]).toContain('set_config');
    });

    it('returns onboarding stage when no members', async () => {
      const pool = makePool([
        ok([]),
        ok([{ member_count: '0', workflow_count: '0', last_activity: null }]),
      ]);
      const svc = new OrganizationLifecycleService(pool);
      const state = await svc.getLifecycleState('org-1');
      expect(state.stage).toBe('onboarding');
      expect(state.healthScore).toBe(0);
    });

    it('returns activation stage when few members', async () => {
      const pool = makePool([
        ok([]),
        ok([{ member_count: '2', workflow_count: '1', last_activity: null }]),
      ]);
      const svc = new OrganizationLifecycleService(pool);
      const state = await svc.getLifecycleState('org-1');
      expect(state.stage).toBe('activation');
    });

    it('returns growth stage for mid-size org', async () => {
      const pool = makePool([
        ok([]),
        ok([{ member_count: '10', workflow_count: '5', last_activity: null }]),
      ]);
      const svc = new OrganizationLifecycleService(pool);
      const state = await svc.getLifecycleState('org-1');
      expect(state.stage).toBe('growth');
    });

    it('returns mature stage for large org', async () => {
      const pool = makePool([
        ok([]),
        ok([{ member_count: '25', workflow_count: '15', last_activity: null }]),
      ]);
      const svc = new OrganizationLifecycleService(pool);
      const state = await svc.getLifecycleState('org-1');
      expect(state.stage).toBe('mature');
    });

    it('includes completed and pending steps', async () => {
      const pool = makePool([
        ok([]),
        ok([{ member_count: '3', workflow_count: '5', last_activity: null }]),
      ]);
      const svc = new OrganizationLifecycleService(pool);
      const state = await svc.getLifecycleState('org-1');
      expect(state.completedSteps).toContain('first_member_added');
      expect(state.completedSteps).toContain('team_setup');
      expect(state.completedSteps).toContain('first_workflow_created');
      expect(state.completedSteps).toContain('workflows_operational');
    });
  });

  describe('startOnboarding', () => {
    it('sets tenant context and inserts audit log', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrganizationLifecycleService(pool);
      await svc.startOnboarding('org-1');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![0]).toContain('set_config');
      expect(calls[1]![1]).toContain('org-1');
    });
  });

  describe('completeOnboarding', () => {
    it('sets tenant context and inserts audit log', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrganizationLifecycleService(pool);
      await svc.completeOnboarding('org-1');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![0]).toContain('set_config');
      const sql = calls[1]![0] as string;
      expect(sql).toContain('onboarding_completed');
    });
  });

  describe('triggerOffboarding', () => {
    it('sets tenant context and inserts audit log with reason', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrganizationLifecycleService(pool);
      await svc.triggerOffboarding('org-1', 'contract ended');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![0]).toContain('set_config');
      expect(calls[1]![1]).toContain('org-1');
    });
  });
});
