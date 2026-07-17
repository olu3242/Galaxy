import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TaskEngineService } from '../TaskEngineService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const TASK_ID = '00000000-0000-0000-0000-000000000010';
const REPORTER_ID = '00000000-0000-0000-0000-000000000020';
const ASSIGNEE_ID = '00000000-0000-0000-0000-000000000030';
const CORR_ID = '00000000-0000-0000-0000-000000000099';

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

function taskRow(overrides: Partial<{ status: string; assignee_id: string | null; completed_at: string | null }> = {}) {
  return {
    id: TASK_ID,
    organization_id: ORG,
    workflow_run_id: null,
    title: 'Review contract',
    description: null,
    status: overrides.status ?? 'pending',
    priority: 'medium',
    assignee_id: overrides.assignee_id ?? null,
    reporter_id: REPORTER_ID,
    due_at: null,
    completed_at: overrides.completed_at ?? null,
    correlation_id: CORR_ID,
    data: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('TaskEngineService.createTask', () => {
  it('sets tenant context before insert', async () => {
    const pool = makePool([ok([]), ok([taskRow()])]);
    const svc = new TaskEngineService(pool);
    await svc.createTask({
      organizationId: ORG,
      title: 'Review contract',
      reporterId: REPORTER_ID,
      correlationId: CORR_ID,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns mapped Task with status pending', async () => {
    const pool = makePool([ok([]), ok([taskRow()])]);
    const svc = new TaskEngineService(pool);
    const result = await svc.createTask({
      organizationId: ORG,
      title: 'Review contract',
      reporterId: REPORTER_ID,
      correlationId: CORR_ID,
    });
    expect(result.id).toBe(TASK_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.status).toBe('pending');
    expect(result.priority).toBe('medium');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TaskEngineService(pool);
    await expect(
      svc.createTask({
        organizationId: ORG,
        title: 'X',
        reporterId: REPORTER_ID,
        correlationId: CORR_ID,
      }),
    ).rejects.toThrow();
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
    const result = await svc.getTask(ORG, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('TaskEngineService.assignTask', () => {
  it('returns task with assignee and in_progress status', async () => {
    // setTenantContext + SELECT status + UPDATE task + INSERT assignment + INSERT history
    const pool = makePool([
      ok([]),
      ok([{ status: 'pending' }]),
      ok([taskRow({ status: 'in_progress', assignee_id: ASSIGNEE_ID })]),
      ok([]),
      ok([]),
    ]);
    const svc = new TaskEngineService(pool);
    const result = await svc.assignTask(ORG, TASK_ID, ASSIGNEE_ID, REPORTER_ID);
    expect(result.assigneeId).toBe(ASSIGNEE_ID);
    expect(result.status).toBe('in_progress');
  });

  it('throws when task not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TaskEngineService(pool);
    await expect(svc.assignTask(ORG, 'nonexistent', ASSIGNEE_ID, REPORTER_ID)).rejects.toThrow();
  });
});

describe('TaskEngineService.completeTask', () => {
  it('returns task with completed status', async () => {
    // setTenantContext + SELECT status + UPDATE task + INSERT history
    const pool = makePool([
      ok([]),
      ok([{ status: 'in_progress' }]),
      ok([taskRow({ status: 'completed', completed_at: '2026-01-02T00:00:00.000Z' })]),
      ok([]),
    ]);
    const svc = new TaskEngineService(pool);
    const result = await svc.completeTask(ORG, TASK_ID, REPORTER_ID);
    expect(result.status).toBe('completed');
    expect(result.completedAt).toBeTruthy();
  });

  it('throws when task not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TaskEngineService(pool);
    await expect(svc.completeTask(ORG, 'nonexistent', REPORTER_ID)).rejects.toThrow();
  });
});

describe('TaskEngineService.listTasks', () => {
  it('returns all tasks for org', async () => {
    const rows = [taskRow(), { ...taskRow(), id: '00000000-0000-0000-0000-000000000099' }];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new TaskEngineService(pool);
    const result = await svc.listTasks(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no tasks', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TaskEngineService(pool);
    const result = await svc.listTasks(ORG);
    expect(result).toEqual([]);
  });

  it('passes status filter param when provided', async () => {
    const pool = makePool([ok([]), ok([taskRow({ status: 'in_progress' })])]);
    const svc = new TaskEngineService(pool);
    await svc.listTasks(ORG, { status: 'in_progress' });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain('in_progress');
  });
});
