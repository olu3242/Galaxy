import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AuditSearchService } from '../AuditSearchService.js';

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

const ORG = '00000000-0000-0000-0000-000000000001';

const pgRow = {
  id: 1,
  organization_id: ORG,
  actor_type: 'member',
  actor_id: 'u1',
  action: 'role.assigned',
  resource_type: 'role',
  resource_id: 'r1',
  ip_address: '127.0.0.1',
  correlation_id: 'corr-1',
  causation_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('AuditSearchService (Postgres fallback — no esUrl)', () => {
  it('sets tenant context as first query', async () => {
    // set_config, count, data
    const pool = makePool([ok([]), ok([{ count: '0' }]), ok([])]);
    const svc = new AuditSearchService(pool);
    await svc.search({ organizationId: ORG });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toContain('set_config');
    expect((calls[0] as [string, unknown[]])[1]).toContain('app.current_tenant');
    expect((calls[0] as [string, unknown[]])[1]).toContain(ORG);
  });

  it('returns source "postgres"', async () => {
    const pool = makePool([ok([]), ok([{ count: '2' }]), ok([pgRow, pgRow])]);
    const svc = new AuditSearchService(pool);
    const result = await svc.search({ organizationId: ORG });
    expect(result.source).toBe('postgres');
  });

  it('returns mapped hits', async () => {
    const pool = makePool([ok([]), ok([{ count: '1' }]), ok([pgRow])]);
    const svc = new AuditSearchService(pool);
    const result = await svc.search({ organizationId: ORG });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.organizationId).toBe(ORG);
    expect(result.hits[0]?.action).toBe('role.assigned');
    expect(result.hits[0]?.actorType).toBe('member');
  });

  it('returns total from count query', async () => {
    const pool = makePool([ok([]), ok([{ count: '17' }]), ok([])]);
    const svc = new AuditSearchService(pool);
    const result = await svc.search({ organizationId: ORG });
    expect(result.total).toBe(17);
  });

  it('returns empty hits and zero total when no rows', async () => {
    const pool = makePool([ok([]), ok([{ count: '0' }]), ok([])]);
    const svc = new AuditSearchService(pool);
    const result = await svc.search({ organizationId: ORG });
    expect(result.hits).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('appends actorType filter as parameterized condition', async () => {
    const pool = makePool([ok([]), ok([{ count: '0' }]), ok([])]);
    const svc = new AuditSearchService(pool);
    await svc.search({ organizationId: ORG, actorType: 'agent' });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    // count query is index 1
    const countSql = (calls[1] as [string, unknown[]])[0];
    expect(countSql).toContain('actor_type');
    // orgId should not appear in SQL string
    expect(countSql).not.toContain(ORG);
    const countParams = (calls[1] as [string, unknown[]])[1];
    expect(countParams).toContain('agent');
  });

  it('appends action filter', async () => {
    const pool = makePool([ok([]), ok([{ count: '0' }]), ok([])]);
    const svc = new AuditSearchService(pool);
    await svc.search({ organizationId: ORG, action: 'role.assigned' });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const countParams = (calls[1] as [string, unknown[]])[1];
    expect(countParams).toContain('role.assigned');
  });

  it('appends date range filters', async () => {
    const pool = makePool([ok([]), ok([{ count: '0' }]), ok([])]);
    const svc = new AuditSearchService(pool);
    await svc.search({
      organizationId: ORG,
      from: '2026-01-01',
      to: '2026-12-31',
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const countSql = (calls[1] as [string, unknown[]])[0];
    expect(countSql).toContain('created_at >=');
    expect(countSql).toContain('created_at <=');
  });
});

describe('AuditSearchService.indexDocument', () => {
  it('does nothing when no esUrl is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const svc = new AuditSearchService(makePool([]), undefined);
    await svc.indexDocument({
      id: 1,
      organizationId: ORG,
      actorType: 'system',
      actorId: null,
      action: 'test',
      resourceType: null,
      resourceId: null,
      ipAddress: null,
      correlationId: 'c1',
      causationId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('PUTs the document to elasticsearch when esUrl is set', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const svc = new AuditSearchService(makePool([]), 'http://es:9200');
    await svc.indexDocument({
      id: 7,
      organizationId: ORG,
      actorType: 'member',
      actorId: 'u1',
      action: 'workflow.submitted',
      resourceType: 'workflow',
      resourceId: 'wf-1',
      ipAddress: null,
      correlationId: 'corr-x',
      causationId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('http://es:9200');
    expect(url).toContain('/7');
    expect(init.method).toBe('PUT');
    fetchSpy.mockRestore();
  });

  it('throws when elasticsearch returns a non-ok non-409 status', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('internal error', { status: 500 }));

    const svc = new AuditSearchService(makePool([]), 'http://es:9200');
    await expect(
      svc.indexDocument({
        id: 1,
        organizationId: ORG,
        actorType: 'system',
        actorId: null,
        action: 'test',
        resourceType: null,
        resourceId: null,
        ipAddress: null,
        correlationId: 'c1',
        causationId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('500');
    fetchSpy.mockRestore();
  });
});

describe('AuditSearchService.ensureIndex', () => {
  it('does nothing when esUrl is not set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const svc = new AuditSearchService(makePool([]), undefined);
    await svc.ensureIndex();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sends HEAD then PUT when index does not exist (404)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const svc = new AuditSearchService(makePool([]), 'http://es:9200');
    await svc.ensureIndex();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    fetchSpy.mockRestore();
  });

  it('skips PUT when index already exists (non-404)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const svc = new AuditSearchService(makePool([]), 'http://es:9200');
    await svc.ensureIndex();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});
