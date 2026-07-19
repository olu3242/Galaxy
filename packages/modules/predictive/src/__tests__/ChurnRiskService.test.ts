import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ChurnRiskService } from '../ChurnRiskService.js';

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

const ORG = 'org-churn-test';

describe('ChurnRiskService', () => {
  describe('computeChurnRisk', () => {
    it('sets tenant context before querying members', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ChurnRiskService(pool);
      await svc.computeChurnRisk(ORG);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns empty array when no members', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ChurnRiskService(pool);
      const result = await svc.computeChurnRisk(ORG);
      expect(result).toEqual([]);
    });

    it('scores high risk for inactive member with no logins and no tasks', async () => {
      const longAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      const memberRows = [
        { id: 'member-1', last_active_at: longAgo, login_count_30d: '0', task_count_30d: '0' },
      ];
      const pool = makePool([ok([]), ok(memberRows)]);
      const svc = new ChurnRiskService(pool);
      const result = await svc.computeChurnRisk(ORG);
      expect(result).toHaveLength(1);
      // inactive_30d (+40) + no_logins_30d (+30) + no_tasks_30d (+30) = 100
      expect(result[0]?.score).toBe(100);
      expect(result[0]?.riskLevel).toBe('high');
      expect(result[0]?.factors).toContain('inactive_30d');
      expect(result[0]?.factors).toContain('no_logins_30d');
      expect(result[0]?.factors).toContain('no_tasks_30d');
    });

    it('scores medium risk for somewhat active member', async () => {
      const recentish = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const memberRows = [
        { id: 'member-2', last_active_at: recentish, login_count_30d: '2', task_count_30d: '3' },
      ];
      const pool = makePool([ok([]), ok(memberRows)]);
      const svc = new ChurnRiskService(pool);
      const result = await svc.computeChurnRisk(ORG);
      // inactive_14d (+20) + low_logins_30d (+15) = 35 → medium
      expect(result[0]?.riskLevel).toBe('medium');
      expect(result[0]?.factors).toContain('inactive_14d');
      expect(result[0]?.factors).toContain('low_logins_30d');
    });

    it('scores low risk for active member with logins and tasks', async () => {
      const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const memberRows = [
        { id: 'member-3', last_active_at: recent, login_count_30d: '10', task_count_30d: '5' },
      ];
      const pool = makePool([ok([]), ok(memberRows)]);
      const svc = new ChurnRiskService(pool);
      const result = await svc.computeChurnRisk(ORG);
      expect(result[0]?.riskLevel).toBe('low');
      expect(result[0]?.score).toBe(0);
    });

    it('handles null last_active_at as 90 days inactive', async () => {
      const memberRows = [
        { id: 'member-4', last_active_at: null, login_count_30d: '5', task_count_30d: '5' },
      ];
      const pool = makePool([ok([]), ok(memberRows)]);
      const svc = new ChurnRiskService(pool);
      const result = await svc.computeChurnRisk(ORG);
      // null last_active => 90 days => +40 inactive_30d
      expect(result[0]?.factors).toContain('inactive_30d');
    });

    it('sets organizationId on returned scores', async () => {
      const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const memberRows = [
        { id: 'member-5', last_active_at: recent, login_count_30d: '5', task_count_30d: '5' },
      ];
      const pool = makePool([ok([]), ok(memberRows)]);
      const svc = new ChurnRiskService(pool);
      const result = await svc.computeChurnRisk(ORG);
      expect(result[0]?.organizationId).toBe(ORG);
      expect(result[0]?.memberId).toBe('member-5');
    });
  });
});
