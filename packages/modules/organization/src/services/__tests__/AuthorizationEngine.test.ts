import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AuthorizationEngine } from '../AuthorizationEngine.js';
import type { AuthorizationRequest } from '../../types/index.js';

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

const BASE_REQUEST: AuthorizationRequest = {
  organizationId: 'org-1',
  actorId: 'user-1',
  actorType: 'member',
  resource: 'workflow',
  action: 'submit',
  correlationId: 'corr-1',
};

// evaluate() = setTenant (1) + 3 parallel queries (memberships, abac policies, delegations)
//              + evaluateApprovalMatrix (1) = 5 total
function makeResponses({
  memberships = [
    {
      role_id: 'r1',
      role_name: 'staff',
      permissions: ['workflow:submit'],
      hierarchy_node_id: null,
    },
  ],
  policies = [] as object[],
  delegations = [] as object[],
  approvalRules = [] as object[],
} = {}): QueryResult[] {
  return [
    ok([]), // setTenant
    ok(memberships), // loadMemberships
    ok(policies), // loadAbacPolicies
    ok(delegations), // loadDelegatedPermissions
    ok(approvalRules), // evaluateApprovalMatrix
  ];
}

describe('AuthorizationEngine', () => {
  it('sets tenant context as first query', async () => {
    const pool = makePool(makeResponses());
    const engine = new AuthorizationEngine(pool);

    await engine.evaluate(BASE_REQUEST);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect((calls[0]?.[1] as string[] | undefined)?.[1]).toBe('org-1');
  });

  it('allows when actor has direct RBAC permission', async () => {
    const pool = makePool(makeResponses());
    const engine = new AuthorizationEngine(pool);

    const result = await engine.evaluate(BASE_REQUEST);

    expect(result.allowed).toBe(true);
    expect(result.appliedRoles).toContain('staff');
    expect(result.requiresApproval).toBe(false);
  });

  it('denies when actor has no permissions and no ABAC policies', async () => {
    const pool = makePool(
      makeResponses({
        memberships: [
          { role_id: 'r1', role_name: 'guest', permissions: [], hierarchy_node_id: null },
        ],
      }),
    );
    const engine = new AuthorizationEngine(pool);

    const result = await engine.evaluate(BASE_REQUEST);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('does not have permission');
  });

  it('denies immediately when ABAC policy has deny effect and conditions match', async () => {
    const denyPolicy = {
      id: 'policy-1',
      name: 'Deny Contractors',
      resource: 'workflow',
      action: 'submit',
      conditions: [{ attribute: 'employmentStatus', operator: 'equals', value: 'contractor' }],
      effect: 'deny',
      priority: 100,
    };
    const pool = makePool(
      makeResponses({
        memberships: [
          {
            role_id: 'r1',
            role_name: 'staff',
            permissions: ['workflow:submit'],
            hierarchy_node_id: null,
          },
        ],
        policies: [denyPolicy],
      }),
    );
    const engine = new AuthorizationEngine(pool);

    const result = await engine.evaluate({
      ...BASE_REQUEST,
      attributes: { employmentStatus: 'contractor' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('ABAC policy explicitly denies');
    expect(result.appliedPolicies).toContain('policy-1');
  });

  it('grants approval tier when approval rule is found', async () => {
    const approvalRule = {
      id: 'rule-1',
      tier: 2,
      required_role: 'manager',
      requires_multiple_approvers: false,
      approver_count: 1,
      escalation_after_hours: 24,
    };
    const pool = makePool(makeResponses({ approvalRules: [approvalRule] }));
    const engine = new AuthorizationEngine(pool);

    const result = await engine.evaluate(BASE_REQUEST);

    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalTier).toBe(2);
  });

  it('allows via delegated permission when actor has no direct role permission', async () => {
    const pool = makePool(
      makeResponses({
        memberships: [
          { role_id: 'r1', role_name: 'guest', permissions: [], hierarchy_node_id: null },
        ],
        delegations: [{ permissions: ['workflow:submit'] }],
      }),
    );
    const engine = new AuthorizationEngine(pool);

    const result = await engine.evaluate(BASE_REQUEST);

    expect(result.allowed).toBe(true);
  });

  it('allows via wildcard permission *:*', async () => {
    const pool = makePool(
      makeResponses({
        memberships: [
          { role_id: 'r1', role_name: 'admin', permissions: ['*:*'], hierarchy_node_id: null },
        ],
      }),
    );
    const engine = new AuthorizationEngine(pool);

    const result = await engine.evaluate(BASE_REQUEST);

    expect(result.allowed).toBe(true);
  });
});
