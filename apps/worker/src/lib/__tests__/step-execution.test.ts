/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient, QueryResult } from 'pg';
import { createStepExecutor, type ExecutableWorkflowStep } from '../step-execution.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

const context = {
  organizationId: '00000000-0000-0000-0000-000000000001',
  workflowRunId: '00000000-0000-0000-0000-000000000002',
  correlationId: '00000000-0000-0000-0000-000000000003',
  actorId: '00000000-0000-0000-0000-000000000004',
  triggerData: { amount: 250, region: 'south' },
};

function step(stepType: string, config: Record<string, unknown> = {}): ExecutableWorkflowStep {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    name: 'Execution step',
    step_type: stepType,
    step_order: 1,
    next_step_id: null,
    config,
  };
}

function queues() {
  return {
    agent: { add: vi.fn().mockResolvedValue({ id: 'agent-job' }) },
    notification: { add: vi.fn().mockResolvedValue({ id: 'notification-job' }) },
    workflow: { add: vi.fn().mockResolvedValue({ id: 'workflow-job' }) },
  };
}

describe('workflow step execution dispatcher', () => {
  it('hands agent steps to Agent OS and waits for the outcome', async () => {
    const q = queues();
    const client = { query: vi.fn() } as unknown as PoolClient;
    const execute = createStepExecutor(q);
    const result = await execute(client, step('agent', { agentId: 'agent-1', input: { goal: 'review' } }), context);

    expect(result).toEqual({ disposition: 'wait', engine: 'agent' });
    expect(q.agent.add).toHaveBeenCalledWith(
      'execute',
      expect.objectContaining({
        type: 'execute', agentId: 'agent-1', triggerType: 'workflow',
        workflowRunId: context.workflowRunId,
        workflowStepId: '00000000-0000-0000-0000-000000000010',
        correlationId: context.correlationId,
      }),
      expect.objectContaining({ attempts: 3, jobId: expect.stringContaining(':agent') }),
    );
  });

  it('waits for notification worker completion before advancing', async () => {
    const q = queues();
    const client = { query: vi.fn() } as unknown as PoolClient;
    const execute = createStepExecutor(q);
    const result = await execute(
      client,
      step('notification', {
        broadcastId: 'broadcast-1', recipientIds: ['member-1'], content: 'Approved', channel: 'email',
      }),
      context,
    );

    expect(result).toEqual({ disposition: 'wait', engine: 'notification' });
    expect(q.notification.add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({ broadcastId: 'broadcast-1', channel: 'email' }),
      expect.objectContaining({ attempts: 3, jobId: expect.stringContaining(':notification') }),
    );
  });

  it('schedules delay steps through replay-safe resume-step', async () => {
    const q = queues();
    const client = { query: vi.fn() } as unknown as PoolClient;
    const execute = createStepExecutor(q);
    const result = await execute(client, step('delay', { delayMs: 4500 }), context);

    expect(result).toEqual({ disposition: 'scheduled', engine: 'delay', delayMs: 4500 });
    expect(q.workflow.add).toHaveBeenCalledWith(
      'resume-step',
      expect.objectContaining({
        jobName: 'resume-step',
        runId: context.workflowRunId,
        correlationId: context.correlationId,
        idempotencyKey: expect.stringContaining(':delay'),
      }),
      expect.objectContaining({ delay: 4500, attempts: 3, jobId: expect.stringContaining(':delay') }),
    );
  });

  it('selects a branch using persisted workflow conditions', async () => {
    const q = queues();
    const query = vi.fn().mockResolvedValue(
      ok([{ condition_type: 'field_gt', field: 'amount', value: 100, next_step_id: '00000000-0000-0000-0000-000000000099' }]),
    );
    const client = { query } as unknown as PoolClient;
    const execute = createStepExecutor(q);
    const result = await execute(client, step('branch'), context);

    expect(result).toEqual({ disposition: 'advance', engine: 'branch', nextStepId: '00000000-0000-0000-0000-000000000099' });
  });

  it('rejects an approval step without explicit assignees', async () => {
    const q = queues();
    const client = { query: vi.fn() } as unknown as PoolClient;
    const execute = createStepExecutor(q);
    await expect(execute(client, step('approval'), context)).rejects.toThrow('requires config.assignedTo');
  });
});
