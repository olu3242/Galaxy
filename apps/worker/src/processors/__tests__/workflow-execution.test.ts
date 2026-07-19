/**
 * workflow-execution processor — unit tests
 *
 * Mocks: pg.Pool, bullmq.Job, @galaxy/communication, @galaxy/events, @galaxy/identity
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { createWorkflowProcessor } from '../workflow-execution.js';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const RUN_ID = '00000000-0000-0000-0000-000000000002';

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
    data: { jobName, organizationId: ORG, runId: RUN_ID, correlationId: 'corr-1', ...extra },
  } as unknown as import('bullmq').Job;
}

// ─── start-workflow ───────────────────────────────────────────────────────────

describe('workflow-execution: start-workflow', () => {
  it('sets tenant context before any DML', async () => {
    const pool = makePool([
      ok([]),  // set_config
      ok([]),  // UPDATE workflow_runs
      ok([]),  // INSERT workflow_history
      ok([{ id: RUN_ID, trigger_data: {} }]),  // SELECT run
      ok([]),  // SELECT manager
    ]);
    const processor = createWorkflowProcessor(pool);
    await processor(makeJob('start-workflow'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]![0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]![1]).toContain(ORG);
  });

  it('updates workflow_runs to running', async () => {
    const pool = makePool([
      ok([]),
      ok([]),
      ok([]),
      ok([{ id: RUN_ID, trigger_data: {} }]),
      ok([]),
    ]);
    const processor = createWorkflowProcessor(pool);
    await processor(makeJob('start-workflow'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const updateCall = calls.find(([sql]) => sql.includes("status = 'running'"));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain(RUN_ID);
    expect(updateCall![1]).toContain(ORG);
  });

  it('inserts workflow_history with running status', async () => {
    const pool = makePool([
      ok([]),
      ok([]),
      ok([]),
      ok([{ id: RUN_ID, trigger_data: {} }]),
      ok([]),
    ]);
    const processor = createWorkflowProcessor(pool);
    await processor(makeJob('start-workflow'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const histCall = calls.find(([sql]) => sql.includes('workflow_history'));
    expect(histCall).toBeDefined();
  });
});

// ─── complete-workflow ────────────────────────────────────────────────────────

describe('workflow-execution: complete-workflow', () => {
  it('updates workflow_runs to completed', async () => {
    const pool = makePool([ok([]), ok([]), ok([]), ok([])]);
    const processor = createWorkflowProcessor(pool);
    await processor(makeJob('complete-workflow'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const updateCall = calls.find(([sql]) => sql.includes("status = 'completed'"));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain(RUN_ID);
    expect(updateCall![1]).toContain(ORG);
  });

  it('inserts completed workflow_history entry', async () => {
    const pool = makePool([ok([]), ok([]), ok([]), ok([])]);
    const processor = createWorkflowProcessor(pool);
    await processor(makeJob('complete-workflow'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const histCall = calls.find(
      ([sql]) => sql.includes('workflow_history') && sql.includes("'completed'"),
    );
    expect(histCall).toBeDefined();
  });

  it('writes audit log for workflow.completed', async () => {
    const pool = makePool([ok([]), ok([]), ok([]), ok([])]);
    const processor = createWorkflowProcessor(pool);
    await processor(makeJob('complete-workflow'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const auditCall = calls.find(
      ([sql]) => sql.includes('audit_logs') && sql.includes('INSERT'),
    );
    expect(auditCall).toBeDefined();
    const params = auditCall![1];
    expect(params).toContain('workflow.completed');
    expect(params).toContain(ORG);
  });
});

// ─── fail-workflow ────────────────────────────────────────────────────────────

describe('workflow-execution: fail-workflow', () => {
  it('updates workflow_runs to failed', async () => {
    const pool = makePool([ok([]), ok([]), ok([]), ok([])]);
    const processor = createWorkflowProcessor(pool);
    await processor(makeJob('fail-workflow'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const updateCall = calls.find(([sql]) => sql.includes("status = 'failed'"));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain(RUN_ID);
  });

  it('writes audit log for workflow.failed', async () => {
    const pool = makePool([ok([]), ok([]), ok([]), ok([])]);
    const processor = createWorkflowProcessor(pool);
    await processor(makeJob('fail-workflow'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const auditCall = calls.find(
      ([sql]) => sql.includes('audit_logs') && sql.includes('INSERT'),
    );
    expect(auditCall).toBeDefined();
    const params = auditCall![1];
    expect(params).toContain('workflow.failed');
  });
});

// ─── advance-step ─────────────────────────────────────────────────────────────

describe('workflow-execution: advance-step', () => {
  it('inserts workflow_history entry', async () => {
    const pool = makePool([ok([]), ok([])]);
    const processor = createWorkflowProcessor(pool);
    await processor(makeJob('advance-step'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const histCall = calls.find(([sql]) => sql.includes('workflow_history'));
    expect(histCall).toBeDefined();
  });
});

// ─── unknown job name ─────────────────────────────────────────────────────────

describe('workflow-execution: unknown job', () => {
  it('throws for an unrecognised job name', async () => {
    const pool = makePool([ok([])]);
    const processor = createWorkflowProcessor(pool);
    await expect(processor(makeJob('nonexistent-job'))).rejects.toThrow('Unknown job name');
  });
});
