import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TenantService } from '../TenantService.js';

const ORG = '00000000-0000-0000-0000-000000000001';

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

describe('TenantService.setTenantContext', () => {
  it('issues set_config with correct params', async () => {
    const pool = makePool([ok([])]);
    const svc = new TenantService(pool);
    await svc.setTenantContext(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
    expect((calls[0] as [string, unknown[]])[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('uses parameterized query — no orgId interpolation', async () => {
    const pool = makePool([ok([])]);
    const svc = new TenantService(pool);
    await svc.setTenantContext(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).not.toContain(ORG);
  });
});

describe('TenantService.getCurrentTenant', () => {
  it('returns the current tenant id when set', async () => {
    const pool = makePool([ok([{ current_tenant: ORG }])]);
    const svc = new TenantService(pool);
    const result = await svc.getCurrentTenant();
    expect(result).toBe(ORG);
  });

  it('returns null when current_setting returns empty string', async () => {
    const pool = makePool([ok([{ current_tenant: '' }])]);
    const svc = new TenantService(pool);
    const result = await svc.getCurrentTenant();
    expect(result).toBeNull();
  });

  it('returns null when no row returned', async () => {
    const pool = makePool([ok([])]);
    const svc = new TenantService(pool);
    const result = await svc.getCurrentTenant();
    expect(result).toBeNull();
  });
});

describe('TenantService.assertOrganizationActive', () => {
  it('resolves without error when org is active', async () => {
    const pool = makePool([ok([{ status: 'active' }])]);
    const svc = new TenantService(pool);
    await expect(svc.assertOrganizationActive(ORG)).resolves.toBeUndefined();
  });

  it('throws when org not found', async () => {
    const pool = makePool([ok([])]);
    const svc = new TenantService(pool);
    await expect(svc.assertOrganizationActive(ORG)).rejects.toThrow('not found');
  });

  it('throws when org status is not active', async () => {
    const pool = makePool([ok([{ status: 'suspended' }])]);
    const svc = new TenantService(pool);
    await expect(svc.assertOrganizationActive(ORG)).rejects.toThrow('not active');
  });

  it('passes orgId as parameter — no interpolation', async () => {
    const pool = makePool([ok([{ status: 'active' }])]);
    const svc = new TenantService(pool);
    await svc.assertOrganizationActive(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).not.toContain(ORG);
    expect((calls[0] as [string, unknown[]])[1]).toContain(ORG);
  });
});

describe('TenantService.withTenant', () => {
  it('sets tenant context then calls the callback', async () => {
    const pool = makePool([ok([])]);
    const svc = new TenantService(pool);
    const fn = vi.fn().mockResolvedValue('result');

    const result = await svc.withTenant(ORG, fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledOnce();
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('propagates errors from the callback', async () => {
    const pool = makePool([ok([])]);
    const svc = new TenantService(pool);
    const fn = vi.fn().mockRejectedValue(new Error('callback error'));

    await expect(svc.withTenant(ORG, fn)).rejects.toThrow('callback error');
  });
});
