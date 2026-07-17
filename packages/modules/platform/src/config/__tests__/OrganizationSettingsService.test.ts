import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OrganizationSettingsService } from '../OrganizationSettingsService.js';

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
  organization_id: 'org-1',
  namespace: 'notifications',
  key: 'email_enabled',
  value: 'true',
  updated_at: '2024-01-01T00:00:00Z',
};

const schemaRow = {
  namespace: 'notifications',
  key: 'email_enabled',
  value_type: 'boolean',
  default_value: 'false',
  description: 'Enable email notifications',
};

describe('OrganizationSettingsService', () => {
  describe('getSetting', () => {
    it('returns value from config when present', async () => {
      // set_config + SELECT value
      const pool = makePool([ok([]), ok([{ value: 'true' }])]);
      const svc = new OrganizationSettingsService(pool);
      const result = await svc.getSetting('org-1', 'notifications', 'email_enabled');
      expect(result).toBe('true');
    });

    it('falls back to schema default when config not found', async () => {
      // set_config + SELECT value (empty) + SELECT schema
      const pool = makePool([ok([]), ok([]), ok([schemaRow])]);
      const svc = new OrganizationSettingsService(pool);
      const result = await svc.getSetting('org-1', 'notifications', 'email_enabled');
      expect(result).toBe('false');
    });

    it('returns null when config and schema both missing', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new OrganizationSettingsService(pool);
      const result = await svc.getSetting('org-1', 'ns', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('setSetting', () => {
    it('delegates to ConfigurationService.set', async () => {
      const pool = makePool([ok([]), ok([configRow])]);
      const svc = new OrganizationSettingsService(pool);
      const result = await svc.setSetting('org-1', 'notifications', 'email_enabled', 'true');
      expect(result.key).toBe('email_enabled');
      expect(result.value).toBe('true');
    });
  });

  describe('getSchema', () => {
    it('returns schema when found', async () => {
      const pool = makePool([ok([schemaRow])]);
      const svc = new OrganizationSettingsService(pool);
      const result = await svc.getSchema('notifications', 'email_enabled');
      expect(result?.valueType).toBe('boolean');
      expect(result?.defaultValue).toBe('false');
    });

    it('returns null when schema not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new OrganizationSettingsService(pool);
      const result = await svc.getSchema('ns', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('listSchemas', () => {
    it('returns all schemas', async () => {
      const pool = makePool([ok([schemaRow])]);
      const svc = new OrganizationSettingsService(pool);
      const result = await svc.listSchemas();
      expect(result[0]?.namespace).toBe('notifications');
    });

    it('passes namespace filter', async () => {
      const pool = makePool([ok([schemaRow])]);
      const svc = new OrganizationSettingsService(pool);
      await svc.listSchemas('notifications');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain('notifications');
    });
  });

  describe('registerSchema', () => {
    it('returns registered schema', async () => {
      const pool = makePool([ok([schemaRow])]);
      const svc = new OrganizationSettingsService(pool);
      const result = await svc.registerSchema({
        namespace: 'notifications',
        key: 'email_enabled',
        valueType: 'boolean',
        defaultValue: 'false',
      });
      expect(result.key).toBe('email_enabled');
      expect(result.valueType).toBe('boolean');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new OrganizationSettingsService(pool);
      await expect(
        svc.registerSchema({ namespace: 'ns', key: 'k', valueType: 'string' }),
      ).rejects.toThrow('Failed to register schema');
    });
  });
});
