import { describe, it, expect, vi } from 'vitest';
import { PlatformDashboardService } from '../PlatformDashboardService.js';
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

describe('PlatformDashboardService', () => {
  describe('getAggregateMetrics', () => {
    it('returns parsed metrics with mrr', async () => {
      const pool = makePool([
        ok([
          { total_orgs: '10', active_tenants: '8', total_workflows: '50', total_members: '200' },
        ]),
        ok([{ mrr_cents: '99900' }]),
      ]);
      const svc = new PlatformDashboardService(pool);
      const result = await svc.getAggregateMetrics();

      expect(result.totalOrgs).toBe(10);
      expect(result.activeTenants).toBe(8);
      expect(result.totalWorkflows).toBe(50);
      expect(result.totalMembers).toBe(200);
      expect(result.mrrCents).toBe(99900);
      expect(result.healthScore).toBe(80);
      expect(result.metrics).toHaveLength(6);
    });

    it('returns 100 health score when no orgs', async () => {
      const pool = makePool([
        ok([{ total_orgs: '0', active_tenants: '0', total_workflows: '0', total_members: '0' }]),
        ok([{ mrr_cents: '0' }]),
      ]);
      const svc = new PlatformDashboardService(pool);
      const result = await svc.getAggregateMetrics();
      expect(result.healthScore).toBe(100);
    });

    it('handles missing rows gracefully', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PlatformDashboardService(pool);
      const result = await svc.getAggregateMetrics();
      expect(result.totalOrgs).toBe(0);
      expect(result.mrrCents).toBe(0);
    });

    it('includes all expected metric keys', async () => {
      const pool = makePool([
        ok([{ total_orgs: '5', active_tenants: '5', total_workflows: '20', total_members: '40' }]),
        ok([{ mrr_cents: '5000' }]),
      ]);
      const svc = new PlatformDashboardService(pool);
      const result = await svc.getAggregateMetrics();
      const keys = result.metrics.map((m) => m.key);
      expect(keys).toContain('total_orgs');
      expect(keys).toContain('active_tenants');
      expect(keys).toContain('mrr_cents');
      expect(keys).toContain('health_score');
      expect(keys).toContain('total_workflows');
      expect(keys).toContain('total_members');
    });

    it('propagates db errors', async () => {
      const pool = { query: vi.fn().mockRejectedValue(new Error('DB down')) } as unknown as Pool;
      const svc = new PlatformDashboardService(pool);
      await expect(svc.getAggregateMetrics()).rejects.toThrow('DB down');
    });
  });
});
