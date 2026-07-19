import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GxContextEngine } from '../GxContextEngine.js';
import type { AgentContext } from '../GxContextEngine.js';

const ORG = '00000000-0000-0000-0000-000000000002';
const ACTOR = 'actor-001';
const TENANT = 'tenant-001';

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

// enrich issues 5 queries: set_config + 4 parallel queries
function enrichPool(
  orgRows: { name: string }[],
  memberRows: { role_name: string; department_id: string | null }[],
  pendingRows: { count: string }[],
  workflowRows: { count: string }[],
): Pool {
  return makePool([
    ok([]), // set_config
    ok(orgRows),
    ok(memberRows),
    ok(pendingRows),
    ok(workflowRows),
  ]);
}

describe('GxContextEngine.enrich', () => {
  it('sets tenant context as first query', async () => {
    const pool = enrichPool([{ name: 'Acme' }], [], [{ count: '0' }], [{ count: '0' }]);
    const engine = new GxContextEngine(pool);
    await engine.enrich({ tenantId: TENANT, actorId: ACTOR, organizationId: ORG });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('enriches context with org name and member role', async () => {
    const pool = enrichPool(
      [{ name: 'Acme Corp' }],
      [{ role_name: 'admin', department_id: null }],
      [{ count: '5' }],
      [{ count: '3' }],
    );
    const engine = new GxContextEngine(pool);
    const ctx = await engine.enrich({ tenantId: TENANT, actorId: ACTOR, organizationId: ORG });
    expect(ctx.organizationName).toBe('Acme Corp');
    expect(ctx.memberRole).toBe('admin');
    expect(ctx.pendingApprovals).toBe(5);
    expect(ctx.activeWorkflows).toBe(3);
    expect(ctx.tenantId).toBe(TENANT);
    expect(ctx.actorId).toBe(ACTOR);
  });

  it('sets departmentId from member row if present', async () => {
    const pool = enrichPool(
      [{ name: 'Org' }],
      [{ role_name: 'member', department_id: 'dept-123' }],
      [{ count: '0' }],
      [{ count: '0' }],
    );
    const engine = new GxContextEngine(pool);
    const ctx = await engine.enrich({ tenantId: TENANT, actorId: ACTOR, organizationId: ORG });
    expect(ctx.departmentId).toBe('dept-123');
  });

  it('handles missing org and member rows gracefully', async () => {
    const pool = enrichPool([], [], [{ count: '2' }], [{ count: '1' }]);
    const engine = new GxContextEngine(pool);
    const ctx = await engine.enrich({ tenantId: TENANT, actorId: ACTOR, organizationId: ORG });
    expect(ctx.organizationName).toBeUndefined();
    expect(ctx.memberRole).toBeUndefined();
    expect(ctx.pendingApprovals).toBe(2);
    expect(ctx.activeWorkflows).toBe(1);
  });

  it('propagates optional fields from input', async () => {
    const pool = enrichPool([{ name: 'Org' }], [], [{ count: '0' }], [{ count: '0' }]);
    const engine = new GxContextEngine(pool);
    const ctx = await engine.enrich({
      tenantId: TENANT,
      actorId: ACTOR,
      organizationId: ORG,
      conversationId: 'conv-1',
      workflowInstanceId: 'wf-99',
      sessionMetadata: { channel: 'whatsapp' },
    });
    expect(ctx.conversationId).toBe('conv-1');
    expect(ctx.workflowInstanceId).toBe('wf-99');
    expect(ctx.sessionMetadata).toEqual({ channel: 'whatsapp' });
  });
});

describe('GxContextEngine.snapshot', () => {
  it('returns a plain object with the expected keys', () => {
    const engine = new GxContextEngine({} as Pool);
    const ctx: AgentContext = {
      tenantId: TENANT,
      actorId: ACTOR,
      organizationId: ORG,
      memberRole: 'admin',
      departmentId: 'dept-1',
      activeWorkflows: 4,
      pendingApprovals: 2,
      sessionMetadata: {},
    };
    const snap = engine.snapshot(ctx);
    expect(snap.tenantId).toBe(TENANT);
    expect(snap.memberRole).toBe('admin');
    expect(snap.activeWorkflows).toBe(4);
  });
});
