import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PermissionService } from '../PermissionService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const PERM_ID = '00000000-0000-0000-0000-000000000010';
const ROLE_ID = '00000000-0000-0000-0000-000000000020';
const MEMBER_ID = '00000000-0000-0000-0000-000000000030';

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

function permRow(overrides: Partial<{ resource: string; action: string }> = {}) {
  return {
    id: PERM_ID,
    organization_id: ORG,
    name: 'Create Workflow',
    slug: 'workflow:create',
    resource: overrides.resource ?? 'workflow',
    action: overrides.action ?? 'create',
    description: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('PermissionService.createPermission', () => {
  it('sets tenant context before insert', async () => {
    const pool = makePool([ok([]), ok([permRow()])]);
    const svc = new PermissionService(pool);
    await svc.createPermission({
      organizationId: ORG,
      name: 'Create Workflow',
      slug: 'workflow:create',
      resource: 'workflow',
      action: 'create',
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns mapped Permission domain object', async () => {
    const pool = makePool([ok([]), ok([permRow()])]);
    const svc = new PermissionService(pool);
    const result = await svc.createPermission({
      organizationId: ORG,
      name: 'Create Workflow',
      slug: 'workflow:create',
      resource: 'workflow',
      action: 'create',
    });
    expect(result.id).toBe(PERM_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.resource).toBe('workflow');
    expect(result.action).toBe('create');
    expect(result.description).toBeNull();
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PermissionService(pool);
    await expect(
      svc.createPermission({
        organizationId: ORG,
        name: 'X',
        slug: 'x:y',
        resource: 'x',
        action: 'y',
      }),
    ).rejects.toThrow('INSERT into permissions returned no row');
  });

  it('uses parameterized query — no orgId interpolation', async () => {
    const pool = makePool([ok([]), ok([permRow()])]);
    const svc = new PermissionService(pool);
    await svc.createPermission({
      organizationId: ORG,
      name: 'X',
      slug: 'x:y',
      resource: 'x',
      action: 'y',
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    for (const [sql] of calls) {
      expect(sql).not.toContain(ORG);
    }
  });
});

describe('PermissionService.assignPermissionToRole', () => {
  it('executes INSERT with org, role, and permission params', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PermissionService(pool);
    await svc.assignPermissionToRole(ORG, ROLE_ID, PERM_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const insertParams = calls[1]?.[1] ?? [];
    expect(insertParams).toContain(ORG);
    expect(insertParams).toContain(ROLE_ID);
    expect(insertParams).toContain(PERM_ID);
  });

  it('sets tenant context before insert', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PermissionService(pool);
    await svc.assignPermissionToRole(ORG, ROLE_ID, PERM_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
  });
});

describe('PermissionService.getPermissionsForRole', () => {
  it('returns permissions for a role', async () => {
    const pool = makePool([ok([]), ok([permRow()])]);
    const svc = new PermissionService(pool);
    const result = await svc.getPermissionsForRole(ORG, ROLE_ID);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(PERM_ID);
  });

  it('returns empty array when role has no permissions', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PermissionService(pool);
    const result = await svc.getPermissionsForRole(ORG, ROLE_ID);
    expect(result).toEqual([]);
  });
});

describe('PermissionService.checkPermission', () => {
  it('returns true when member has permission', async () => {
    const pool = makePool([ok([]), ok([{ count: '1' }])]);
    const svc = new PermissionService(pool);
    const result = await svc.checkPermission(ORG, MEMBER_ID, 'workflow', 'create');
    expect(result).toBe(true);
  });

  it('returns false when member lacks permission', async () => {
    const pool = makePool([ok([]), ok([{ count: '0' }])]);
    const svc = new PermissionService(pool);
    const result = await svc.checkPermission(ORG, MEMBER_ID, 'workflow', 'delete');
    expect(result).toBe(false);
  });

  it('passes resource and action as params', async () => {
    const pool = makePool([ok([]), ok([{ count: '0' }])]);
    const svc = new PermissionService(pool);
    await svc.checkPermission(ORG, MEMBER_ID, 'report', 'export');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain('report');
    expect(params).toContain('export');
  });
});

describe('PermissionService.listPermissions', () => {
  it('returns all permissions for org', async () => {
    const rows = [permRow({ resource: 'workflow' }), permRow({ resource: 'report' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new PermissionService(pool);
    const result = await svc.listPermissions(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no permissions', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PermissionService(pool);
    const result = await svc.listPermissions(ORG);
    expect(result).toEqual([]);
  });
});
