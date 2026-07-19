import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PermissionAnalyticsService } from '../PermissionAnalyticsService.js';

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

const ORG = 'org-1';
const PERIOD = '30 days';

// generate() = setTenant (1) + 5 parallel queries = 6 total
function makeAnalyticsResponses({
  roleDistribution = [{ role: 'staff', count: '10' }],
  failedAttempts = [{ count: '5' }],
  dormantAccounts = [{ count: '2' }],
  activeDelegations = [{ count: '3' }],
  abacEvaluated = [{ count: '100' }],
} = {}): QueryResult[] {
  return [
    ok([]), // setTenant
    ok(roleDistribution), // getRoleDistribution
    ok(failedAttempts), // getFailedAuthAttempts
    ok(dormantAccounts), // getDormantAccounts
    ok(activeDelegations), // getActiveDelegations
    ok(abacEvaluated), // getAbacPoliciesEvaluated
  ];
}

describe('PermissionAnalyticsService', () => {
  it('sets tenant context as first query', async () => {
    const pool = makePool(makeAnalyticsResponses());
    const svc = new PermissionAnalyticsService(pool);

    await svc.generate(ORG, PERIOD);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('returns analytics with correct organizationId and period', async () => {
    const pool = makePool(makeAnalyticsResponses());
    const svc = new PermissionAnalyticsService(pool);

    const analytics = await svc.generate(ORG, PERIOD);

    expect(analytics.organizationId).toBe(ORG);
    expect(analytics.period).toBe(PERIOD);
  });

  it('maps role distribution correctly', async () => {
    const pool = makePool(
      makeAnalyticsResponses({
        roleDistribution: [
          { role: 'admin', count: '3' },
          { role: 'staff', count: '15' },
        ],
      }),
    );
    const svc = new PermissionAnalyticsService(pool);

    const analytics = await svc.generate(ORG, PERIOD);

    expect(analytics.roleDistribution).toHaveLength(2);
    expect(analytics.roleDistribution[0]).toEqual({ role: 'admin', count: 3 });
    expect(analytics.roleDistribution[1]).toEqual({ role: 'staff', count: 15 });
  });

  it('maps failed auth attempts as integer', async () => {
    const pool = makePool(makeAnalyticsResponses({ failedAttempts: [{ count: '42' }] }));
    const svc = new PermissionAnalyticsService(pool);

    const analytics = await svc.generate(ORG, PERIOD);

    expect(analytics.failedAuthAttempts).toBe(42);
  });

  it('returns 0 for counts when no data rows returned', async () => {
    const pool = makePool(
      makeAnalyticsResponses({
        failedAttempts: [],
        dormantAccounts: [],
        activeDelegations: [],
        abacEvaluated: [],
      }),
    );
    const svc = new PermissionAnalyticsService(pool);

    const analytics = await svc.generate(ORG, PERIOD);

    expect(analytics.failedAuthAttempts).toBe(0);
    expect(analytics.dormantAccounts).toBe(0);
    expect(analytics.activeDelegations).toBe(0);
    expect(analytics.abacPoliciesEvaluated).toBe(0);
  });

  it('includes generatedAt timestamp', async () => {
    const pool = makePool(makeAnalyticsResponses());
    const svc = new PermissionAnalyticsService(pool);

    const analytics = await svc.generate(ORG, PERIOD);

    expect(analytics.generatedAt).toBeDefined();
    expect(new Date(analytics.generatedAt).getTime()).not.toBeNaN();
  });

  it('initializes highRiskUsers as empty array and privilegeEscalationAttempts as 0', async () => {
    const pool = makePool(makeAnalyticsResponses());
    const svc = new PermissionAnalyticsService(pool);

    const analytics = await svc.generate(ORG, PERIOD);

    expect(analytics.highRiskUsers).toEqual([]);
    expect(analytics.privilegeEscalationAttempts).toBe(0);
    expect(analytics.complianceViolations).toBe(0);
  });
});
