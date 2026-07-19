/**
 * Policy Engine OS — PolicyEnforcementService unit tests
 *
 * Covers: evaluate — policy not found · inactive policy · disabled enforcement ·
 *         deny rule in enforce mode · deny rule in audit mode · audit rule ·
 *         no matching rule (allowed) · operators: equals/not_equals/contains/in/not_in ·
 *         getEnforcementLog
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PolicyEnforcementService } from '../enforcement/PolicyEnforcementService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const POLICY_ID = '00000000-0000-0000-0000-000000000010';
const RULE_ID = '00000000-0000-0000-0000-000000000020';
const RESOURCE_ID = '00000000-0000-0000-0000-000000000030';
const NOW = new Date('2026-01-01T00:00:00.000Z');

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

function policyRow(overrides: Partial<{ enforcement_mode: string; status: string }> = {}) {
  return {
    enforcement_mode: overrides.enforcement_mode ?? 'enforce',
    status: overrides.status ?? 'active',
  };
}

function ruleRow(
  overrides: Partial<{
    field: string;
    operator: string;
    value: unknown;
    action: string;
    priority: number;
    is_active?: boolean;
  }> = {},
) {
  return {
    id: RULE_ID,
    organization_id: ORG,
    policy_id: POLICY_ID,
    field: overrides.field ?? 'role',
    operator: overrides.operator ?? 'equals',
    value: overrides.value ?? 'admin',
    action: overrides.action ?? 'deny',
    priority: overrides.priority ?? 0,
    created_at: NOW,
  };
}

function logRow() {
  return {
    id: '00000000-0000-0000-0000-000000000099',
    organization_id: ORG,
    policy_id: POLICY_ID,
    rule_id: RULE_ID,
    resource_type: 'workflow',
    resource_id: RESOURCE_ID,
    action: 'evaluate',
    outcome: 'allowed',
    context: {},
    created_at: NOW,
  };
}

// evaluate calls: set_config(1), SELECT policy(2), PolicyRuleService.getRules: set_config(3)+SELECT rules(4), INSERT log(5)

describe('PolicyEnforcementService.evaluate — policy not found', () => {
  it('throws when policy row not returned', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PolicyEnforcementService(pool);
    await expect(
      svc.evaluate(ORG, POLICY_ID, 'workflow', RESOURCE_ID, { role: 'admin' }),
    ).rejects.toThrow('Policy not found');
  });
});

describe('PolicyEnforcementService.evaluate — inactive policy', () => {
  it('returns allowed when policy status is inactive', async () => {
    const pool = makePool([
      ok([]), // set_config
      ok([policyRow({ status: 'inactive' })]), // SELECT policy
      ok([]), // INSERT log
    ]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'workflow', RESOURCE_ID, {});
    expect(result.outcome).toBe('allowed');
    expect(result.reason).toContain('not active');
  });
});

describe('PolicyEnforcementService.evaluate — disabled enforcement mode', () => {
  it('returns allowed when enforcement_mode is disabled', async () => {
    const pool = makePool([ok([]), ok([policyRow({ enforcement_mode: 'disabled' })]), ok([])]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'workflow', RESOURCE_ID, {});
    expect(result.outcome).toBe('allowed');
  });
});

describe('PolicyEnforcementService.evaluate — deny rule in enforce mode', () => {
  it('returns denied when context matches a deny rule', async () => {
    const pool = makePool([
      ok([]), // set_config (evaluate)
      ok([policyRow()]), // SELECT policy
      ok([]), // set_config (getRules)
      ok([ruleRow({ field: 'role', operator: 'equals', value: 'viewer', action: 'deny' })]), // SELECT rules
      ok([]), // INSERT log
    ]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'workflow', RESOURCE_ID, { role: 'viewer' });
    expect(result.outcome).toBe('denied');
    expect(result.reason).toContain('Rule matched');
  });
});

describe('PolicyEnforcementService.evaluate — deny rule in audit mode', () => {
  it('returns audited (not denied) when enforcement_mode is audit', async () => {
    const pool = makePool([
      ok([]),
      ok([policyRow({ enforcement_mode: 'audit' })]),
      ok([]),
      ok([ruleRow({ field: 'status', operator: 'equals', value: 'blocked', action: 'deny' })]),
      ok([]),
    ]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'workflow', RESOURCE_ID, {
      status: 'blocked',
    });
    expect(result.outcome).toBe('audited');
  });
});

describe('PolicyEnforcementService.evaluate — audit rule match', () => {
  it('returns audited when context matches an audit rule', async () => {
    const pool = makePool([
      ok([]),
      ok([policyRow()]),
      ok([]),
      ok([ruleRow({ action: 'audit' })]),
      ok([]),
    ]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'workflow', RESOURCE_ID, { role: 'admin' });
    expect(result.outcome).toBe('audited');
    expect(result.reason).toContain('Audit rule matched');
  });
});

describe('PolicyEnforcementService.evaluate — no matching rule', () => {
  it('returns allowed when no rules match the context', async () => {
    const pool = makePool([
      ok([]),
      ok([policyRow()]),
      ok([]),
      ok([ruleRow({ field: 'role', operator: 'equals', value: 'superadmin', action: 'deny' })]),
      ok([]),
    ]);
    const svc = new PolicyEnforcementService(pool);
    // context has role=viewer, rule requires role=superadmin → no match
    const result = await svc.evaluate(ORG, POLICY_ID, 'workflow', RESOURCE_ID, { role: 'viewer' });
    expect(result.outcome).toBe('allowed');
  });

  it('returns allowed when no rules exist', async () => {
    const pool = makePool([
      ok([]),
      ok([policyRow()]),
      ok([]),
      ok([]), // empty rules
      ok([]),
    ]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'workflow', RESOURCE_ID, { role: 'admin' });
    expect(result.outcome).toBe('allowed');
  });
});

describe('PolicyEnforcementService.evaluate — operators', () => {
  it('not_equals: denies when field does NOT equal value', async () => {
    const pool = makePool([
      ok([]),
      ok([policyRow()]),
      ok([]),
      ok([ruleRow({ field: 'status', operator: 'not_equals', value: 'active', action: 'deny' })]),
      ok([]),
    ]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'r', 'r1', { status: 'inactive' });
    expect(result.outcome).toBe('denied');
  });

  it('contains: denies when string field contains value', async () => {
    const pool = makePool([
      ok([]),
      ok([policyRow()]),
      ok([]),
      ok([ruleRow({ field: 'email', operator: 'contains', value: 'spam', action: 'deny' })]),
      ok([]),
    ]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'r', 'r1', { email: 'user@spam.com' });
    expect(result.outcome).toBe('denied');
  });

  it('in: denies when field value is in array', async () => {
    const pool = makePool([
      ok([]),
      ok([policyRow()]),
      ok([]),
      ok([ruleRow({ field: 'role', operator: 'in', value: ['guest', 'viewer'], action: 'deny' })]),
      ok([]),
    ]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'r', 'r1', { role: 'guest' });
    expect(result.outcome).toBe('denied');
  });

  it('not_in: denies when field value is NOT in allowed list', async () => {
    const pool = makePool([
      ok([]),
      ok([policyRow()]),
      ok([]),
      ok([
        ruleRow({ field: 'role', operator: 'not_in', value: ['admin', 'manager'], action: 'deny' }),
      ]),
      ok([]),
    ]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.evaluate(ORG, POLICY_ID, 'r', 'r1', { role: 'intern' });
    expect(result.outcome).toBe('denied');
  });
});

describe('PolicyEnforcementService.getEnforcementLog', () => {
  it('sets tenant context and returns logs', async () => {
    const pool = makePool([ok([]), ok([logRow(), logRow()])]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.getEnforcementLog(ORG, POLICY_ID);

    expect(result).toHaveLength(2);
    expect(result[0]?.policyId).toBe(POLICY_ID);
    expect(result[0]?.outcome).toBe('allowed');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('applies custom limit to query params', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PolicyEnforcementService(pool);
    await svc.getEnforcementLog(ORG, POLICY_ID, 10);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[1]).toContain(10);
  });

  it('defaults to limit 50', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PolicyEnforcementService(pool);
    await svc.getEnforcementLog(ORG, POLICY_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[1]).toContain(50);
  });

  it('returns empty array when no logs', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PolicyEnforcementService(pool);
    const result = await svc.getEnforcementLog(ORG, POLICY_ID);
    expect(result).toHaveLength(0);
  });
});
