import { describe, it, expect, vi } from 'vitest';
import { SystemConfigService } from '../config/SystemConfigService.js';
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
  id: 'syscfg-1',
  key: 'maintenance_mode',
  value: false,
  description: 'Toggle maintenance mode',
  updated_by: 'admin-1',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('SystemConfigService', () => {
  describe('upsertConfig', () => {
    it('inserts config and returns mapped result', async () => {
      const pool = makePool([ok([configRow])]);
      const svc = new SystemConfigService(pool);
      const result = await svc.upsertConfig({
        key: 'maintenance_mode',
        value: false,
        updatedBy: 'admin-1',
        description: 'Toggle maintenance mode',
      });
      expect(result.id).toBe('syscfg-1');
      expect(result.key).toBe('maintenance_mode');
      expect(result.updatedBy).toBe('admin-1');
    });

    it('passes null description when omitted', async () => {
      const pool = makePool([ok([configRow])]);
      const svc = new SystemConfigService(pool);
      await svc.upsertConfig({ key: 'x', value: 1, updatedBy: 'admin-1' });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]![2]).toBeNull();
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new SystemConfigService(pool);
      await expect(svc.upsertConfig({ key: 'x', value: 1, updatedBy: 'admin-1' })).rejects.toThrow(
        'Upsert into system_config returned no row',
      );
    });
  });

  describe('getConfig', () => {
    it('returns config when found', async () => {
      const pool = makePool([ok([configRow])]);
      const svc = new SystemConfigService(pool);
      const result = await svc.getConfig('maintenance_mode');
      expect(result).not.toBeNull();
      expect(result!.key).toBe('maintenance_mode');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new SystemConfigService(pool);
      const result = await svc.getConfig('nonexistent');
      expect(result).toBeNull();
    });

    it('passes key as parameter', async () => {
      const pool = makePool([ok([])]);
      const svc = new SystemConfigService(pool);
      await svc.getConfig('my_key');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain('my_key');
    });
  });

  describe('getConfigValue', () => {
    it('returns typed value when config exists', async () => {
      const pool = makePool([ok([{ ...configRow, value: true }])]);
      const svc = new SystemConfigService(pool);
      const val = await svc.getConfigValue<boolean>('maintenance_mode');
      expect(val).toBe(true);
    });

    it('returns null when config not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new SystemConfigService(pool);
      const val = await svc.getConfigValue('nonexistent');
      expect(val).toBeNull();
    });
  });

  describe('listConfigs', () => {
    it('returns all configs', async () => {
      const pool = makePool([ok([configRow])]);
      const svc = new SystemConfigService(pool);
      const results = await svc.listConfigs();
      expect(results).toHaveLength(1);
      expect(results[0]!.key).toBe('maintenance_mode');
    });

    it('returns empty array when no configs', async () => {
      const pool = makePool([ok([])]);
      const svc = new SystemConfigService(pool);
      const results = await svc.listConfigs();
      expect(results).toHaveLength(0);
    });
  });

  describe('deleteConfig', () => {
    it('returns true when row deleted', async () => {
      const pool = makePool([{ rows: [], rowCount: 1, command: 'DELETE', oid: 0, fields: [] }]);
      const svc = new SystemConfigService(pool);
      const result = await svc.deleteConfig('maintenance_mode');
      expect(result).toBe(true);
    });

    it('returns false when no row deleted', async () => {
      const pool = makePool([{ rows: [], rowCount: 0, command: 'DELETE', oid: 0, fields: [] }]);
      const svc = new SystemConfigService(pool);
      const result = await svc.deleteConfig('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('isMaintenanceMode', () => {
    it('returns true when maintenance_mode is true', async () => {
      const pool = makePool([ok([{ ...configRow, value: true }])]);
      const svc = new SystemConfigService(pool);
      const result = await svc.isMaintenanceMode();
      expect(result).toBe(true);
    });

    it('returns false when maintenance_mode is false', async () => {
      const pool = makePool([ok([{ ...configRow, value: false }])]);
      const svc = new SystemConfigService(pool);
      const result = await svc.isMaintenanceMode();
      expect(result).toBe(false);
    });

    it('returns false when config not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new SystemConfigService(pool);
      const result = await svc.isMaintenanceMode();
      expect(result).toBe(false);
    });
  });
});
