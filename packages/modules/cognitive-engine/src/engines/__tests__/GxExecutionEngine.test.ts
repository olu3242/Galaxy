import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GxExecutionEngine } from '../GxExecutionEngine.js';
import type { PlanTask, ExecutionPlan } from '../GxPlanningEngine.js';
import type { ToolExecutionContext } from '../GxExecutionEngine.js';

const ORG = '00000000-0000-0000-0000-000000000006';

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

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'task-1',
    title: 'Test task',
    description: 'A test task',
    dependsOn: [],
    estimatedMinutes: 1,
    priority: 'medium',
    status: 'pending',
    ...overrides,
  };
}

function makeCtx(pool: Pool): ToolExecutionContext {
  return {
    organizationId: ORG,
    actorId: 'actor-1',
    correlationId: 'corr-1',
    pool,
  };
}

describe('GxExecutionEngine.executeTask', () => {
  it('uses registered tool handler when task.tool matches', async () => {
    const pool = makePool([]);
    const engine = new GxExecutionEngine(pool, { maxRetries: 0 });
    const handler = vi.fn().mockResolvedValue({ done: true });
    engine.registerTool('my_tool', handler);
    const task = makeTask({ tool: 'my_tool' });
    const result = await engine.executeTask(task, makeCtx(pool));
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ done: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('falls back to defaultExecute (sets tenant ctx) when no tool matches', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxExecutionEngine(pool, { maxRetries: 0 });
    const task = makeTask();
    const result = await engine.executeTask(task, makeCtx(pool));
    expect(result.success).toBe(true);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('returns failure after exhausting retries', async () => {
    const pool = makePool([]);
    const engine = new GxExecutionEngine(pool, { maxRetries: 1, retryDelayMs: 0 });
    engine.registerTool('fail_tool', () => {
      throw new Error('tool error');
    });
    const task = makeTask({ tool: 'fail_tool' });
    const result = await engine.executeTask(task, makeCtx(pool));
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('tool error');
    expect(result.retryCount).toBeGreaterThan(0);
  });
});

describe('GxExecutionEngine.executePlan', () => {
  it('executes all tasks and returns results', async () => {
    const pool = makePool(Array.from({ length: 10 }, () => ok([])));
    const engine = new GxExecutionEngine(pool, { maxRetries: 0 });
    const task1 = makeTask({ id: 'task-1' });
    const task2 = makeTask({ id: 'task-2', dependsOn: ['task-1'] });
    const plan: ExecutionPlan = {
      id: 'plan-1',
      goal: 'test',
      organizationId: ORG,
      tasks: [task1, task2],
      executionOrder: [['task-1'], ['task-2']],
      estimatedTotalMinutes: 2,
      complexity: 'simple',
      requiresMultiAgent: false,
      createdAt: new Date().toISOString(),
    };
    const results = await engine.executePlan(plan, makeCtx(pool));
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('skips tasks whose dependency failed', async () => {
    const pool = makePool([]);
    const engine = new GxExecutionEngine(pool, { maxRetries: 0 });
    engine.registerTool('fail_tool', () => {
      throw new Error('fail');
    });
    const task1 = makeTask({ id: 'task-1', tool: 'fail_tool' });
    const task2 = makeTask({ id: 'task-2', dependsOn: ['task-1'] });
    const plan: ExecutionPlan = {
      id: 'plan-2',
      goal: 'test',
      organizationId: ORG,
      tasks: [task1, task2],
      executionOrder: [['task-1'], ['task-2']],
      estimatedTotalMinutes: 2,
      complexity: 'simple',
      requiresMultiAgent: false,
      createdAt: new Date().toISOString(),
    };
    const results = await engine.executePlan(plan, makeCtx(pool));
    const skipped = results.find((r) => r.taskId === 'task-2');
    expect(skipped?.success).toBe(false);
    expect(skipped?.errorMessage).toContain('Skipped');
  });
});

describe('GxExecutionEngine built-in audit_logger tool', () => {
  it('audit_logger sets tenant ctx and returns logged:true', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxExecutionEngine(pool, { maxRetries: 0 });
    const task = makeTask({ tool: 'audit_logger' });
    const result = await engine.executeTask(task, makeCtx(pool));
    expect(result.success).toBe(true);
    expect(result.output?.logged).toBe(true);
  });
});
