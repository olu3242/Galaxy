import { describe, it, expect, vi } from 'vitest';
import { ConfigurationService } from '../config/ConfigurationService.js';
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

const configRow = {
  id: 'cfg-1',
  organization_id: 'org-1',
  scope: 'workflow',
  key: 'max_steps',
  value: 10,
  updated_by: 'admin-1',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('ConfigurationService', () => {
  describe('getConfig', () => {
    it('sets tenant context then queries config', async () => {
      const pool = makePool([ok([]), ok([configRow])]);
      const svc = new ConfigurationService(pool);
      const result = await svc.getConfig('org-1', 'workflow', 'max_steps');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('cfg-1');
      expect(result!.scope).toBe('workflow');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0][0]).toContain('set_config');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ConfigurationService(pool);
      const result = await svc.getConfig('org-1', 'workflow', 'missing');
      expect(result).toBeNull();
    });

    it('passes org, scope, and key as parameters', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ConfigurationService(pool);
      await svc.getConfig('org-1', 'security', 'mfa_required');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1][1]).toContain('org-1');
      expect(calls[1][1]).toContain('security');
      expect(calls[1][1]).toContain('mfa_required');
    });
  });

  describe('setConfig', () => {
    it('sets tenant context then upserts config', async () => {
      const pool = makePool([ok([]), ok([configRow])]);
      const svc = new ConfigurationService(pool);
      const result = await svc.setConfig('org-1', 'workflow', 'max_steps', 10, 'admin-1');
      expect(result.key).toBe('max_steps');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0][0]).toContain('set_config');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ConfigurationService(pool);
      await expect(svc.setConfig('org-1', 'workflow', 'max_steps', 10, 'admin-1')).rejects.toThrow(
        'Config upsert failed',
      );
    });
  });

  describe('listConfigs', () => {
    it('returns all configs for org', async () => {
      const pool = makePool([ok([]), ok([configRow])]);
      const svc = new ConfigurationService(pool);
      const results = await svc.listConfigs('org-1');
      expect(results).toHaveLength(1);
      expect(results[0]!.organizationId).toBe('org-1');
    });

    it('returns empty array when no configs', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ConfigurationService(pool);
      const results = await svc.listConfigs('org-1');
      expect(results).toHaveLength(0);
    });

    it('passes scope filter when provided', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ConfigurationService(pool);
      await svc.listConfigs('org-1', 'security');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1][1]).toContain('security');
    });

    it('does not pass scope when undefined', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ConfigurationService(pool);
      await svc.listConfigs('org-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1][1]).toHaveLength(1);
    });
  });

  describe('deleteConfig', () => {
    it('returns true when row was deleted', async () => {
      const pool = makePool([
        ok([]),
        { rows: [], rowCount: 1, command: 'DELETE', oid: 0, fields: [] },
      ]);
      const svc = new ConfigurationService(pool);
      const result = await svc.deleteConfig('org-1', 'workflow', 'max_steps');
      expect(result).toBe(true);
    });

    it('returns false when no row was deleted', async () => {
      const pool = makePool([
        ok([]),
        { rows: [], rowCount: 0, command: 'DELETE', oid: 0, fields: [] },
      ]);
      const svc = new ConfigurationService(pool);
      const result = await svc.deleteConfig('org-1', 'workflow', 'nonexistent');
      expect(result).toBe(false);
    });
  });
});
