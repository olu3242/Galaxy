import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { WorkflowGeneratorService } from '../generator/WorkflowGeneratorService.js';
import type { WorkflowStep } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const REQUEST_ID = 'bbbbbbbb-0000-0000-0000-000000000002';

const baseRow = {
  id: REQUEST_ID,
  organization_id: ORG_ID,
  natural_language_description: 'Submit invoice then approve payment',
  industry_hint: null,
  status: 'pending',
  generated_workflow: null,
  steps: null,
  error_message: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  completed_at: null,
};

const completeRow = {
  ...baseRow,
  status: 'complete',
  generated_workflow: { name: 'Submit invoice then approve payment', stepCount: 2 },
  steps: [
    {
      order: 1,
      name: 'Submit invoice',
      description: 'Submit invoice',
      actionType: 'task',
      conditions: {},
    },
    {
      order: 2,
      name: 'approve payment',
      description: 'approve payment',
      actionType: 'task',
      conditions: {},
    },
  ] as WorkflowStep[],
  completed_at: new Date('2026-01-01T01:00:00Z'),
};

// ---------------------------------------------------------------------------
// createRequest
// ---------------------------------------------------------------------------

describe('WorkflowGeneratorService.createRequest', () => {
  it('sets tenant context before inserting', async () => {
    const pool = makePool([ok([]), ok([baseRow])]);
    const service = new WorkflowGeneratorService(pool);

    await service.createRequest(ORG_ID, 'Submit invoice then approve payment');

    const mock = pool.query as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls[0]).toEqual([
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', ORG_ID],
    ]);
  });

  it('inserts with parameterized query — no string interpolation', async () => {
    const pool = makePool([ok([]), ok([baseRow])]);
    const service = new WorkflowGeneratorService(pool);

    await service.createRequest(ORG_ID, 'Submit invoice then approve payment', 'sme');

    const mock = pool.query as ReturnType<typeof vi.fn>;
    const [sql, params] = mock.mock.calls[1] as [string, unknown[]];
    expect(sql).not.toMatch(ORG_ID); // no interpolation
    expect(params[0]).toBe(ORG_ID);
    expect(params[1]).toBe('Submit invoice then approve payment');
    expect(params[2]).toBe('sme');
  });

  it('passes null for industryHint when omitted', async () => {
    const pool = makePool([ok([]), ok([baseRow])]);
    const service = new WorkflowGeneratorService(pool);

    await service.createRequest(ORG_ID, 'Submit invoice then approve payment');

    const mock = pool.query as ReturnType<typeof vi.fn>;
    const [, params] = mock.mock.calls[1] as [string, unknown[]];
    expect(params[2]).toBeNull();
  });

  it('returns mapped domain object from inserted row', async () => {
    const rowWithHint = { ...baseRow, industry_hint: 'sme' };
    const pool = makePool([ok([]), ok([rowWithHint])]);
    const service = new WorkflowGeneratorService(pool);

    const result = await service.createRequest(ORG_ID, 'Submit invoice then approve payment', 'sme');

    expect(result.id).toBe(REQUEST_ID);
    expect(result.organizationId).toBe(ORG_ID);
    expect(result.status).toBe('pending');
    expect(result.industryHint).toBe('sme');
    expect(result.generatedWorkflow).toBeUndefined();
    expect(result.steps).toBeUndefined();
  });

  it('throws when the INSERT returns no rows', async () => {
    const pool = makePool([ok([]), ok([])]);
    const service = new WorkflowGeneratorService(pool);

    await expect(
      service.createRequest(ORG_ID, 'Submit invoice then approve payment'),
    ).rejects.toThrow('Failed to create generation request');
  });
});

// ---------------------------------------------------------------------------
// getRequest
// ---------------------------------------------------------------------------

