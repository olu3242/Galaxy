import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ConfigurationService } from '../ConfigurationService.js';

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

describe('ConfigurationService', () => {
  describe('set', () => {
    it('sets tenant context and returns config', async () => {
      const pool = makePool([ok([]), ok([configRow])]);
      const svc = new ConfigurationService(pool);
      const result = await svc.set({
        organizationId: 'org-1',
        namespace: 'notifications',
        key: 'email_enabled',
        value: 'true',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.key).toBe('email_enabled');
      expect(result.value).toBe('true');
    });

    it('throws when upsert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ConfigurationService(pool);
      await expect(
        svc.set({ organizationId: 'org-1', namespace: 'ns', key: 'k', value: 'v' }),
      ).rejects.toThrow('Failed to set configuration');
    });
  });

  describe('get', () => {
    it('sets tenant context and returns value', async () => {
      const pool = makePool([ok([]), ok([{ value: 'true' }])]);
      const svc = new ConfigurationService(pool);
      const result = await svc.get('org-1', 'notifications', 'email_enabled');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result).toBe('true');
    });

    it('returns null when key not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ConfigurationService(pool);
      const result = await svc.get('org-1', 'ns', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('listNamespace', () => {
    it('sets tenant context and returns configs in namespace', async () => {
      const pool = makePool([ok([]), ok([configRow])]);
      const svc = new ConfigurationService(pool);
      const result = await svc.listNamespace('org-1', 'notifications');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result[0]?.namespace).toBe('notifications');
    });
  });

  describe('listAll', () => {
    it('sets tenant context and returns all configs', async () => {
      const pool = makePool([ok([]), ok([configRow])]);
      const svc = new ConfigurationService(pool);
      const result = await svc.listAll('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result).toHaveLength(1);
    });
  });
});
