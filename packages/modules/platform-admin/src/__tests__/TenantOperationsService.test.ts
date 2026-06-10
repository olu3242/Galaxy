import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantOperationsService } from '../tenants/TenantOperationsService.js';
import type { Pool, QueryResult } from 'pg';

function makePool(rows: unknown[][]): Pool {
  let callIdx = 0;
  const query = vi.fn().mockImplementation(() => {
    const currentRows = rows[callIdx] ?? [];
    callIdx++;
    return Promise.resolve({ rows: currentRows, rowCount: currentRows.length } as QueryResult);
  });
  return { query } as unknown as Pool;
}

describe('TenantOperationsService', () => {
  let pool: Pool;

  const orgRow = {
    id: 'org-1',
    name: 'Acme Corp',
    slug: 'acme',
    status: 'provisioning',
    plan: 'starter',
    settings: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createTenant inserts org, limits, and lifecycle', async () => {
    pool = makePool([
      [orgRow],          // INSERT organizations
      [],                // INSERT tenant_limits
      [],                // INSERT tenant_lifecycle
    ]);
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.createTenant({
      name: 'Acme Corp',
      slug: 'acme',
      plan: 'starter',
      adminEmail: 'admin@acme.com',
    });
    expect(tenant.id).toBe('org-1');
    expect(tenant.name).toBe('Acme Corp');
    expect(tenant.status).toBe('provisioning');
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
  });

  it('suspendTenant updates status and logs lifecycle', async () => {
    const suspendedRow = { ...orgRow, status: 'suspended' };
    pool = makePool([
      [],               // INSERT tenant_lifecycle (pre-transition log)
      [suspendedRow],   // UPDATE organizations
      [],               // INSERT tenant_lifecycle (post-transition)
      [],               // SELECT tenant_limits
    ]);
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.suspendTenant('org-1', 'Non-payment');
    expect(tenant.status).toBe('suspended');
  });

  it('getTenant returns null when not found', async () => {
    pool = makePool([
      [],    // set_config
      [],    // SELECT organizations
    ]);
    const svc = new TenantOperationsService(pool);
    const result = await svc.getTenant('nonexistent');
    expect(result).toBeNull();
  });

  it('activateTenant transitions to active', async () => {
    const activeRow = { ...orgRow, status: 'active' };
    pool = makePool([
      [activeRow],  // UPDATE organizations
      [],           // INSERT tenant_lifecycle
      [],           // SELECT tenant_limits
    ]);
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.activateTenant('org-1');
    expect(tenant.status).toBe('active');
  });
});
