import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { WorkflowEngineService } from '../WorkflowEngineService.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000002';
const RUN_ID = '00000000-0000-0000-0000-000000000003';

function makeWorkflowRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: WORKFLOW_ID,
    organization_id: ORG_ID,
    name: 'Test Workflow',
    description: null,
    version: 1,
    is_active: true,
    automation_domain: 'task',
    flow_type: 'automated',
    owner_id: null,
    department_id: null,
    sla_duration_hours: null,
    tags: [],
    definition: {},
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRunRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RUN_ID,
    organization_id: ORG_ID,
    workflow_id: WORKFLOW_ID,
    status: 'running',
    current_step_id: null,
    triggered_by: 'user-1',
    trigger_data: {},
    output_data: {},
    correlation_id: 'corr-1',
    sla_due_at: null,
    escalated_at: null,
    escalated_to: null,
    automation_domain: 'task',
    flow_type: 'automated',
    started_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePool(responseSequence: unknown[][] = []): Pool {
  let callIndex = 0;
  const query = vi.fn().mockImplementation(() => {
    const rows = responseSequence[callIndex] ?? [];
    callIndex++;
    return Promise.resolve({ rows, rowCount: rows.length } as QueryResult);
  });
  return { query } as unknown as Pool;
}

describe('WorkflowEngineService', () => {
  describe('startWorkflow', () => {
    it('creates a workflow run with status running', async () => {
      const workflowRow = makeWorkflowRow();
      const runRow = makeRunRow();

      // Calls in order:
      // 1. set_config (for WorkflowDefinitionService.getWorkflow)
      // 2. SELECT workflows
      // 3. set_config (for WorkflowEngineService)
      // 4. INSERT workflow_runs RETURNING
      // 5. UPDATE workflow_runs RETURNING
      // 6. SELECT workflow_steps
      // 7. INSERT workflow_history
      const pool = makePool([
        [], // set_config
        [workflowRow], // SELECT workflows
        [], // set_config
        [runRow], // INSERT workflow_runs
        [runRow], // UPDATE workflow_runs
        [], // SELECT workflow_steps (no steps)
        [], // INSERT workflow_history
      ]);

      const service = new WorkflowEngineService(pool);
      const result = await service.startWorkflow({
        organizationId: ORG_ID,
        workflowId: WORKFLOW_ID,
        triggeredBy: 'user-1',
        triggerData: { source: 'test' },
        correlationId: 'corr-1',
      });

      expect(result.status).toBe('running');
      expect(result.workflowId).toBe(WORKFLOW_ID);
      expect(result.organizationId).toBe(ORG_ID);
    });

    it('throws if workflow is not active', async () => {
      const inactiveWorkflow = makeWorkflowRow({ is_active: false });

      const pool = makePool([
        [], // set_config
        [inactiveWorkflow], // SELECT workflows
      ]);

      const service = new WorkflowEngineService(pool);
      await expect(
        service.startWorkflow({
          organizationId: ORG_ID,
          workflowId: WORKFLOW_ID,
          triggeredBy: 'user-1',
          triggerData: {},
          correlationId: 'corr-1',
        }),
      ).rejects.toThrow('not active');
    });

    it('throws if workflow is not found', async () => {
      const pool = makePool([
        [], // set_config
        [], // SELECT workflows — empty
      ]);

      const service = new WorkflowEngineService(pool);
      await expect(
        service.startWorkflow({
          organizationId: ORG_ID,
          workflowId: WORKFLOW_ID,
          triggeredBy: 'user-1',
          triggerData: {},
          correlationId: 'corr-1',
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('completeWorkflowRun', () => {
    it('sets status to completed', async () => {
      const completedRow = makeRunRow({
        status: 'completed',
        completed_at: '2026-01-01T01:00:00.000Z',
      });

      const pool = makePool([
        [], // set_config
        [{ status: 'running' }], // SELECT status
        [completedRow], // UPDATE RETURNING
        [], // INSERT history
      ]);

      const service = new WorkflowEngineService(pool);
      const result = await service.completeWorkflowRun(ORG_ID, RUN_ID, { result: 'ok' }, 'user-1');

      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe('2026-01-01T01:00:00.000Z');
    });

    it('throws if run is not found', async () => {
      const pool = makePool([
        [], // set_config
        [], // SELECT status — empty
      ]);

      const service = new WorkflowEngineService(pool);
      await expect(service.completeWorkflowRun(ORG_ID, RUN_ID, {}, 'user-1')).rejects.toThrow(
        `Workflow run not found: ${RUN_ID}`,
      );
    });
  });

  describe('listOverdueSlaRuns', () => {
    it('returns runs past sla_due_at', async () => {
      const overdueRun = makeRunRow({
        sla_due_at: '2025-12-31T00:00:00.000Z',
        status: 'running',
      });

      const pool = makePool([
        [], // set_config
        [overdueRun, overdueRun], // SELECT overdue runs
      ]);

      const service = new WorkflowEngineService(pool);
      const results = await service.listOverdueSlaRuns(ORG_ID);

      expect(results).toHaveLength(2);
      expect(results[0]?.slaDueAt).toBe('2025-12-31T00:00:00.000Z');
    });

    it('returns empty array when no overdue runs', async () => {
      const pool = makePool([
        [], // set_config
        [], // SELECT — empty
      ]);

      const service = new WorkflowEngineService(pool);
      const results = await service.listOverdueSlaRuns(ORG_ID);

      expect(results).toHaveLength(0);
    });

    it('sets tenant context before querying', async () => {
      const pool = makePool([[], []]);

      const service = new WorkflowEngineService(pool);
      await service.listOverdueSlaRuns(ORG_ID);

      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG_ID]);
    });
  });
});
