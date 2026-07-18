import { describe, it, expect, vi } from 'vitest';
import { MetricsService } from '../observability/MetricsService.js';
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

describe('MetricsService', () => {
  describe('getPlatformMetrics', () => {
    it('returns four platform metrics', async () => {
      const pool = makePool([
        ok([{ total_orgs: '10', active_orgs: '8', total_members: '200', total_workflows: '50' }]),
      ]);
      const svc = new MetricsService(pool);
      const metrics = await svc.getPlatformMetrics();
      expect(metrics).toHaveLength(4);
      const keys = metrics.map((m) => m.key);
      expect(keys).toContain('total_orgs');
      expect(keys).toContain('active_orgs');
      expect(keys).toContain('total_members');
      expect(keys).toContain('total_workflows');
    });

    it('parses numeric values correctly', async () => {
      const pool = makePool([
        ok([{ total_orgs: '5', active_orgs: '4', total_members: '100', total_workflows: '25' }]),
      ]);
      const svc = new MetricsService(pool);
      const metrics = await svc.getPlatformMetrics();
      const totalOrgs = metrics.find((m) => m.key === 'total_orgs');
      expect(totalOrgs!.value).toBe(5);
    });

    it('handles missing row with zero values', async () => {
      const pool = makePool([ok([])]);
      const svc = new MetricsService(pool);
      const metrics = await svc.getPlatformMetrics();
      expect(metrics.every((m) => m.value === 0)).toBe(true);
    });

    it('propagates db errors', async () => {
      const pool = { query: vi.fn().mockRejectedValue(new Error('DB error')) } as unknown as Pool;
      const svc = new MetricsService(pool);
      await expect(svc.getPlatformMetrics()).rejects.toThrow('DB error');
    });
  });

  describe('getTenantMetrics', () => {
    it('sets tenant context then queries tenant metrics', async () => {
      const pool = makePool([
        ok([]),
        ok([
          {
            member_count: '10',
            workflow_count: '5',
            active_workflows: '3',
            audit_count: '100',
          },
        ]),
      ]);
      const svc = new MetricsService(pool);
      const metrics = await svc.getTenantMetrics('org-1');
      expect(metrics.organizationId).toBe('org-1');
      expect(metrics.memberCount).toBe(10);
      expect(metrics.workflowCount).toBe(5);
      expect(metrics.activeWorkflows).toBe(3);
      expect(metrics.auditLogCount).toBe(100);
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0][0]).toContain('set_config');
    });

    it('handles missing row with zero values', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MetricsService(pool);
      const metrics = await svc.getTenantMetrics('org-1');
      expect(metrics.memberCount).toBe(0);
      expect(metrics.auditLogCount).toBe(0);
    });

    it('passes orgId as query parameter', async () => {
      const pool = makePool([
        ok([]),
        ok([{ member_count: '0', workflow_count: '0', active_workflows: '0', audit_count: '0' }]),
      ]);
      const svc = new MetricsService(pool);
      await svc.getTenantMetrics('org-99');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1][1]).toContain('org-99');
    });
  });
});
