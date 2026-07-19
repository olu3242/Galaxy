import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { WorkflowDefinitionService } from '../WorkflowDefinitionService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const WF_ID = '00000000-0000-0000-0000-000000000010';
const CREATED_BY = '00000000-0000-0000-0000-000000000099';
const CORR_ID = '00000000-0000-0000-0000-000000000088';

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

function wfRow(
  overrides: Partial<{ is_active: boolean; flow_type: string; automation_domain: string }> = {},
) {
  return {
    id: WF_ID,
    organization_id: ORG,
    name: 'Onboard Member',
    description: null,
    version: 1,
    is_active: overrides.is_active ?? false,
    automation_domain: overrides.automation_domain ?? 'membership',
    flow_type: overrides.flow_type ?? 'automated',
    definition: {},
    tags: [],
    owner_id: null,
    department_id: null,
    sla_duration_hours: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('WorkflowDefinitionService.createWorkflow', () => {
  it('sets tenant context before insert', async () => {
    const pool = makePool([ok([]), ok([wfRow()])]);
    const svc = new WorkflowDefinitionService(pool);
    await svc.createWorkflow({
      organizationId: ORG,
      name: 'Onboard Member',
      automationDomain: 'membership',
      flowType: 'automated',
      definition: {},
      createdBy: CREATED_BY,
      correlationId: CORR_ID,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns mapped WorkflowDefinition on success', async () => {
    const pool = makePool([ok([]), ok([wfRow()])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.createWorkflow({
      organizationId: ORG,
      name: 'Onboard Member',
      automationDomain: 'membership',
      flowType: 'automated',
      definition: {},
      createdBy: CREATED_BY,
      correlationId: CORR_ID,
    });
    expect(result.id).toBe(WF_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.version).toBe(1);
    expect(result.isActive).toBe(false);
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDefinitionService(pool);
    await expect(
      svc.createWorkflow({
        organizationId: ORG,
        name: 'X',
        automationDomain: 'task',
        flowType: 'automated',
        definition: {},
        createdBy: CREATED_BY,
        correlationId: CORR_ID,
      }),
    ).rejects.toThrow();
  });

  it('uses parameterized query — no orgId interpolation', async () => {
    const pool = makePool([ok([]), ok([wfRow()])]);
    const svc = new WorkflowDefinitionService(pool);
    await svc.createWorkflow({
      organizationId: ORG,
      name: 'X',
      automationDomain: 'task',
      flowType: 'automated',
      definition: {},
      createdBy: CREATED_BY,
      correlationId: CORR_ID,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    for (const [sql] of calls) {
      expect(sql).not.toContain(ORG);
    }
  });
});

describe('WorkflowDefinitionService.getWorkflow', () => {
  it('returns workflow when found', async () => {
    const pool = makePool([ok([]), ok([wfRow()])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.getWorkflow(ORG, WF_ID);
    expect(result?.id).toBe(WF_ID);
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.getWorkflow(ORG, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('WorkflowDefinitionService.listWorkflows', () => {
  it('returns all workflows for org', async () => {
    const rows = [wfRow(), { ...wfRow(), id: '00000000-0000-0000-0000-000000000099' }];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.listWorkflows(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no workflows', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.listWorkflows(ORG);
    expect(result).toEqual([]);
  });

  it('passes domain filter param when provided', async () => {
    const pool = makePool([ok([]), ok([wfRow({ automation_domain: 'membership' })])]);
    const svc = new WorkflowDefinitionService(pool);
    await svc.listWorkflows(ORG, { domain: 'membership' });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain('membership');
  });
});

describe('WorkflowDefinitionService.activateWorkflow', () => {
  it('returns workflow with isActive true', async () => {
    const pool = makePool([ok([]), ok([wfRow({ is_active: true })])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.activateWorkflow(ORG, WF_ID);
    expect(result.isActive).toBe(true);
  });

  it('throws when workflow not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDefinitionService(pool);
    await expect(svc.activateWorkflow(ORG, 'nonexistent')).rejects.toThrow();
  });
});

describe('WorkflowDefinitionService.deactivateWorkflow', () => {
  it('returns workflow with isActive false', async () => {
    const pool = makePool([ok([]), ok([wfRow({ is_active: false })])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.deactivateWorkflow(ORG, WF_ID);
    expect(result.isActive).toBe(false);
  });

  it('throws when workflow not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDefinitionService(pool);
    await expect(svc.deactivateWorkflow(ORG, 'nonexistent')).rejects.toThrow();
  });
});
