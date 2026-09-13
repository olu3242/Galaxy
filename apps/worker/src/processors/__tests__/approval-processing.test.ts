/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import type { Job } from 'bullmq';
import { createApprovalProcessor } from '../approval-processing.js';

vi.mock('@galaxy/communication', () => ({
  WhatsAppProvider: vi
    .fn()
    .mockImplementation(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('@galaxy/events', () => ({
  EventPublisher: vi
    .fn()
    .mockImplementation(() => ({ publish: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('@galaxy/identity', () => ({
  AuditRepository: vi
    .fn()
    .mockImplementation(() => ({ insert: vi.fn().mockResolvedValue(undefined) })),
}));

const ORG = '00000000-0000-0000-0000-000000000001';
const APPROVAL_ID = '00000000-0000-0000-0000-000000000010';
const RUN_ID = '00000000-0000-0000-0000-000000000020';
const STEP_ID = '00000000-0000-0000-0000-000000000021';
const APPROVER_ID = '00000000-0000-0000-0000-000000000030';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(runStatus = 'waiting'): { pool: Pool; clientQuery: ReturnType<typeof vi.fn> } {
  const clientQuery = vi.fn((sql: string): Promise<QueryResult<Record<string, unknown>>> => {
    if (sql.includes('FROM workflow_runs')) {
      return Promise.resolve(
        ok([
          {
            id: RUN_ID,
            organization_id: ORG,
            workflow_id: 'wf-1',
            status: runStatus,
            current_step_id: STEP_ID,
            trigger_data: { senderPhone: '+2341234567890' },
          },
        ]),
      );
    }
    return Promise.resolve(ok([]));
  });
  const client = { query: clientQuery, release: vi.fn() } as unknown as PoolClient;
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn().mockResolvedValue(ok([])),
  } as unknown as Pool;
  return { pool, clientQuery };
}

function makeJob(jobName: string, decision: 'approved' | 'rejected' = 'approved'): Job {
  return {
    id: 'job-1',
    name: jobName,
    data: {
      jobName,
      organizationId: ORG,
      approvalId: APPROVAL_ID,
      workflowRunId: RUN_ID,
      approverId: APPROVER_ID,
      decision,
      correlationId: 'corr-1',
    },
  } as unknown as Job;
}

describe('approval-processing convergence', () => {
  it('queues replay-safe resume instead of prematurely completing the workflow', async () => {
    const { pool, clientQuery } = makePool();
    const add = vi.fn().mockResolvedValue(undefined);
    await createApprovalProcessor(pool, { add })(makeJob('post-approval-advance'));

    expect(add).toHaveBeenCalledWith(
      'resume-step',
      expect.objectContaining({
        jobName: 'resume-step',
        runId: RUN_ID,
        completedStepId: STEP_ID,
        idempotencyKey: expect.stringContaining(':legacy-approval:'),
      }),
      expect.objectContaining({ attempts: 3 }),
    );
    expect(
      clientQuery.mock.calls.some(
        ([sql]) =>
          String(sql).includes('UPDATE workflow_runs') &&
          String(sql).includes("status = 'completed'"),
      ),
    ).toBe(false);
  });

  it('queues workflow failure after rejection', async () => {
    const { pool } = makePool();
    const add = vi.fn().mockResolvedValue(undefined);
    await createApprovalProcessor(pool, { add })(makeJob('post-rejection-notify', 'rejected'));

    expect(add).toHaveBeenCalledWith(
      'fail-workflow',
      expect.objectContaining({
        jobName: 'fail-workflow',
        runId: RUN_ID,
        outcome: expect.objectContaining({ engine: 'approval', status: 'rejected' }),
      }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('skips terminal workflow runs', async () => {
    const { pool } = makePool('completed');
    const add = vi.fn().mockResolvedValue(undefined);
    await createApprovalProcessor(pool, { add })(makeJob('post-approval-advance'));
    expect(add).not.toHaveBeenCalled();
  });

  it('throws for an unrecognised job name on an active run', async () => {
    const { pool } = makePool();
    const add = vi.fn().mockResolvedValue(undefined);
    await expect(createApprovalProcessor(pool, { add })(makeJob('bad-job'))).rejects.toThrow(
      'Unknown approval job',
    );
  });
});
