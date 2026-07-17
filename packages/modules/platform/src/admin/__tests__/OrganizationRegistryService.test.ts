import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OrganizationRegistryService } from '../OrganizationRegistryService.js';

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

const orgRow = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  status: 'active',
  plan: 'pro',
  member_count: '5',
  created_at: '2024-01-01T00:00:00Z',
};

describe('OrganizationRegistryService', () => {
  describe('searchOrganizations', () => {
    it('returns mapped entries', async () => {
      const pool = makePool([ok([orgRow])]);
      const svc = new OrganizationRegistryService(pool);
      const result = await svc.searchOrganizations('acme');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('org-1');
      expect(result[0]?.memberCount).toBe(5);
    });

    it('returns empty array when no matches', async () => {
      const pool = makePool([ok([])]);
      const svc = new OrganizationRegistryService(pool);
      const result = await svc.searchOrganizations('unknown');
      expect(result).toHaveLength(0);
    });

    it('passes query and limit to pool', async () => {
      const pool = makePool([ok([])]);
      const svc = new OrganizationRegistryService(pool);
      await svc.searchOrganizations('test', 5);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      const params = calls[0]?.[1] ?? [];
      expect(params[0]).toBe('%test%');
      expect(params[1]).toBe(5);
    });
  });

  describe('getOrgStats', () => {
    it('parses stats row', async () => {
      const statsRow = { total: '10', active: '7', suspended: '2', trial: '1' };
      const pool = makePool([ok([statsRow])]);
      const svc = new OrganizationRegistryService(pool);
      const result = await svc.getOrgStats();
      expect(result).toEqual({ total: 10, active: 7, suspended: 2, trial: 1 });
    });

    it('returns zeros when no rows', async () => {
      const pool = makePool([ok([])]);
      const svc = new OrganizationRegistryService(pool);
      const result = await svc.getOrgStats();
      expect(result).toEqual({ total: 0, active: 0, suspended: 0, trial: 0 });
    });
  });

  describe('listOrganizations', () => {
    it('returns mapped entries', async () => {
      const pool = makePool([ok([orgRow])]);
      const svc = new OrganizationRegistryService(pool);
      const result = await svc.listOrganizations();
      expect(result[0]?.name).toBe('Acme');
    });

    it('passes limit and offset', async () => {
      const pool = makePool([ok([])]);
      const svc = new OrganizationRegistryService(pool);
      await svc.listOrganizations({ limit: 10, offset: 5 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain(10);
      expect(params).toContain(5);
    });
  });
});
