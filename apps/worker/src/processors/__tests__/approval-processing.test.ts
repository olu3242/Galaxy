/**
 * approval-processing processor — unit tests
 *
 * Covers: post-approval-advance · post-rejection-notify · org resolution
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { Job } from 'bullmq';
import { createApprovalProcessor } from '../approval-processing.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@galaxy/communication', () => ({
  WhatsAppProvider: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@galaxy/events', () => ({
  EventPublisher: vi.fn().mockImplementation(() => ({
    publish: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@galaxy/identity', () => ({
  AuditRepository: vi.fn().mockImplementation(() => ({
    insert: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const APPROVAL_ID = '00000000-0000-0000-0000-000000000010';
const RUN_ID = '00000000-0000-0000-0000-000000000020';
const APPROVER_ID = '00000000-0000-0000-0000-000000000030';

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

function makeJob(jobName: string, extra?: Record<string, unknown>) {
  return {
    id: 'job-1',
    name: jobName,
    data: {
      jobName,
      organizationId: ORG,
      approvalId: APPROVAL_ID,
      workflowRunId: RUN_ID,
      approverId: APPROVER_ID,
      decision: 'approved',
      correlationId: 'corr-1',
      ...extra,
    },
  } as unknown as Job;
}

type QueryCall = [string, unknown[]];

function queryCalls(pool: Pool): QueryCall[] {
  return (pool.query as ReturnType<typeof vi.fn>).mock.calls as QueryCall[];
}

function runRow(overrides: Partial<{ status: string; senderPhone: string }> = {}) {
  return {
    id: RUN_ID,
    organization_id: ORG,
    workflow_id: 'wf-1',
    status: overrides.status ?? 'running',
    trigger_data: { senderPhone: overrides.senderPhone ?? '+2341234567890' },
  };
}

// ─── post-approval-advance ────────────────────────────────────────────────────

describe('approval-processing: post-approval-advance', () => {
  it('sets tenant context before any DML', async () => {
    const pool = makePool([
      ok([]),                      // set_config
      ok([runRow()]),              // SELECT workflow_run
      ok([]),                      // UPDATE workflow_runs
      ok([]),                      // INSERT workflow_history
    ]);
    const processor = createApprovalProcessor(pool);
    await processor(makeJob('post-approval-advance'));

    const calls = queryCalls(pool);
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toContain(ORG);
  });

  it('updates workflow_runs to completed', async () => {
    const pool = makePool([
      ok([]),
      ok([runRow()]),
      ok([]),
      ok([]),
    ]);
    const processor = createApprovalProcessor(pool);
    await processor(makeJob('post-approval-advance'));

    const calls = queryCalls(pool);
    const updateCall = calls.find(([sql]) => sql.includes("status = 'completed'"));
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]).toContain(RUN_ID);
    expect(updateCall?.[1]).toContain(ORG);
  });

  it('inserts workflow_history entry with approverId', async () => {
    const pool = makePool([ok([]), ok([runRow()]), ok([]), ok([])]);
    const processor = createApprovalProcessor(pool);
    await processor(makeJob('post-approval-advance'));

    const calls = queryCalls(pool);
    const histCall = calls.find(([sql]) => sql.includes('workflow_history'));
    expect(histCall).toBeDefined();
    expect(histCall?.[1]).toContain(APPROVER_ID);
  });

  it('writes audit log for workflow.completed', async () => {
    const pool = makePool([ok([]), ok([runRow()]), ok([]), ok([])]);
    const processor = createApprovalProcessor(pool);
    await processor(makeJob('post-approval-advance'));

    const calls = queryCalls(pool);
    const auditCall = calls.find(([sql]) => sql.includes('audit_logs'));
    expect(auditCall).toBeDefined();
    expect(auditCall?.[1]).toContain('workflow.completed');
  });

  it('skips when run is already completed', async () => {
    const pool = makePool([ok([]), ok([runRow({ status: 'completed' })]), ok([]), ok([])]);
    const processor = createApprovalProcessor(pool);
    await processor(makeJob('post-approval-advance'));

    const calls = queryCalls(pool);
    const updateCall = calls.find(([sql]) => sql.includes("status = 'completed'") && sql.includes('UPDATE'));
    expect(updateCall).toBeUndefined();
  });

  it('resolves organizationId from run when _resolveOrgFromRun is set', async () => {
    const pool = makePool([
      ok([{ organization_id: ORG }]),  // org lookup
      ok([]),                           // set_config
      ok([runRow()]),                   // SELECT run
      ok([]),                           // UPDATE
      ok([]),                           // INSERT history
    ]);
    const processor = createApprovalProcessor(pool);
    await processor(
      makeJob('post-approval-advance', {
        organizationId: '',
        _resolveOrgFromRun: true,
      }),
    );

    const calls = queryCalls(pool);
    expect(calls[0]?.[0]).toContain('organization_id');
    expect(calls[0]?.[1]).toContain(RUN_ID);
  });
});

// ─── post-rejection-notify ─────────────────────────────────────────────────��──

describe('approval-processing: post-rejection-notify', () => {
  it('updates workflow_runs to failed', async () => {
    const pool = makePool([ok([]), ok([runRow()]), ok([])]);
    const processor = createApprovalProcessor(pool);
    await processor(makeJob('post-rejection-notify', { decision: 'rejected' }));

    const calls = queryCalls(pool);
    const updateCall = calls.find(([sql]) => sql.includes("status = 'failed'"));
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]).toContain(RUN_ID);
    expect(updateCall?.[1]).toContain(ORG);
  });

  it('inserts workflow_history with failed transition', async () => {
    const pool = makePool([ok([]), ok([runRow()]), ok([])]);
    const processor = createApprovalProcessor(pool);
    await processor(makeJob('post-rejection-notify', { decision: 'rejected' }));

    const calls = queryCalls(pool);
    const histCall = calls.find(([sql]) => sql.includes('workflow_history'));
    expect(histCall).toBeDefined();
    expect(histCall?.[1]).toContain(APPROVER_ID);
  });

  it('writes audit log for workflow.rejected', async () => {
    const pool = makePool([ok([]), ok([runRow()]), ok([])]);
    const processor = createApprovalProcessor(pool);
    await processor(makeJob('post-rejection-notify', { decision: 'rejected' }));

    const calls = queryCalls(pool);
    const auditCall = calls.find(([sql]) => sql.includes('audit_logs'));
    expect(auditCall).toBeDefined();
    expect(auditCall?.[1]).toContain('workflow.rejected');
  });
});

// ─── unknown job ─────────��────────────────────────────────────────────────────

describe('approval-processing: unknown job', () => {
  it('throws for an unrecognised job name', async () => {
    const pool = makePool([ok([])]);
    const processor = createApprovalProcessor(pool);
    await expect(processor(makeJob('bad-job'))).rejects.toThrow('Unknown approval job');
  });
});