describe('WorkflowGeneratorService.getRequest', () => {
  it('sets tenant context before selecting', async () => {
    const pool = makePool([ok([]), ok([baseRow])]);
    const service = new WorkflowGeneratorService(pool);

    await service.getRequest(ORG_ID, REQUEST_ID);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls[0]).toEqual([
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', ORG_ID],
    ]);
  });

  it('selects with parameterized orgId and requestId', async () => {
    const pool = makePool([ok([]), ok([baseRow])]);
    const service = new WorkflowGeneratorService(pool);

    await service.getRequest(ORG_ID, REQUEST_ID);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('WHERE'),
      expect.arrayContaining([ORG_ID, REQUEST_ID]),
    );
  });

  it('returns mapped domain object', async () => {
    const pool = makePool([ok([]), ok([baseRow])]);
    const service = new WorkflowGeneratorService(pool);

    const result = await service.getRequest(ORG_ID, REQUEST_ID);

    expect(result.id).toBe(REQUEST_ID);
    expect(result.naturalLanguageDescription).toBe('Submit invoice then approve payment');
    expect(result.status).toBe('pending');
    expect(result.errorMessage).toBeUndefined();
    expect(result.completedAt).toBeUndefined();
  });

  it('maps optional fields when present in row', async () => {
    const enriched = {
      ...baseRow,
      industry_hint: 'healthcare',
      error_message: 'some error',
      completed_at: new Date('2026-01-02T00:00:00Z'),
      generated_workflow: { name: 'test' },
      steps: [],
    };
    const pool = makePool([ok([]), ok([enriched])]);
    const service = new WorkflowGeneratorService(pool);

    const result = await service.getRequest(ORG_ID, REQUEST_ID);

    expect(result.industryHint).toBe('healthcare');
    expect(result.errorMessage).toBe('some error');
    expect(result.completedAt).toEqual(new Date('2026-01-02T00:00:00Z'));
    expect(result.generatedWorkflow).toEqual({ name: 'test' });
    expect(result.steps).toEqual([]);
  });

  it('throws when request is not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const service = new WorkflowGeneratorService(pool);

    await expect(service.getRequest(ORG_ID, REQUEST_ID)).rejects.toThrow('Request not found');
  });
});

// ---------------------------------------------------------------------------
// listRequests
// ---------------------------------------------------------------------------

describe('WorkflowGeneratorService.listRequests', () => {
  it('sets tenant context before listing', async () => {
    const pool = makePool([ok([]), ok([baseRow])]);
    const service = new WorkflowGeneratorService(pool);

    await service.listRequests(ORG_ID);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls[0]).toEqual([
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', ORG_ID],
    ]);
  });

  it('uses default limit of 50 when none provided', async () => {
    const pool = makePool([ok([]), ok([baseRow])]);
    const service = new WorkflowGeneratorService(pool);

    await service.listRequests(ORG_ID);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([50]));
  });

  it('forwards custom limit to query', async () => {
    const pool = makePool([ok([]), ok([baseRow])]);
    const service = new WorkflowGeneratorService(pool);

    await service.listRequests(ORG_ID, 10);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([10]));
  });

  it('returns empty array when no rows', async () => {
    const pool = makePool([ok([]), ok([])]);
    const service = new WorkflowGeneratorService(pool);

    const result = await service.listRequests(ORG_ID);

    expect(result).toEqual([]);
  });

  it('returns mapped array of domain objects', async () => {
    const row2 = { ...baseRow, id: 'cccccccc-0000-0000-0000-000000000003' };
    const pool = makePool([ok([]), ok([baseRow, row2])]);
    const service = new WorkflowGeneratorService(pool);

    const result = await service.listRequests(ORG_ID);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(REQUEST_ID);
    expect(result[1].id).toBe('cccccccc-0000-0000-0000-000000000003');
  });
});

// ---------------------------------------------------------------------------
// generateWorkflow
// ---------------------------------------------------------------------------
// Call sequence inside generateWorkflow:
//   1. set_config (tenant context)
//   2. UPDATE status='generating'
//   3. set_config (via getRequest)
//   4. SELECT * (via getRequest)
//   5. UPDATE SET status='complete' RETURNING *

