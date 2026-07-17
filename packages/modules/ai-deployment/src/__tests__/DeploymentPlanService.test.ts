import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { DeploymentPlanService } from '../deployment/DeploymentPlanService.js';

const ORG = '00000000-0000-0000-0000-000000000006';
const PLAN_ID = 'plan-1';

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

const makePlanRow = (overrides: Record<string, unknown> = {}) => ({
  id: PLAN_ID,
  organization_id: ORG,
  natural_language_description: 'Set up a fintech company with compliance workflows',
  industry_hint: null,
  status: 'pending',
  parsed_intent: {} as Record<string, unknown>,
  resources: [] as unknown[],
  error_message: null,
  created_at: new Date('2024-01-01'),
  completed_at: null,
  ...overrides,
});

describe('DeploymentPlanService.createPlan', () => {
  it('sets tenant context and inserts plan', async () => {
    const row = makePlanRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new DeploymentPlanService(pool);
    const result = await svc.createPlan(ORG, 'Set up a fintech company with compliance workflows');
    expect(result.id).toBe(PLAN_ID);
    expect(result.status).toBe('pending');
    expect(result.industryHint).toBeUndefined();
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[0]).toContain('INSERT INTO deployment_plans');
  });

  it('stores industryHint when provided', async () => {
    const row = makePlanRow({ industry_hint: 'fintech' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new DeploymentPlanService(pool);
    const result = await svc.createPlan(ORG, 'Fintech setup', 'fintech');
    expect(result.industryHint).toBe('fintech');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[1]).toContain('fintech');
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new DeploymentPlanService(pool);
    await expect(svc.createPlan(ORG, 'description')).rejects.toThrow(
      'Failed to create deployment plan',
    );
  });
});

describe('DeploymentPlanService.getPlan', () => {
  it('returns mapped plan with resources', async () => {
    const row = makePlanRow({
      resources: [
        {
          id: 'res-1',
          deployment_plan_id: PLAN_ID,
          resource_type: 'department',
          name: 'Operations',
          config: {},
          status: 'created',
          created_at: new Date(),
        },
      ],
    });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new DeploymentPlanService(pool);
    const result = await svc.getPlan(ORG, PLAN_ID);
    expect(result.id).toBe(PLAN_ID);
    expect(result.resources).toHaveLength(1);
  });

  it('throws when plan not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new DeploymentPlanService(pool);
    await expect(svc.getPlan(ORG, 'missing')).rejects.toThrow('Deployment plan not found');
  });
});

describe('DeploymentPlanService.listPlans', () => {
  it('returns list of plans', async () => {
    const rows = [makePlanRow(), makePlanRow({ id: 'plan-2', status: 'complete' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new DeploymentPlanService(pool);
    const result = await svc.listPlans(ORG);
    expect(result).toHaveLength(2);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[0]).toContain('ORDER BY dp.created_at DESC');
    expect(calls[1]?.[1]).toContain(50);
  });

  it('respects custom limit', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new DeploymentPlanService(pool);
    await svc.listPlans(ORG, 10);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[1]).toContain(10);
  });
});

describe('DeploymentPlanService.analyzePlan', () => {
  it('progresses through analyzing->provisioning->complete status', async () => {
    // analyzePlan query sequence:
    // 0: setTenant
    // 1: UPDATE status='analyzing'
    // 2: SELECT description/hint
    // 3: UPDATE status='provisioning' + parsed_intent
    // 4..N: INSERT each resource (3 base + extras from description words)
    // N+1: UPDATE status='complete'
    // N+2: getPlan setTenant
    // N+3: getPlan SELECT
    const description = 'Build a team with workflows and policies for the company';
    const completedRow = makePlanRow({ status: 'complete', parsed_intent: { description } });

    // Count resources from parseDescriptionToResources:
    // description words > 4 chars: ['Build', 'workflows', 'policies', 'company'] -> first 3: Build(5), workflows(9), policies(8)
    // base: 3 (Main Department, Admin, Default Workflow)
    // word departments: 3 (Build, Workflows, Policies) -> total 6 inserts
    const resourceInserts = 6;

    const responses: QueryResult[] = [
      ok([]), // 0: setTenant
      ok([]), // 1: UPDATE analyzing
      ok([{ natural_language_description: description, industry_hint: null }]), // 2: SELECT
      ok([]), // 3: UPDATE provisioning
    ];
    for (let i = 0; i < resourceInserts; i++) {
      responses.push(
        ok([
          {
            id: `res-${String(i)}`,
            deployment_plan_id: PLAN_ID,
            organization_id: ORG,
            resource_type: 'department',
            name: `Dept ${String(i)}`,
            config: {},
            status: 'created',
            created_at: new Date(),
          },
        ]),
      );
    }
    responses.push(ok([])); // UPDATE complete
    responses.push(ok([])); // getPlan: setTenant
    responses.push(ok([completedRow])); // getPlan: SELECT

    const pool = makePool(responses);
    const svc = new DeploymentPlanService(pool);
    const result = await svc.analyzePlan(ORG, PLAN_ID);
    expect(result.status).toBe('complete');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    // Verify status progression
    expect(calls[1]?.[0]).toContain("'analyzing'");
    expect(calls[3]?.[0]).toContain("'provisioning'");
    const updateCompleteIdx = 4 + resourceInserts;
    expect(calls[updateCompleteIdx]?.[0]).toContain("'complete'");
  });

  it('throws when plan not found during analysis', async () => {
    const pool = makePool([ok([]), ok([]), ok([])]);
    const svc = new DeploymentPlanService(pool);
    await expect(svc.analyzePlan(ORG, 'missing')).rejects.toThrow('Deployment plan not found');
  });
});
