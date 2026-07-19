import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PlatformAdminService } from '../PlatformAdminService.js';

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

const actionRow = {
  id: 'act-1',
  admin_id: 'admin-1',
  action_type: 'suspend_org',
  payload: { orgId: 'org-1' },
  notes: 'Test note',
  created_at: '2024-01-01T00:00:00Z',
};

const metricRow = {
  id: 'met-1',
  metric_name: 'active_orgs',
  value: '42',
  labels: { region: 'us' },
  recorded_at: '2024-01-01T00:00:00Z',
};

describe('PlatformAdminService', () => {
  describe('recordAdminAction', () => {
    it('returns mapped action record', async () => {
      const pool = makePool([ok([actionRow])]);
      const svc = new PlatformAdminService(pool);
      const result = await svc.recordAdminAction({
        adminId: 'admin-1',
        actionType: 'suspend_org',
        payload: { orgId: 'org-1' },
        notes: 'Test note',
      });
      expect(result.id).toBe('act-1');
      expect(result.adminId).toBe('admin-1');
      expect(result.notes).toBe('Test note');
    });

    it('throws when no row returned', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformAdminService(pool);
      await expect(
        svc.recordAdminAction({ adminId: 'a', actionType: 'x', payload: {} }),
      ).rejects.toThrow('Failed to insert admin action');
    });
  });

  describe('listAdminActions', () => {
    it('returns all actions with no filters', async () => {
      const pool = makePool([ok([actionRow])]);
      const svc = new PlatformAdminService(pool);
      const result = await svc.listAdminActions();
      expect(result).toHaveLength(1);
      expect(result[0]?.actionType).toBe('suspend_org');
    });

    it('filters by adminId and actionType', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformAdminService(pool);
      await svc.listAdminActions({ adminId: 'admin-1', actionType: 'suspend_org', limit: 5 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain('admin-1');
      expect(params).toContain('suspend_org');
      expect(params).toContain(5);
    });
  });

  describe('recordMetric', () => {
    it('returns mapped metric record', async () => {
      const pool = makePool([ok([metricRow])]);
      const svc = new PlatformAdminService(pool);
      const result = await svc.recordMetric({ metricName: 'active_orgs', value: 42 });
      expect(result.id).toBe('met-1');
      expect(result.value).toBe(42);
    });

    it('throws when no row returned', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformAdminService(pool);
      await expect(svc.recordMetric({ metricName: 'x', value: 0 })).rejects.toThrow(
        'Failed to insert platform metric',
      );
    });
  });

  describe('getMetrics', () => {
    it('returns metrics list', async () => {
      const pool = makePool([ok([metricRow])]);
      const svc = new PlatformAdminService(pool);
      const result = await svc.getMetrics({ metricName: 'active_orgs', limit: 10 });
      expect(result[0]?.metricName).toBe('active_orgs');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain('active_orgs');
      expect(params).toContain(10);
    });
  });
});