describe('WorkflowGeneratorService.generateWorkflow', () => {
  it('sets tenant context as the very first call', async () => {
    const pool = makePool([
      ok([]),          // set_config
      ok([]),          // UPDATE generating
      ok([]),          // set_config (getRequest)
      ok([baseRow]),   // SELECT (getRequest)
      ok([completeRow]), // UPDATE complete RETURNING *
    ]);
    const service = new WorkflowGeneratorService(pool);

    await service.generateWorkflow(ORG_ID, REQUEST_ID);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls[0]).toEqual([
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', ORG_ID],
    ]);
  });

  it('marks status generating before fetching request', async () => {
    const pool = makePool([
      ok([]),
      ok([]),
      ok([]),
      ok([baseRow]),
      ok([completeRow]),
    ]);
    const service = new WorkflowGeneratorService(pool);

    await service.generateWorkflow(ORG_ID, REQUEST_ID);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    const [updateSql, updateParams] = mock.mock.calls[1] as [string, unknown[]];
    expect(updateSql).toContain('generating');
    expect(updateParams).toContain(ORG_ID);
    expect(updateParams).toContain(REQUEST_ID);
  });

  it('returns a complete domain object with generated_workflow and steps', async () => {
    const pool = makePool([
      ok([]),
      ok([]),
      ok([]),
      ok([baseRow]),
      ok([completeRow]),
    ]);
    const service = new WorkflowGeneratorService(pool);

    const result = await service.generateWorkflow(ORG_ID, REQUEST_ID);

    expect(result.status).toBe('complete');
    expect(result.generatedWorkflow).toBeDefined();
    expect(result.steps).toBeDefined();
    expect(result.completedAt).toEqual(new Date('2026-01-01T01:00:00Z'));
  });

  it('parses comma-then delimited steps from description', async () => {
    // We verify the final UPDATE receives a steps JSON array
    const twoStepRow = {
      ...baseRow,
      natural_language_description: 'Step A then Step B then Step C',
    };
    const pool = makePool([
      ok([]),
      ok([]),
      ok([]),
      ok([twoStepRow]),
      ok([completeRow]),
    ]);
    const service = new WorkflowGeneratorService(pool);

    await service.generateWorkflow(ORG_ID, REQUEST_ID);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    // 5th call (index 4) is the final UPDATE with steps
    const [, finalParams] = mock.mock.calls[4] as [string, unknown[]];
    const stepsJson = finalParams[3] as string;
    const steps = JSON.parse(stepsJson) as WorkflowStep[];
    expect(steps).toHaveLength(3);
    expect(steps[0].order).toBe(1);
    expect(steps[1].order).toBe(2);
    expect(steps[2].name).toContain('Step C');
  });

  it('includes industryHint in generatedWorkflow when present', async () => {
    const rowWithHint = {
      ...baseRow,
      industry_hint: 'sme',
    };
    const pool = makePool([
      ok([]),
      ok([]),
      ok([]),
      ok([rowWithHint]),
      ok([completeRow]),
    ]);
    const service = new WorkflowGeneratorService(pool);

    await service.generateWorkflow(ORG_ID, REQUEST_ID);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    const [, finalParams] = mock.mock.calls[4] as [string, unknown[]];
    const workflowJson = finalParams[2] as string;
    const workflow = JSON.parse(workflowJson) as Record<string, unknown>;
    expect(workflow.industryHint).toBe('sme');
  });

  it('does not include industryHint in generatedWorkflow when absent', async () => {
    const pool = makePool([
      ok([]),
      ok([]),
      ok([]),
      ok([baseRow]),
      ok([completeRow]),
    ]);
    const service = new WorkflowGeneratorService(pool);

    await service.generateWorkflow(ORG_ID, REQUEST_ID);

    const mock = pool.query as ReturnType<typeof vi.fn>;
    const [, finalParams] = mock.mock.calls[4] as [string, unknown[]];
    const workflowJson = finalParams[2] as string;
    const workflow = JSON.parse(workflowJson) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(workflow, 'industryHint')).toBe(false);
  });

  it('throws when final UPDATE returns no rows', async () => {
    const pool = makePool([
      ok([]),
      ok([]),
      ok([]),
      ok([baseRow]),
      ok([]),
    ]);
    const service = new WorkflowGeneratorService(pool);

    await expect(service.generateWorkflow(ORG_ID, REQUEST_ID)).rejects.toThrow(
      'Failed to update request',
    );
  });

  it('throws when internal getRequest finds no row', async () => {
    const pool = makePool([
      ok([]),
      ok([]),
      ok([]),
      ok([]),   // getRequest returns empty → throws
    ]);
    const service = new WorkflowGeneratorService(pool);

    await expect(service.generateWorkflow(ORG_ID, REQUEST_ID)).rejects.toThrow('Request not found');
  });
});
