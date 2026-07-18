import { describe, it, expect, vi } from 'vitest';
import { FeatureFlagService } from '../feature-flags/FeatureFlagService.js';
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

const flagRow = {
  id: 'flag-1',
  key: 'new_ui',
  description: 'New UI rollout',
  is_enabled: true,
  scope: 'global',
  target_tenant_id: null,
  config: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('FeatureFlagService', () => {
  describe('createFlag', () => {
    it('inserts flag and returns mapped result', async () => {
      const pool = makePool([ok([flagRow])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.createFlag({ key: 'new_ui' });
      expect(result.id).toBe('flag-1');
      expect(result.key).toBe('new_ui');
      expect(result.isEnabled).toBe(true);
    });

    it('defaults isEnabled to false and scope to global', async () => {
      const pool = makePool([ok([{ ...flagRow, is_enabled: false }])]);
      const svc = new FeatureFlagService(pool);
      await svc.createFlag({ key: 'my_flag' });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]![2]).toBe(false);
      expect(calls[0]![1]![3]).toBe('global');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new FeatureFlagService(pool);
      await expect(svc.createFlag({ key: 'x' })).rejects.toThrow(
        'Upsert into feature_flags returned no row',
      );
    });
  });

  describe('getFlag', () => {
    it('returns global flag when no tenantId provided', async () => {
      const pool = makePool([ok([flagRow])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.getFlag('new_ui');
      expect(result).not.toBeNull();
      expect(result!.key).toBe('new_ui');
    });

    it('returns tenant-specific flag when tenantId provided and found', async () => {
      const tenantFlag = { ...flagRow, target_tenant_id: 'org-1', scope: 'tenant' };
      const pool = makePool([ok([tenantFlag])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.getFlag('new_ui', 'org-1');
      expect(result!.targetTenantId).toBe('org-1');
    });

    it('falls back to global flag when tenant-specific not found', async () => {
      const pool = makePool([ok([]), ok([flagRow])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.getFlag('new_ui', 'org-1');
      expect(result).not.toBeNull();
      expect(result!.targetTenantId).toBeNull();
    });

    it('returns null when flag not found globally', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.getFlag('nonexistent', 'org-1');
      expect(result).toBeNull();
    });
  });

  describe('listFlags', () => {
    it('returns all flags without filters', async () => {
      const pool = makePool([ok([flagRow])]);
      const svc = new FeatureFlagService(pool);
      const results = await svc.listFlags();
      expect(results).toHaveLength(1);
    });

    it('passes scope and targetTenantId filters', async () => {
      const pool = makePool([ok([])]);
      const svc = new FeatureFlagService(pool);
      await svc.listFlags({ scope: 'tenant', targetTenantId: 'org-1' });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const params = calls[0]![1] as unknown[];
      expect(params).toContain('tenant');
      expect(params).toContain('org-1');
    });
  });

  describe('toggleFlag', () => {
    it('returns updated flag', async () => {
      const pool = makePool([ok([{ ...flagRow, is_enabled: false }])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.toggleFlag('flag-1', false);
      expect(result!.isEnabled).toBe(false);
    });

    it('returns null when flag not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.toggleFlag('nonexistent', true);
      expect(result).toBeNull();
    });
  });

  describe('isFlagEnabled', () => {
    it('returns true when flag is enabled', async () => {
      const pool = makePool([ok([flagRow])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.isFlagEnabled('new_ui');
      expect(result).toBe(true);
    });

    it('returns false when flag is disabled', async () => {
      const pool = makePool([ok([{ ...flagRow, is_enabled: false }])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.isFlagEnabled('new_ui');
      expect(result).toBe(false);
    });

    it('returns false when flag not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.isFlagEnabled('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('deleteFlag', () => {
    it('returns true when row deleted', async () => {
      const pool = makePool([{ rows: [], rowCount: 1, command: 'DELETE', oid: 0, fields: [] }]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.deleteFlag('flag-1');
      expect(result).toBe(true);
    });

    it('returns false when flag not found', async () => {
      const pool = makePool([{ rows: [], rowCount: 0, command: 'DELETE', oid: 0, fields: [] }]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.deleteFlag('nonexistent');
      expect(result).toBe(false);
    });
  });
});
