import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ContextAggregator } from '../ContextAggregator.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

// ContextAggregator uses Promise.all for 5 queries after set_config
// Query order: set_config, then in Promise.all: workflow, approval, task, overloaded, compliance
function makePool(
  wf: Record<string, string>,
  ap: Record<string, string>,
  tk: Record<string, string>,
  overloaded: { assigned_to: string; cnt: string }[],
  co: Record<string, string>,
): Pool {
  const responses: QueryResult[] = [
    ok([]), // set_config
    ok([wf]), // workflow_runs
    ok([ap]), // approval_requests
    ok([tk]), // tasks (total/open)
    ok(overloaded), // tasks (overloaded)
    ok([co]), // compliance_checks
  ];
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

describe('ContextAggregator', () => {
  it('aggregates happy-path context with no risks', async () => {
    const pool = makePool(
      { total: '10', active: '5', near_sla: '0', breached: '0' },
      { total: '3', stale_pending: '0', oldest_days: '0' },
      { total: '20', open: '8' },
      [],
      { passed: '10', failed: '0', warnings: '1' },
    );
    const agg = new ContextAggregator(pool);
    const ctx = await agg.aggregate(ORG_ID);

    expect(ctx.workflowStats.total).toBe(10);
    expect(ctx.workflowStats.active).toBe(5);
    expect(ctx.workflowStats.nearSla).toBe(0);
    expect(ctx.workflowStats.breached).toBe(0);

    expect(ctx.approvalBacklog.total).toBe(3);
    expect(ctx.approvalBacklog.stalePending).toBe(0);

    expect(ctx.taskStats.total).toBe(20);
    expect(ctx.taskStats.open).toBe(8);
    expect(ctx.taskStats.overloaded).toHaveLength(0);

    expect(ctx.complianceStatus.passed).toBe(10);
    expect(ctx.complianceStatus.failed).toBe(0);
    expect(ctx.complianceStatus.warnings).toBe(1);

    expect(ctx.riskSummary.level).toBe('low');
    expect(ctx.riskSummary.factors).toHaveLength(0);
  });

  it('computes medium risk when nearSla > 0 only', async () => {
    const pool = makePool(
      { total: '10', active: '5', near_sla: '2', breached: '0' },
      { total: '3', stale_pending: '0', oldest_days: '0' },
      { total: '20', open: '8' },
      [],
      { passed: '10', failed: '0', warnings: '0' },
    );
    const agg = new ContextAggregator(pool);
    const ctx = await agg.aggregate(ORG_ID);

    expect(ctx.riskSummary.level).toBe('medium');
    expect(ctx.riskSummary.factors).toContain('2 workflow(s) near SLA');
  });

  it('computes high risk when nearSla and failedCompliance present', async () => {
    const pool = makePool(
      { total: '10', active: '5', near_sla: '2', breached: '0' },
      { total: '3', stale_pending: '0', oldest_days: '0' },
      { total: '20', open: '8' },
      [],
      { passed: '5', failed: '2', warnings: '0' },
    );
    const agg = new ContextAggregator(pool);
    const ctx = await agg.aggregate(ORG_ID);

    expect(ctx.riskSummary.level).toBe('high');
    expect(ctx.riskSummary.factors).toHaveLength(2);
  });

  it('computes critical risk when breached > 3', async () => {
    const pool = makePool(
      { total: '10', active: '8', near_sla: '1', breached: '4' },
      { total: '3', stale_pending: '0', oldest_days: '0' },
      { total: '20', open: '8' },
      [],
      { passed: '5', failed: '0', warnings: '0' },
    );
    const agg = new ContextAggregator(pool);
    const ctx = await agg.aggregate(ORG_ID);

    expect(ctx.riskSummary.level).toBe('critical');
  });

  it('maps overloaded members correctly', async () => {
    const pool = makePool(
      { total: '5', active: '3', near_sla: '0', breached: '0' },
      { total: '2', stale_pending: '0', oldest_days: '0' },
      { total: '30', open: '25' },
      [
        { assigned_to: 'member-a', cnt: '12' },
        { assigned_to: 'member-b', cnt: '18' },
      ],
      { passed: '5', failed: '0', warnings: '0' },
    );
    const agg = new ContextAggregator(pool);
    const ctx = await agg.aggregate(ORG_ID);

    expect(ctx.taskStats.overloaded).toHaveLength(2);
    expect(ctx.taskStats.overloaded[0]?.memberId).toBe('member-a');
    expect(ctx.taskStats.overloaded[0]?.count).toBe(12);
    expect(ctx.taskStats.overloaded[1]?.memberId).toBe('member-b');
    expect(ctx.taskStats.overloaded[1]?.count).toBe(18);
  });

  it('handles missing rows gracefully with defaults', async () => {
    // Return empty rows for all data queries
    const responses: QueryResult[] = [
      ok([]), // set_config
      ok([]), // workflow_runs — no row
      ok([]), // approval_requests — no row
      ok([]), // tasks
      ok([]), // overloaded
      ok([]), // compliance
    ];
    let call = 0;
    const pool: Pool = {
      query: vi.fn(() => {
        const resp = responses[call] ?? ok([]);
        call++;
        return Promise.resolve(resp);
      }),
    } as unknown as Pool;

    const agg = new ContextAggregator(pool);
    const ctx = await agg.aggregate(ORG_ID);

    expect(ctx.workflowStats.total).toBe(0);
    expect(ctx.approvalBacklog.total).toBe(0);
    expect(ctx.taskStats.total).toBe(0);
    expect(ctx.riskSummary.level).toBe('low');
  });

  it('uses set_config with correct tenant value', async () => {
    const pool = makePool(
      { total: '0', active: '0', near_sla: '0', breached: '0' },
      { total: '0', stale_pending: '0', oldest_days: '0' },
      { total: '0', open: '0' },
      [],
      { passed: '0', failed: '0', warnings: '0' },
    );
    const agg = new ContextAggregator(pool);
    await agg.aggregate(ORG_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toContain('set_config');
    expect((calls[0]?.[1] ?? [])[1]).toBe(ORG_ID);
  });
});
