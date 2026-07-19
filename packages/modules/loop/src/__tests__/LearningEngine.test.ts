/**
 * LearningEngine unit tests
 *
 * All dependencies are mocked — no real database required.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { LearningEngine } from '../LearningEngine.js';
import type { SharedOrgMemory } from '../LearningEngine.js';
import { ExecutionTelemetryService } from '../ExecutionTelemetryService.js';
import type { ExecutionTelemetryEntry } from '../ExecutionTelemetryService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const DEF_ID = 'def-001';
const RUN_ID = 'run-001';

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

function makeOrgMemory(): SharedOrgMemory {
  return {
    store: vi.fn().mockResolvedValue({ id: 'mem-001' }),
  };
}

function makeEntry(overrides: Partial<ExecutionTelemetryEntry> = {}): ExecutionTelemetryEntry {
  return {
    id: 'entry-001',
    organizationId: ORG,
    workflowRunId: RUN_ID,
    workflowDefinitionId: DEF_ID,
    correlationId: 'corr-001',
    durationMs: 10_000,
    stepCount: 5,
    completedSteps: 5,
    failedSteps: 0,
    agentTypes: ['operations_copilot'],
    approvalWaitMs: 1_000,
    retryCount: 0,
    outcome: 'completed',
    bottlenecks: [],
    errorMessages: [],
    costTokens: 100,
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── processExecution — happy path ──────────────────────────────────────────

describe('LearningEngine.processExecution', () => {
  it('returns a LearningEvent with a UUID id', async () => {
    const telemetry = new ExecutionTelemetryService(makePool([ok([]), ok([])]));
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const event = await engine.processExecution(makeEntry());
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(event.workflowRunId).toBe(RUN_ID);
  });

  it('returns empty lessons and zero improvementScore for a clean completed run', async () => {
    const pool = makePool([]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const event = await engine.processExecution(makeEntry());
    expect(event.lessons).toHaveLength(0);
    expect(event.recommendations).toHaveLength(0);
    expect(event.improvementScore).toBe(0);
  });

  it('generates a failure lesson when outcome is "failed"', async () => {
    const pool = makePool([]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const event = await engine.processExecution(
      makeEntry({ outcome: 'failed', errorMessages: ['DB timeout'] }),
    );
    expect(event.lessons.some((l) => l.includes('failed'))).toBe(true);
    expect(event.improvementScore).toBeGreaterThan(0);
  });

  it('generates a parallelize recommendation when bottlenecks exist', async () => {
    const pool = makePool([]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const event = await engine.processExecution(
      makeEntry({ bottlenecks: ['step-2', 'step-4'] }),
    );
    const rec = event.recommendations.find((r) => r.type === 'parallelize');
    expect(rec).toBeDefined();
    expect(rec?.estimatedSavingMs).toBeGreaterThan(0);
  });

  it('generates a reduce_approval_chain recommendation when approval wait > 50% of duration', async () => {
    const pool = makePool([]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const event = await engine.processExecution(
      makeEntry({ durationMs: 10_000, approvalWaitMs: 6_000 }),
    );
    const rec = event.recommendations.find((r) => r.type === 'reduce_approval_chain');
    expect(rec).toBeDefined();
  });

  it('does NOT recommend reduce_approval_chain when wait is under threshold', async () => {
    const pool = makePool([]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const event = await engine.processExecution(
      makeEntry({ durationMs: 10_000, approvalWaitMs: 2_000 }),
    );
    const rec = event.recommendations.find((r) => r.type === 'reduce_approval_chain');
    expect(rec).toBeUndefined();
  });

  it('generates an add_cache recommendation when retry count > 2', async () => {
    const pool = makePool([]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const event = await engine.processExecution(makeEntry({ retryCount: 3 }));
    const rec = event.recommendations.find((r) => r.type === 'add_cache');
    expect(rec).toBeDefined();
  });

  it('generates a remove_step recommendation when failedSteps/stepCount > 0.3', async () => {
    const pool = makePool([]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const event = await engine.processExecution(
      makeEntry({ stepCount: 5, failedSteps: 2 }),
    );
    const rec = event.recommendations.find((r) => r.type === 'remove_step');
    expect(rec).toBeDefined();
  });

  it('stores each lesson in org memory with type "lesson"', async () => {
    const pool = makePool([]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    await engine.processExecution(
      makeEntry({ outcome: 'failed', errorMessages: ['err1'] }),
    );
    expect(memory.store).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ memoryType: 'lesson' }),
    );
  });

  it('caps improvementScore at 100', async () => {
    const pool = makePool([]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const event = await engine.processExecution(
      makeEntry({
        outcome: 'failed',
        bottlenecks: ['a', 'b', 'c', 'd', 'e', 'f'],
        approvalWaitMs: 9_000,
        durationMs: 10_000,
        retryCount: 10,
      }),
    );
    expect(event.improvementScore).toBeLessThanOrEqual(100);
  });
});

// ─── generateWorkflowOptimizations ──────────────────────────────────────────

describe('LearningEngine.generateWorkflowOptimizations', () => {
  it('returns empty array when no significant issues detected', async () => {
    const statsRow = {
      avg_duration_ms: '1000',
      p50_duration_ms: '900',
      p95_duration_ms: '1100',
      success_rate: '0.95',
      total_runs: '10',
    };
    // set_config (getWorkflowStats), stats, bottleneck-in-stats, set_config (detectBottlenecks), bottlenecks
    const pool = makePool([ok([]), ok([statsRow]), ok([]), ok([]), ok([])]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const suggestions = await engine.generateWorkflowOptimizations(ORG, DEF_ID);
    expect(suggestions).toHaveLength(0);
  });

  it('suggests parallelize when bottlenecks exist', async () => {
    const statsRow = {
      avg_duration_ms: '5000',
      p50_duration_ms: '4000',
      p95_duration_ms: '9000',
      success_rate: '0.9',
      total_runs: '15',
    };
    const bottleneckRow = { bottleneck: 'approval-step', frequency: '8' };
    // set_config (getWorkflowStats), stats, bottleneck-in-stats,
    // set_config (detectBottlenecks), bottleneck-in-detectBottlenecks
    const pool = makePool([
      ok([]),
      ok([statsRow]),
      ok([bottleneckRow]),
      ok([]),
      ok([bottleneckRow]),
    ]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const suggestions = await engine.generateWorkflowOptimizations(ORG, DEF_ID);
    expect(suggestions.some((s) => s.type === 'parallelize')).toBe(true);
  });

  it('suggests remove_step when success rate < 0.8 and enough runs', async () => {
    const statsRow = {
      avg_duration_ms: '5000',
      p50_duration_ms: '4500',
      p95_duration_ms: '6000',
      success_rate: '0.6',
      total_runs: '10',
    };
    const pool = makePool([ok([]), ok([statsRow]), ok([]), ok([]), ok([])]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const suggestions = await engine.generateWorkflowOptimizations(ORG, DEF_ID);
    expect(suggestions.some((s) => s.type === 'remove_step')).toBe(true);
  });

  it('suggests add_cache when p95 > 3x p50', async () => {
    const statsRow = {
      avg_duration_ms: '4000',
      p50_duration_ms: '2000',
      p95_duration_ms: '7000',
      success_rate: '0.9',
      total_runs: '10',
    };
    const pool = makePool([ok([]), ok([statsRow]), ok([]), ok([]), ok([])]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const suggestions = await engine.generateWorkflowOptimizations(ORG, DEF_ID);
    expect(suggestions.some((s) => s.type === 'add_cache')).toBe(true);
  });

  it('all suggestions have a positive estimatedSavingMs', async () => {
    const statsRow = {
      avg_duration_ms: '5000',
      p50_duration_ms: '2000',
      p95_duration_ms: '8000',
      success_rate: '0.5',
      total_runs: '20',
    };
    const bottleneckRow = { bottleneck: 'db-lookup', frequency: '15' };
    const pool = makePool([
      ok([]),
      ok([statsRow]),
      ok([bottleneckRow]),
      ok([]),
      ok([bottleneckRow]),
    ]);
    const telemetry = new ExecutionTelemetryService(pool);
    const memory = makeOrgMemory();
    const engine = new LearningEngine(telemetry, memory);
    const suggestions = await engine.generateWorkflowOptimizations(ORG, DEF_ID);
    for (const s of suggestions) {
      expect(s.estimatedSavingMs).toBeGreaterThanOrEqual(0);
    }
  });
});
