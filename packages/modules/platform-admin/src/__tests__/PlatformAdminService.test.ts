import { describe, it, expect, vi } from 'vitest';
import { PlatformAdminService } from '../PlatformAdminService.js';
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

const orgRow = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  status: 'active',
  plan: 'starter',
  member_count: '5',
  workflow_count: '3',
  created_at: '2024-01-01T00:00:00Z',
};

describe('PlatformAdminService', () => {
  describe('getOrgDirectory', () => {
    it('returns mapped tenant summaries', async () => {
      const pool = makePool([ok([orgRow])]);
      const svc = new PlatformAdminService(pool);
      const results = await svc.getOrgDirectory();
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'org-1',
        name: 'Acme',
        memberCount: 5,
        workflowCount: 3,
      });
    });

    it('returns empty array when no orgs', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformAdminService(pool);
      const results = await svc.getOrgDirectory();
      expect(results).toHaveLength(0);
    });

    it('passes status filter as parameterized query', async () => {
      const pool = makePool([ok([orgRow])]);
      const svc = new PlatformAdminService(pool);
      await svc.getOrgDirectory({ status: 'active' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0] as [string, unknown[]])[1]).toContain('active');
    });

    it('passes limit and offset', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformAdminService(pool);
      await svc.getOrgDirectory({ limit: 10, offset: 20 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0] as [string, unknown[]])[1]).toContain(10);
      expect((calls[0] as [string, unknown[]])[1]).toContain(20);
    });

    it('throws if pool.query rejects', async () => {
      const pool = { query: vi.fn().mockRejectedValue(new Error('DB error')) } as unknown as Pool;
      const svc = new PlatformAdminService(pool);
      await expect(svc.getOrgDirectory()).rejects.toThrow('DB error');
    });
  });

  describe('getUserDirectory', () => {
    const userRow = {
      id: 'user-1',
      email: 'alice@acme.com',
      organization_id: 'org-1',
      role: 'admin',
      created_at: '2024-01-01T00:00:00Z',
    };

    it('returns mapped user entries', async () => {
      const pool = makePool([ok([userRow])]);
      const svc = new PlatformAdminService(pool);
      const results = await svc.getUserDirectory();
      expect(results[0]).toMatchObject({
        id: 'user-1',
        email: 'alice@acme.com',
        organizationId: 'org-1',
        role: 'admin',
      });
    });

    it('returns empty array when no users', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformAdminService(pool);
      const results = await svc.getUserDirectory();
      expect(results).toHaveLength(0);
    });

    it('passes organizationId filter', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformAdminService(pool);
      await svc.getUserDirectory({ organizationId: 'org-1' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0] as [string, unknown[]])[1]).toContain('org-1');
    });
  });

  describe('getPlatformHealthSummary', () => {
    it('computes health score correctly', async () => {
      const pool = makePool([
        ok([{ total_orgs: '10', active_orgs: '8', suspended_orgs: '2', total_users: '100' }]),
      ]);
      const svc = new PlatformAdminService(pool);
      const summary = await svc.getPlatformHealthSummary();
      expect(summary.totalOrgs).toBe(10);
      expect(summary.activeOrgs).toBe(8);
      expect(summary.suspendedOrgs).toBe(2);
      expect(summary.totalUsers).toBe(100);
      expect(summary.healthScore).toBe(80);
    });

    it('returns 100 health score when no orgs', async () => {
      const pool = makePool([
        ok([{ total_orgs: '0', active_orgs: '0', suspended_orgs: '0', total_users: '0' }]),
      ]);
      const svc = new PlatformAdminService(pool);
      const summary = await svc.getPlatformHealthSummary();
      expect(summary.healthScore).toBe(100);
    });

    it('handles missing row gracefully', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformAdminService(pool);
      const summary = await svc.getPlatformHealthSummary();
      expect(summary.totalOrgs).toBe(0);
      expect(summary.healthScore).toBe(100);
    });
  });
});
