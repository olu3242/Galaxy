/**
 * Workflow OS — WorkflowDefinitionService · TaskEngineService · AutomationService unit tests
 *
 * Covers: createWorkflow · getWorkflow · listWorkflows · activateWorkflow · deactivateWorkflow ·
 *         createTask · getTask · assignTask · completeTask · listTasks ·
 *         evaluateTriggers · executeAutomation · listAutomations
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { WorkflowDefinitionService } from '../services/WorkflowDefinitionService.js';
import { TaskEngineService } from '../tasks/TaskEngineService.js';
import { AutomationService } from '../automation/AutomationService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const WF_ID = '00000000-0000-0000-0000-000000000010';
const TASK_ID = '00000000-0000-0000-0000-000000000020';
const AUTO_ID = '00000000-0000-0000-0000-000000000030';
const EXEC_ID = '00000000-0000-0000-0000-000000000040';
const NOW = '2026-01-01T00:00:00.000Z';

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

function wfRow(overrides: Partial<{ is_active: boolean }> = {}) {
  return {
    id: WF_ID,
    organization_id: ORG,
    name: 'Onboarding Workflow',
    description: null,
    version: 1,
    is_active: overrides.is_active ?? false,
    automation_domain: 'task',
    flow_type: 'automated',
    owner_id: null,
    department_id: null,
    sla_duration_hours: null,
    tags: [],
    definition: {},
    created_by: 'user-1',
    created_at: NOW,
    updated_at: NOW,
  };
}

function taskRow(overrides: Partial<{ status: string; assignee_id: string | null }> = {}) {
  return {
    id: TASK_ID,
    organization_id: ORG,
    workflow_run_id: null,
    title: 'Review document',
    description: null,
    status: overrides.status ?? 'pending',
    priority: 'medium',
    assignee_id: overrides.assignee_id ?? null,
    reporter_id: 'user-1',
    due_at: null,
    completed_at: null,
    correlation_id: 'corr-1',
    data: {},
    created_at: NOW,
    updated_at: NOW,
  };
}

function automationRow(conditions: unknown[] = []) {
  return {
    id: AUTO_ID,
    name: 'Auto-assign on submit',
    trigger_event: 'workflow.submitted',
    trigger_conditions: conditions,
    actions: [],
    is_active: true,
    created_at: NOW,
  };
}

// ─── WorkflowDefinitionService ────────────────────────────────────────────────

describe('WorkflowDefinitionService.createWorkflow', () => {
  it('sets tenant context and returns mapped WorkflowDefinition', async () => {
    const pool = makePool([ok([]), ok([wfRow()])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.createWorkflow({
      organizationId: ORG,
      name: 'Onboarding Workflow',
      automationDomain: 'task',
      flowType: 'automated',
      createdBy: 'user-1',
      correlationId: 'corr-1',
    });

    expect(result.id).toBe(WF_ID);
    expect(result.name).toBe('Onboarding Workflow');
    expect(result.isActive).toBe(false);
    expect(result.version).toBe(1);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
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
        createdBy: 'u1',
        correlationId: 'c1',
      }),
    ).rejects.toThrow('RETURNING returned no row');
  });
});

describe('WorkflowDefinitionService.getWorkflow', () => {
  it('returns mapped workflow when found', async () => {
    const pool = makePool([ok([]), ok([wfRow()])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.getWorkflow(ORG, WF_ID);
    expect(result?.id).toBe(WF_ID);
    expect(result?.organizationId).toBe(ORG);
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
    const pool = makePool([ok([]), ok([wfRow(), wfRow()])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.listWorkflows(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when none exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.listWorkflows(ORG);
    expect(result).toHaveLength(0);
  });
});

describe('WorkflowDefinitionService.activateWorkflow', () => {
  it('returns workflow with is_active true', async () => {
    const pool = makePool([ok([]), ok([wfRow({ is_active: true })])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.activateWorkflow(ORG, WF_ID);
    expect(result.isActive).toBe(true);
  });

  it('throws when workflow not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDefinitionService(pool);
    await expect(svc.activateWorkflow(ORG, 'ghost')).rejects.toThrow('Workflow not found');
  });
});

describe('WorkflowDefinitionService.deactivateWorkflow', () => {
  it('returns workflow with is_active false', async () => {
    const pool = makePool([ok([]), ok([wfRow({ is_active: false })])]);
    const svc = new WorkflowDefinitionService(pool);
    const result = await svc.deactivateWorkflow(ORG, WF_ID);
    expect(result.isActive).toBe(false);
  });

  it('throws when workflow not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDefinitionService(pool);
    await expect(svc.deactivateWorkflow(ORG, 'ghost')).rejects.toThrow('Workflow not found');
  });
});

// ─── TaskEngineService ────────────────────────────────────────────────────────

describe('TaskEngineService.createTask', () => {
  it('sets tenant context and returns task with pending status', async () => {
    const pool = makePool([ok([]), ok([taskRow()])]);
    const svc = new TaskEngineService(pool);
    const result = await svc.createTask({
      organizationId: ORG,
      title: 'Review document',
      reporterId: 'user-1',
      correlationId: 'corr-1',
    });

    expect(result.id).toBe(TASK_ID);
    expect(result.status).toBe('pending');
    expect(result.priority).toBe('medium');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TaskEngineService(pool);
    await expect(
      svc.createTask({ organizationId: ORG, title: 'X', reporterId: 'u1', correlationId: 'c1' }),
    ).rejects.toThrow('RETURNING returned no row');
  });
});

describe('TaskEngineService.getTask', () => {
  it('returns task when found', async () => {
    const pool = makePool([ok([]), ok([taskRow()])]);
    const svc = new TaskEngineService(pool);
    const result = await svc.getTask(ORG, TASK_ID);
    expect(result?.id).toBe(TASK_ID);
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TaskEngineService(pool);
    const result = await svc.getTask(ORG, 'ghost');
    expect(result).toBeNull();
  });
});

describe('TaskEngineService.assignTask', () => {
  it('transitions pending task to in_progress and inserts assignment + history', async () => {
    const pool = makePool([
      ok([]), // set_config
      ok([{ status: 'pending' }]), // SELECT status
      ok([taskRow({ status: 'in_progress', assignee_id: 'user-2' })]), // UPDATE
      ok([]), // INSERT task_assignments
      ok([]), // INSERT task_history
    ]);
    const svc = new TaskEngineService(pool);
    const result = await svc.assignTask(ORG, TASK_ID, 'user-2', 'actor-1');
    expect(result.status).toBe('in_progress');
  });

  it('throws when task not found during status fetch', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TaskEngineService(pool);
    await expect(svc.assignTask(ORG, 'ghost', 'u2', 'a1')).rejects.toThrow('Task not found');
  });
});

describe('TaskEngineService.completeTask', () => {
  it('sets status to completed', async () => {
    const pool = makePool([
      ok([]), // set_config
      ok([{ status: 'in_progress' }]), // SELECT status
      ok([taskRow({ status: 'completed' })]), // UPDATE
      ok([]), // INSERT task_history
    ]);
    const svc = new TaskEngineService(pool);
    const result = await svc.completeTask(ORG, TASK_ID, 'actor-1');
    expect(result.status).toBe('completed');
  });

  it('throws when task not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TaskEngineService(pool);
    await expect(svc.completeTask(ORG, 'ghost', 'a1')).rejects.toThrow('Task not found');
  });
});

describe('TaskEngineService.listTasks', () => {
  it('returns tasks for org', async () => {
    const pool = makePool([ok([]), ok([taskRow(), taskRow()])]);
    const svc = new TaskEngineService(pool);
    const result = await svc.listTasks(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no tasks', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TaskEngineService(pool);
    const result = await svc.listTasks(ORG);
    expect(result).toHaveLength(0);
  });
});

// ─── AutomationService ────────────────────────────────────────────────────────

describe('AutomationService.evaluateTriggers', () => {
  it('returns matched=true when conditions are empty', async () => {
    const pool = makePool([ok([]), ok([automationRow([])])]);
    const svc = new AutomationService(pool);
    const result = await svc.evaluateTriggers(ORG, 'workflow.submitted', { role: 'admin' });
    expect(result).toHaveLength(1);
    expect(result[0]?.matched).toBe(true);
  });

  it('returns matched=false when equals condition fails', async () => {
    const pool = makePool([
      ok([]),
      ok([automationRow([{ field: 'role', operator: 'equals', value: 'admin' }])]),
    ]);
    const svc = new AutomationService(pool);
    const result = await svc.evaluateTriggers(ORG, 'workflow.submitted', { role: 'viewer' });
    expect(result[0]?.matched).toBe(false);
  });

  it('returns matched=true when contains condition passes', async () => {
    const pool = makePool([
      ok([]),
      ok([automationRow([{ field: 'email', operator: 'contains', value: 'galaxy' }])]),
    ]);
    const svc = new AutomationService(pool);
    const result = await svc.evaluateTriggers(ORG, 'workflow.submitted', {
      email: 'admin@galaxy.io',
    });
    expect(result[0]?.matched).toBe(true);
  });

  it('returns empty array when no automations match trigger event', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AutomationService(pool);
    const result = await svc.evaluateTriggers(ORG, 'task.completed', {});
    expect(result).toHaveLength(0);
  });
});

describe('AutomationService.executeAutomation', () => {
  it('returns executionId with completed status', async () => {
    const pool = makePool([ok([]), ok([{ id: EXEC_ID, status: 'running' }]), ok([])]);
    const svc = new AutomationService(pool);
    const result = await svc.executeAutomation(ORG, AUTO_ID, {}, 'corr-1');
    expect(result.executionId).toBe(EXEC_ID);
    expect(result.status).toBe('completed');
  });

  it('throws when automation not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AutomationService(pool);
    await expect(svc.executeAutomation(ORG, 'ghost', {}, 'c1')).rejects.toThrow(
      'Automation not found',
    );
  });
});

describe('AutomationService.listAutomations', () => {
  it('returns all automations for org', async () => {
    const pool = makePool([ok([]), ok([automationRow(), automationRow()])]);
    const svc = new AutomationService(pool);
    const result = await svc.listAutomations(ORG);
    expect(result).toHaveLength(2);
    expect(result[0]?.triggerEvent).toBe('workflow.submitted');
    expect(result[0]?.isActive).toBe(true);
  });

  it('filters by isActive when provided', async () => {
    const pool = makePool([ok([]), ok([automationRow()])]);
    const svc = new AutomationService(pool);
    const result = await svc.listAutomations(ORG, { isActive: true });
    expect(result).toHaveLength(1);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain(true);
  });

  it('returns empty array when none exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AutomationService(pool);
    const result = await svc.listAutomations(ORG);
    expect(result).toHaveLength(0);
  });
});
