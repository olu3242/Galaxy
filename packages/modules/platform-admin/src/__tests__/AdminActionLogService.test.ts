import { describe, it, expect, vi } from 'vitest';
import { AdminActionLogService } from '../actions/AdminActionLogService.js';
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

const actionRow = {
  id: 'act-1',
  admin_id: 'admin-1',
  action_type: 'suspend_tenant',
  target_tenant_id: 'org-1',
  payload: { reason: 'test' },
  reason: 'non-payment',
  performed_at: '2024-01-01T00:00:00Z',
};

describe('AdminActionLogService', () => {
  describe('logAction', () => {
    it('inserts action and returns mapped result', async () => {
      const pool = makePool([ok([actionRow])]);
      const svc = new AdminActionLogService(pool);
      const result = await svc.logAction({
        adminId: 'admin-1',
        actionType: 'suspend_tenant',
        payload: { reason: 'test' },
        targetTenantId: 'org-1',
        reason: 'non-payment',
      });
      expect(result.id).toBe('act-1');
      expect(result.adminId).toBe('admin-1');
      expect(result.actionType).toBe('suspend_tenant');
      expect(result.targetTenantId).toBe('org-1');
      expect(result.reason).toBe('non-payment');
    });

    it('defaults targetTenantId and reason to null when omitted', async () => {
      const rowNoTarget = { ...actionRow, target_tenant_id: null, reason: null };
      const pool = makePool([ok([rowNoTarget])]);
      const svc = new AdminActionLogService(pool);
      await svc.logAction({
        adminId: 'admin-1',
        actionType: 'update_system_config',
        payload: {},
      });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]![2]).toBeNull();
      expect(calls[0]![1]![4]).toBeNull();
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new AdminActionLogService(pool);
      await expect(
        svc.logAction({ adminId: 'a', actionType: 'suspend_tenant', payload: {} }),
      ).rejects.toThrow('INSERT INTO admin_action_logs returned no row');
    });
  });

  describe('listActions', () => {
    it('returns all actions without filters', async () => {
      const pool = makePool([ok([actionRow])]);
      const svc = new AdminActionLogService(pool);
      const results = await svc.listActions();
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('act-1');
    });

    it('returns empty array when no results', async () => {
      const pool = makePool([ok([])]);
      const svc = new AdminActionLogService(pool);
      const results = await svc.listActions();
      expect(results).toHaveLength(0);
    });

    it('passes adminId filter as parameter', async () => {
      const pool = makePool([ok([])]);
      const svc = new AdminActionLogService(pool);
      await svc.listActions({ adminId: 'admin-1' });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain('admin-1');
    });

    it('passes all filters correctly', async () => {
      const pool = makePool([ok([])]);
      const svc = new AdminActionLogService(pool);
      await svc.listActions({
        adminId: 'admin-1',
        actionType: 'suspend_tenant',
        targetTenantId: 'org-1',
        limit: 5,
        offset: 10,
      });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const params = calls[0]![1] as unknown[];
      expect(params).toContain('admin-1');
      expect(params).toContain('suspend_tenant');
      expect(params).toContain('org-1');
      expect(params).toContain(5);
      expect(params).toContain(10);
    });
  });

  describe('getAction', () => {
    it('returns action when found', async () => {
      const pool = makePool([ok([actionRow])]);
      const svc = new AdminActionLogService(pool);
      const result = await svc.getAction('act-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('act-1');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new AdminActionLogService(pool);
      const result = await svc.getAction('nonexistent');
      expect(result).toBeNull();
    });

    it('passes actionId as parameter', async () => {
      const pool = makePool([ok([])]);
      const svc = new AdminActionLogService(pool);
      await svc.getAction('act-42');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain('act-42');
    });
  });
});
