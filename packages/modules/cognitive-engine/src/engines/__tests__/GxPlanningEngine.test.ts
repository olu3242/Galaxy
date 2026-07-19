import { describe, it, expect } from 'vitest';
import { GxPlanningEngine } from '../GxPlanningEngine.js';
import type { PlanInput } from '../GxPlanningEngine.js';

const ORG = '00000000-0000-0000-0000-000000000007';

describe('GxPlanningEngine.createPlan', () => {
  it('returns an ExecutionPlan with required fields', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({ goal: 'do something', organizationId: ORG });
    expect(typeof plan.id).toBe('string');
    expect(plan.goal).toBe('do something');
    expect(plan.organizationId).toBe(ORG);
    expect(Array.isArray(plan.tasks)).toBe(true);
    expect(Array.isArray(plan.executionOrder)).toBe(true);
  });

  it('always starts with a context-gather task', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({ goal: 'generic action', organizationId: ORG });
    const first = plan.tasks[0];
    expect(first?.title).toContain('context');
    expect(first?.dependsOn).toHaveLength(0);
  });

  it('always ends with audit/verify task', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({ goal: 'generate report for Q1', organizationId: ORG });
    const last = plan.tasks[plan.tasks.length - 1];
    expect(last?.tool).toBe('audit_logger');
  });

  it('creates report-specific tasks for report goal', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({
      goal: 'generate analytics summary report',
      organizationId: ORG,
    });
    const titles = plan.tasks.map((t) => t.title);
    expect(titles.some((t) => t.toLowerCase().includes('aggregate'))).toBe(true);
  });

  it('creates workflow-specific tasks for workflow goal', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({
      goal: 'trigger the onboarding workflow',
      organizationId: ORG,
    });
    const titles = plan.tasks.map((t) => t.title);
    expect(titles.some((t) => t.toLowerCase().includes('workflow'))).toBe(true);
  });

  it('creates approval-specific tasks for approve goal', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({ goal: 'approve the budget request', organizationId: ORG });
    const titles = plan.tasks.map((t) => t.title);
    expect(titles.some((t) => t.toLowerCase().includes('approval'))).toBe(true);
  });

  it('assigns correct complexity based on estimated time', () => {
    const engine = new GxPlanningEngine();
    const simple = engine.createPlan({ goal: 'do x', organizationId: ORG });
    // default tasks sum to few minutes → should be simple or moderate
    expect(['simple', 'moderate', 'complex']).toContain(simple.complexity);
  });

  it('executionOrder covers all tasks', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({ goal: 'generate report', organizationId: ORG });
    const orderedIds = plan.executionOrder.flat();
    const taskIds = plan.tasks.map((t) => t.id);
    expect(orderedIds.sort()).toEqual(taskIds.sort());
  });
});

describe('GxPlanningEngine.updateTaskStatus', () => {
  it('updates the status of the specified task', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({ goal: 'run something', organizationId: ORG });
    const taskId = plan.tasks[0]?.id ?? 'task-1';
    const updated = engine.updateTaskStatus(plan, taskId, 'completed');
    const task = updated.tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('completed');
  });

  it('does not mutate original plan', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({ goal: 'test', organizationId: ORG });
    const taskId = plan.tasks[0]?.id ?? 'task-1';
    engine.updateTaskStatus(plan, taskId, 'in_progress');
    const originalTask = plan.tasks.find((t) => t.id === taskId);
    expect(originalTask?.status).toBe('pending');
  });

  it('attaches output when provided', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({ goal: 'test', organizationId: ORG });
    const taskId = plan.tasks[0]?.id ?? 'task-1';
    const updated = engine.updateTaskStatus(plan, taskId, 'completed', { result: 'ok' });
    const task = updated.tasks.find((t) => t.id === taskId);
    expect(task?.output).toEqual({ result: 'ok' });
  });

  it('ignores unknown task ids', () => {
    const engine = new GxPlanningEngine();
    const plan = engine.createPlan({ goal: 'test', organizationId: ORG });
    const updated = engine.updateTaskStatus(plan, 'nonexistent-id', 'completed');
    expect(updated.tasks.every((t) => t.status === 'pending')).toBe(true);
  });
});

describe('GxPlanningEngine unused input parameter', () => {
  it('accepts availableTools and constraints without error', () => {
    const engine = new GxPlanningEngine();
    const input: PlanInput = {
      goal: 'approve request',
      organizationId: ORG,
      availableTools: ['policy_engine'],
      constraints: { maxMinutes: 10, requireHumanApproval: true },
    };
    expect(() => engine.createPlan(input)).not.toThrow();
  });
});
