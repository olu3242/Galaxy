import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import { RoleService } from '../RoleService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const ROLE_ID = '00000000-0000-0000-0000-000000000010';
const ACTOR = '00000000-0000-0000-0000-000000000020';
const CORRELATION = '00000000-0000-0000-0000-000000000099';

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

function roleRow(overrides: Partial<{ slug: string; scope: string; is_system: boolean }> = {}) {
  return {
    id: ROLE_ID,
    organization_id: ORG,
    name: 'Manager',
    slug: overrides.slug ?? 'dept:manager',
    scope: overrides.scope ?? 'department',
    description: 'Manages department operations',
    is_system: overrides.is_system ?? false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('RoleService.createRole', () => {
  it('sets tenant context before insert', async () => {
    const pool = makePool([ok([]), ok([roleRow()])]);
    const svc = new RoleService(pool);
    await svc.createRole({
      organizationId: ORG,
      name: 'Manager',
      slug: 'dept:manager',
      correlationId: CORRELATION,
      actorId: ACTOR,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
    expect((calls[0] as [string, unknown[]])[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns mapped Role domain object', async () => {
    const pool = makePool([ok([]), ok([roleRow()])]);
    const svc = new RoleService(pool);
    const result = await svc.createRole({
      organizationId: ORG,
      name: 'Manager',
      slug: 'dept:manager',
      correlationId: CORRELATION,
      actorId: ACTOR,
    });
    expect(result.id).toBe(ROLE_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.slug).toBe('dept:manager');
    expect(result.scope).toBe('department');
    expect(result.isSystem).toBe(false);
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new RoleService(pool);
    await expect(
      svc.createRole({
        organizationId: ORG,
        name: 'X',
        slug: 'x',
        correlationId: CORRELATION,
        actorId: ACTOR,
      }),
    ).rejects.toThrow('INSERT into roles returned no row');
  });

  it('defaults scope to organization when not provided', async () => {
    const orgScopeRow = roleRow({ scope: 'organization' });
    const pool = makePool([ok([]), ok([orgScopeRow])]);
    const svc = new RoleService(pool);
    const result = await svc.createRole({
      organizationId: ORG,
      name: 'Member',
      slug: 'org:member',
      correlationId: CORRELATION,
      actorId: ACTOR,
    });
    expect(result.scope).toBe('organization');
  });

  it('publishes role.created event when publisher provided', async () => {
    const pool = makePool([ok([]), ok([roleRow()])]);
    const publishFn = vi.fn().mockResolvedValue(undefined);
    const publisher = { publish: publishFn } as unknown as EventPublisher;
    const svc = new RoleService(pool, publisher);
    await svc.createRole({
      organizationId: ORG,
      name: 'Manager',
      slug: 'dept:manager',
      correlationId: CORRELATION,
      actorId: ACTOR,
    });
    expect(publishFn).toHaveBeenCalledOnce();
    expect(publishFn).toHaveBeenCalledWith(expect.objectContaining({ type: 'role.created' }));
  });

  it('does not throw when no publisher provided', async () => {
    const pool = makePool([ok([]), ok([roleRow()])]);
    const svc = new RoleService(pool);
    await expect(
      svc.createRole({
        organizationId: ORG,
        name: 'Member',
        slug: 'org:member',
        correlationId: CORRELATION,
        actorId: ACTOR,
      }),
    ).resolves.toBeDefined();
  });
});

describe('RoleService.getRolesForOrg', () => {
  it('returns all roles for org', async () => {
    const rows = [roleRow(), { ...roleRow(), id: '00000000-0000-0000-0000-000000000099' }];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new RoleService(pool);
    const result = await svc.getRolesForOrg(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no roles', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new RoleService(pool);
    const result = await svc.getRolesForOrg(ORG);
    expect(result).toEqual([]);
  });
});

describe('RoleService.getRoleById', () => {
  it('returns role when found', async () => {
    const pool = makePool([ok([]), ok([roleRow()])]);
    const svc = new RoleService(pool);
    const result = await svc.getRoleById(ORG, ROLE_ID);
    expect(result?.id).toBe(ROLE_ID);
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new RoleService(pool);
    const result = await svc.getRoleById(ORG, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('RoleService.provisionDefaultRoles', () => {
  it('creates 6 system roles', async () => {
    // Each createRole call makes 2 queries: set_config + INSERT
    // 6 roles × 2 queries = 12 total
    const responses: QueryResult[] = [];
    const slugs = [
      'org:owner',
      'org:executive',
      'dept:head',
      'dept:manager',
      'team:lead',
      'org:member',
    ];
    for (const slug of slugs) {
      responses.push(ok([])); // set_config
      responses.push(ok([roleRow({ slug, is_system: true })])); // INSERT RETURNING
    }
    const pool = makePool(responses);
    const svc = new RoleService(pool);
    const result = await svc.provisionDefaultRoles(ORG, CORRELATION);
    expect(result).toHaveLength(6);
  });

  it('marks all provisioned roles as system roles', async () => {
    const responses: QueryResult[] = [];
    const defaultSlugs = [
      'org:owner',
      'org:executive',
      'dept:head',
      'dept:manager',
      'team:lead',
      'org:member',
    ];
    for (const slug of defaultSlugs) {
      responses.push(ok([]));
      responses.push(ok([roleRow({ slug, is_system: true })]));
    }
    const pool = makePool(responses);
    const svc = new RoleService(pool);
    const result = await svc.provisionDefaultRoles(ORG, CORRELATION);
    expect(result.every((r) => r.isSystem)).toBe(true);
  });
});
