import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TenantOperationsService } from '../TenantOperationsService.js';

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

const tenantRow = {
  id: 'tenant-1',
  name: 'Galaxy Corp',
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const settingRow = {
  tenant_id: 'tenant-1',
  key: 'timezone',
  value: 'UTC',
};

describe('TenantOperationsService', () => {
  describe('createTenant', () => {
    it('returns created tenant', async () => {
      const pool = makePool([ok([tenantRow])]);
      const svc = new TenantOperationsService(pool);
      const result = await svc.createTenant({ name: 'Galaxy Corp', status: 'active' });
      expect(result.id).toBe('tenant-1');
      expect(result.status).toBe('active');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantOperationsService(pool);
      await expect(svc.createTenant({ name: 'x' })).rejects.toThrow('Failed to create tenant');
    });
  });

  describe('getTenant', () => {
    it('returns tenant when found', async () => {
      const pool = makePool([ok([tenantRow])]);
      const svc = new TenantOperationsService(pool);
      const result = await svc.getTenant('tenant-1');
      expect(result?.name).toBe('Galaxy Corp');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantOperationsService(pool);
      const result = await svc.getTenant('missing');
      expect(result).toBeNull();
    });
  });

  describe('listTenants', () => {
    it('returns all tenants', async () => {
      const pool = makePool([ok([tenantRow])]);
      const svc = new TenantOperationsService(pool);
      const result = await svc.listTenants();
      expect(result[0]?.id).toBe('tenant-1');
    });

    it('passes status, limit and offset filters', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantOperationsService(pool);
      await svc.listTenants({ status: 'active', limit: 10, offset: 5 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain('active');
      expect(params).toContain(10);
      expect(params).toContain(5);
    });
  });

  describe('updateTenantStatus', () => {
    it('returns updated tenant', async () => {
      const suspended = { ...tenantRow, status: 'suspended' };
      const pool = makePool([ok([suspended])]);
      const svc = new TenantOperationsService(pool);
      const result = await svc.updateTenantStatus('tenant-1', 'suspended');
      expect(result?.status).toBe('suspended');
    });

    it('returns null when tenant not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantOperationsService(pool);
      const result = await svc.updateTenantStatus('missing', 'active');
      expect(result).toBeNull();
    });
  });

  describe('setSetting', () => {
    it('returns upserted setting', async () => {
      const pool = makePool([ok([settingRow])]);
      const svc = new TenantOperationsService(pool);
      const result = await svc.setSetting('tenant-1', 'timezone', 'UTC');
      expect(result.key).toBe('timezone');
      expect(result.value).toBe('UTC');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new TenantOperationsService(pool);
      await expect(svc.setSetting('tenant-1', 'x', 'y')).rejects.toThrow(
        'Failed to set tenant setting',
      );
    });
  });

  describe('getSettings', () => {
    it('returns settings for tenant', async () => {
      const pool = makePool([ok([settingRow])]);
      const svc = new TenantOperationsService(pool);
      const result = await svc.getSettings('tenant-1');
      expect(result[0]?.key).toBe('timezone');
      expect(result[0]?.value).toBe('UTC');
    });
  });
});
