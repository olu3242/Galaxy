/** workflow-execution processor — runtime convergence tests */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import type { Job } from 'bullmq';
import { createWorkflowProcessor } from '../workflow-execution.js';

vi.mock('@galaxy/communication', () => ({ WhatsAppProvider: vi.fn().mockImplementation(() => ({ send: vi.fn().mockResolvedValue(undefined) })) }));
vi.mock('@galaxy/events', () => ({ EventPublisher: vi.fn().mockImplementation(() => ({ publish: vi.fn().mockResolvedValue(undefined) })) }));
vi.mock('@galaxy/identity', () => ({ AuditRepository: vi.fn().mockImplementation(() => ({ insert: vi.fn().mockResolvedValue(undefined) })) }));

const ORG = '00000000-0000-0000-0000-000000000001';
const RUN_ID = '00000000-0000-0000-0000-000000000002';
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000003';
const STEP_1 = '00000000-0000-0000-0000-000000000004';
const STEP_2 = '00000000-0000-0000-0000-000000000005';
const ACTOR = '00000000-0000-0000-0000-000000000006';

function ok<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> { return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] }; }
interface MockState { runStatus?: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'; currentStepId?: string | null; hasSecondStep?: boolean; }

function makePool(state: MockState = {}): Pool {
  const runStatus = state.runStatus ?? 'pending';
  const currentStepId = state.currentStepId ?? null;
  const hasSecondStep = state.hasSecondStep ?? true;
  const query = vi.fn((sql: string): Promise<QueryResult<Record<string, unknown>>> => {
    let result: QueryResult<Record<string, unknown>>;
    if (sql.includes('FROM workflow_runs') && sql.includes('SELECT id, workflow_id')) {
      result = ok([{ id: RUN_ID, workflow_id: WORKFLOW_ID, status: runStatus, current_step_id: currentStepId, triggered_by: ACTOR, trigger_data: {} }]);
    } else if (sql.includes('FROM workflow_steps') && sql.includes('ORDER BY step_order ASC') && sql.includes('LIMIT 1')) {
      if (sql.includes('step_order >')) result = hasSecondStep ? ok([{ id: STEP_2, name: 'Finish', step_type: 'automation', step_order: 2, next_step_id: null, config: {} }]) : ok([]);
      else result = ok([{ id: STEP_1, name: 'Wait', step_type: 'manual_task', step_order: 1, next_step_id: null, config: {} }]);
    } else if (sql.includes('FROM workflow_steps') && sql.includes('AND id = $3')) {
      const isSecond = sql.includes('AND id = $3') && currentStepId === STEP_2;
      result = ok([{ id: isSecond ? STEP_2 : STEP_1, name: isSecond ? 'Finish' : 'Wait', step_type: isSecond ? 'automation' : 'manual_task', step_order: isSecond ? 2 : 1, next_step_id: null, config: {} }]);
    } else result = ok([]);
    return Promise.resolve(result);
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  return { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
}

function makeJob(jobName: string, extra: Record<string, unknown> = {}): Job {
  return { id: 'job-1', name: jobName, data: { jobName, organizationId: ORG, runId: RUN_ID, correlationId: 'corr-1', actorId: ACTOR, ...extra } } as unknown as Job;
}
async function getClientQuery(pool: Pool): Promise<ReturnType<typeof vi.fn>> {
  const connectMock = pool.connect as ReturnType<typeof vi.fn>;
  const resolvedClient = (await connectMock.mock.results[0]?.value) as PoolClient | undefined;
  if (!resolvedClient) throw new Error('Client was not created');
  return resolvedClient.query as ReturnType<typeof vi.fn>;
}

describe('workflow-execution runtime convergence', () => {
  it('starts the workflow at the first concrete step', async () => {
    const pool = makePool({ runStatus: 'pending' }); await createWorkflowProcessor(pool)(makeJob('start-workflow'));
    const calls = (await getClientQuery(pool)).mock.calls as [string, unknown[]][];
    expect(calls.some(([sql]) => sql.includes("SET status = 'running', current_step_id = $3"))).toBe(true);
    expect(calls.some(([sql]) => sql.includes('INSERT INTO workflow_run_steps'))).toBe(true);
  });

  it('resumes a waiting engine step and advances exactly once', async () => {
    const pool = makePool({ runStatus: 'waiting', currentStepId: STEP_1, hasSecondStep: true });
    await createWorkflowProcessor(pool)(makeJob('resume-step', { completedStepId: STEP_1, outcome: { engine: 'agent', status: 'completed' } }));
    const calls = (await getClientQuery(pool)).mock.calls as [string, unknown[]][];
    expect(calls.some(([sql]) => sql.includes("SET status = 'completed', completed_at = NOW()"))).toBe(true);
    expect(calls.some(([sql]) => sql.includes("UPDATE workflow_runs SET status = 'running'"))).toBe(true);
    expect(calls.some(([, params]) => params?.includes(STEP_2))).toBe(true);
    expect(calls.some(([sql]) => sql.includes('Workflow engine step completed'))).toBe(true);
  });

  it('rejects stale engine completion callbacks', async () => {
    const pool = makePool({ runStatus: 'waiting', currentStepId: STEP_2 });
    await expect(createWorkflowProcessor(pool)(makeJob('resume-step', { completedStepId: STEP_1 }))).rejects.toThrow('is not current step');
  });

  it('completes the workflow when the final step advances', async () => {
    const pool = makePool({ runStatus: 'running', currentStepId: STEP_1, hasSecondStep: false });
    await createWorkflowProcessor(pool)(makeJob('advance-step'));
    const calls = (await getClientQuery(pool)).mock.calls as [string, unknown[]][];
    expect(calls.some(([sql]) => sql.includes("SET status = 'completed', current_step_id = NULL"))).toBe(true);
  });

  it('rejects invalid lifecycle transitions', async () => {
    const pool = makePool({ runStatus: 'completed' });
    await expect(createWorkflowProcessor(pool)(makeJob('start-workflow'))).rejects.toThrow('Invalid workflow transition: completed -> running');
  });

  it('throws for an unrecognised job name', async () => {
    const pool = makePool();
    await expect(createWorkflowProcessor(pool)(makeJob('nonexistent-job'))).rejects.toThrow('Unknown job name');
  });
});
