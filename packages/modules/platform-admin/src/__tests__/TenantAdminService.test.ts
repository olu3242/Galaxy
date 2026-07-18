import { describe, it, expect, vi } from 'vitest';
import { TenantAdminService } from '../tenants/TenantAdminService.js';
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
  name: 'Acme Corp',
  slug: 'acme',
  status: 'active',
  plan: 'starter',
  member_count: '10',
  workflow_count: '5',
  created_at: '2024-01-01T00:00:00Z',
};

describe('TenantAdminService', () => {
  describe('listAllTenants', () => {
    it('returns mapped tenant summaries', async () => {
      const pool = makePool([ok([orgRow])]);
      const svc = new TenantAdminService(pool);
      const results = await svc.listAllTenants();
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('org-1');
      expect(results[0]!.memberCount).toBe(10);
      expect(results[0]!.workflowCount).toBe(5);
    });

    it('returns empty array when no tenants', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantAdminService(pool);
      const results = await svc.listAllTenants();
      expect(results).toHaveLength(0);
    });

    it('passes status filter as parameter', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantAdminService(pool);
      await svc.listAllTenants({ status: 'suspended' });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain('suspended');
    });

    it('passes limit and offset', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantAdminService(pool);
      await svc.listAllTenants({ limit: 10, offset: 5 });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain(10);
      expect(calls[0]![1]).toContain(5);
    });
  });

  describe('getTenant', () => {
    it('returns tenant when found', async () => {
      const pool = makePool([ok([orgRow])]);
      const svc = new TenantAdminService(pool);
      const result = await svc.getTenant('org-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('org-1');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantAdminService(pool);
      const result = await svc.getTenant('nonexistent');
      expect(result).toBeNull();
    });

    it('passes tenantId as parameter', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantAdminService(pool);
      await svc.getTenant('org-42');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain('org-42');
    });
  });

  describe('suspendTenant', () => {
    it('returns suspended tenant summary', async () => {
      const suspendedRow = {
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme',
        status: 'suspended',
        plan: 'starter',
        created_at: '2024-01-01T00:00:00Z',
      };
      const pool = makePool([ok([suspendedRow])]);
      const svc = new TenantAdminService(pool);
      const result = await svc.suspendTenant('org-1');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('suspended');
      expect(result!.memberCount).toBe(0);
    });

    it('returns null when tenant not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantAdminService(pool);
      const result = await svc.suspendTenant('nonexistent');
      expect(result).toBeNull();
    });

    it('passes tenantId as parameter', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantAdminService(pool);
      await svc.suspendTenant('org-1');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain('org-1');
    });
  });

  describe('reinstateTenant', () => {
    it('returns reinstated tenant summary', async () => {
      const activeRow = {
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme',
        status: 'active',
        plan: 'starter',
        created_at: '2024-01-01T00:00:00Z',
      };
      const pool = makePool([ok([activeRow])]);
      const svc = new TenantAdminService(pool);
      const result = await svc.reinstateTenant('org-1');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('active');
    });

    it('returns null when tenant not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantAdminService(pool);
      const result = await svc.reinstateTenant('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getTenantUsageSummary', () => {
    it('returns usage counts from all tables', async () => {
      const pool = makePool([
        ok([{ count: '10' }]), // members
        ok([{ count: '5' }]), // workflows
        ok([{ count: '2' }]), // agents
        ok([{ count: '1000' }]), // events
      ]);
      const svc = new TenantAdminService(pool);
      const usage = await svc.getTenantUsageSummary('org-1');
      expect(usage.members).toBe(10);
      expect(usage.workflows).toBe(5);
      expect(usage.agents).toBe(2);
      expect(usage.events).toBe(1000);
    });

    it('returns zeros when tables are empty', async () => {
      const pool = makePool([
        ok([{ count: '0' }]),
        ok([{ count: '0' }]),
        ok([{ count: '0' }]),
        ok([{ count: '0' }]),
      ]);
      const svc = new TenantAdminService(pool);
      const usage = await svc.getTenantUsageSummary('org-1');
      expect(Object.values(usage).every((v) => v === 0)).toBe(true);
    });

    it('passes tenantId to all queries', async () => {
      const pool = makePool([
        ok([{ count: '0' }]),
        ok([{ count: '0' }]),
        ok([{ count: '0' }]),
        ok([{ count: '0' }]),
      ]);
      const svc = new TenantAdminService(pool);
      await svc.getTenantUsageSummary('org-99');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      for (const call of calls) {
        expect(call[1]).toContain('org-99');
      }
    });
  });
});
