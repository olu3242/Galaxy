/**
 * ExecutionTelemetryService unit tests
 *
 * All DB calls are mocked — no real database required.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ExecutionTelemetryService } from '../ExecutionTelemetryService.js';
import type { ExecutionTelemetryEntry } from '../ExecutionTelemetryService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const DEF_ID = 'def-001';

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

function makeEntry(overrides: Partial<ExecutionTelemetryEntry> = {}): Omit<ExecutionTelemetryEntry, 'id' | 'recordedAt'> {
  return {
    organizationId: ORG,
    workflowRunId: 'run-001',
    workflowDefinitionId: DEF_ID,
    correlationId: 'corr-001',
    durationMs: 5000,
    stepCount: 4,
    completedSteps: 4,
    failedSteps: 0,
    agentTypes: ['operations_copilot'],
    approvalWaitMs: 1000,
    retryCount: 0,
    outcome: 'completed',
    bottlenecks: [],
    errorMessages: [],
    costTokens: 200,
    ...overrides,
  };
}

// ─── record ─────────────────────────────────────────────────────────────────

describe('ExecutionTelemetryService.record', () => {
  it('sets tenant context then inserts the entry', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ExecutionTelemetryService(pool);
    await svc.record(makeEntry());

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]?.[1]).toBe(ORG);
    expect(calls[1]?.[0]).toContain('INSERT INTO execution_telemetry');
  });

  it('passes all 15 parameters to INSERT', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ExecutionTelemetryService(pool);
    const entry = makeEntry({ bottlenecks: ['step-2'], errorMessages: ['timeout'] });
    await svc.record(entry);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toHaveLength(15);
    expect(params[11]).toBe('completed');
    expect(params[12]).toEqual(['step-2']);
    expect(params[13]).toEqual(['timeout']);
  });
});

// ─── getWorkflowStats ────────────────────────────────────────────────────────

describe('ExecutionTelemetryService.getWorkflowStats', () => {
  it('returns zeroed stats when no rows exist', async () => {
    const pool = makePool([ok([]), ok([null as unknown as object]), ok([])]);
    const svc = new ExecutionTelemetryService(pool);
    const stats = await svc.getWorkflowStats(ORG, DEF_ID, 7);
    expect(stats).toMatchObject({
      avgDurationMs: 0,
      p50DurationMs: 0,
      p95DurationMs: 0,
      successRate: 0,
      totalRuns: 0,
      commonBottlenecks: [],
    });
  });

  it('maps stats row to WorkflowStats correctly', async () => {
    const statsRow = {
      avg_duration_ms: '4500',
      p50_duration_ms: '4000',
      p95_duration_ms: '9000',
      success_rate: '0.85',
      total_runs: '20',
    };
    const bottleneckRow = { bottleneck: 'approval-step', frequency: '10' };
    // set_config, stats query, bottleneck query
    const pool = makePool([ok([]), ok([statsRow]), ok([bottleneckRow])]);
    const svc = new ExecutionTelemetryService(pool);
    const stats = await svc.getWorkflowStats(ORG, DEF_ID, 30);
    expect(stats).toMatchObject({
      avgDurationMs: 4500,
      p50DurationMs: 4000,
      p95DurationMs: 9000,
      successRate: 0.85,
      totalRuns: 20,
      commonBottlenecks: ['approval-step'],
    });
  });

  it('passes the days parameter to the query', async () => {
    const pool = makePool([ok([]), ok([]), ok([])]);
    const svc = new ExecutionTelemetryService(pool);
    await svc.getWorkflowStats(ORG, DEF_ID, 14);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    // Second call (index 1) is the stats query — third param is days
    expect(calls[1]?.[1]?.[2]).toBe(14);
  });
});

// ─── detectBottlenecks ───────────────────────────────────────────────────────

describe('ExecutionTelemetryService.detectBottlenecks', () => {
  it('returns empty array when no bottlenecks recorded', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ExecutionTelemetryService(pool);
    const result = await svc.detectBottlenecks(ORG, DEF_ID);
    expect(result).toEqual([]);
  });

  it('returns bottleneck step names in frequency order', async () => {
    const rows = [
      { bottleneck: 'send-notification', frequency: '8' },
      { bottleneck: 'manager-approval', frequency: '5' },
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new ExecutionTelemetryService(pool);
    const result = await svc.detectBottlenecks(ORG, DEF_ID);
    expect(result).toEqual(['send-notification', 'manager-approval']);
  });
});

// ─── getOrgHealthScore ───────────────────────────────────────────────────────

describe('ExecutionTelemetryService.getOrgHealthScore', () => {
  it('returns 100 when no recent executions', async () => {
    const pool = makePool([ok([]), ok([{ success_rate: null }])]);
    const svc = new ExecutionTelemetryService(pool);
    const score = await svc.getOrgHealthScore(ORG);
    expect(score).toBe(100);
  });

  it('converts success rate to 0-100 score', async () => {
    const pool = makePool([ok([]), ok([{ success_rate: '0.76' }])]);
    const svc = new ExecutionTelemetryService(pool);
    const score = await svc.getOrgHealthScore(ORG);
    expect(score).toBe(76);
  });

  it('rounds the score', async () => {
    const pool = makePool([ok([]), ok([{ success_rate: '0.937' }])]);
    const svc = new ExecutionTelemetryService(pool);
    const score = await svc.getOrgHealthScore(ORG);
    expect(score).toBe(94);
  });
});
