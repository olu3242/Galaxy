import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { AgentLifecycleManager } from '../lifecycle/AgentLifecycleManager.js';
import type { LifecyclePhase } from '../lifecycle/AgentLifecycleManager.js';

function makeMockPool(): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  } as unknown as Pool;
}

describe('AgentLifecycleManager', () => {
  let pool: Pool;
  let manager: AgentLifecycleManager;

  beforeEach(() => {
    pool = makeMockPool();
    manager = new AgentLifecycleManager(pool);
  });

  it('runs all 11 phases in order and returns a completed trace', async () => {
    const executedPhases: LifecyclePhase[] = [];

    const trace = await manager.run({
      executionId: 'exec-001',
      agentType: 'alice',
      organizationId: 'org-001',
      correlationId: 'corr-001',
      input: { query: 'status report' },
      handlers: {
        OBSERVE: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve({ observations: 'context loaded' });
        },
        UNDERSTAND: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve({ intent: 'status_query' });
        },
        RETRIEVE_CONTEXT: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve({ workflows: 5, approvals: 2 });
        },
        REASON: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve({ reasoning: 'all clear' });
        },
        PLAN: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve({ steps: ['query_db', 'format_response'] });
        },
        DELEGATE: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve(null);
        },
        EXECUTE: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve({ result: 'success' });
        },
        VERIFY: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve({ verified: true });
        },
        LEARN: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve({ learningId: 'learn-001' });
        },
        OPTIMIZE: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve(null);
        },
        REPORT: (ctx) => {
          executedPhases.push(ctx.currentPhase);
          return Promise.resolve({ summary: 'All systems operational' });
        },
      },
    });

    const expectedOrder: LifecyclePhase[] = [
      'OBSERVE',
      'UNDERSTAND',
      'RETRIEVE_CONTEXT',
      'REASON',
      'PLAN',
      'DELEGATE',
      'EXECUTE',
      'VERIFY',
      'LEARN',
      'OPTIMIZE',
      'REPORT',
    ];

    expect(executedPhases).toEqual(expectedOrder);
    expect(trace.outcome).toBe('completed');
    expect(trace.phases).toHaveLength(11);
    expect(trace.executionId).toBe('exec-001');
    expect(trace.agentType).toBe('alice');
    expect(trace.organizationId).toBe('org-001');
    expect(trace.correlationId).toBe('corr-001');
    expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('records phase entry and exit timestamps', async () => {
    const trace = await manager.run({
      executionId: 'exec-002',
      agentType: 'max',
      organizationId: 'org-001',
      correlationId: 'corr-002',
      input: {},
      handlers: {
        EXECUTE: () => Promise.resolve({ done: true }),
      },
    });

    for (const phase of trace.phases) {
      expect(phase.enteredAt).toBeDefined();
      expect(phase.exitedAt).toBeDefined();
      expect(phase.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('stores handler results in phaseResults for downstream phases', async () => {
    let capturedResults: Partial<Record<LifecyclePhase, unknown>> | undefined;

    await manager.run({
      executionId: 'exec-003',
      agentType: 'finn',
      organizationId: 'org-001',
      correlationId: 'corr-003',
      input: { amount: 5000 },
      handlers: {
        OBSERVE: () => Promise.resolve({ risk: 'low' }),
        REASON: (ctx) => {
          capturedResults = ctx.phaseResults;
          return Promise.resolve({ decision: 'proceed' });
        },
      },
    });

    expect(capturedResults).toBeDefined();
    expect(capturedResults?.OBSERVE).toEqual({ risk: 'low' });
  });

  it('marks trace as failed and persists on handler error', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const failPool = { query: queryMock } as unknown as Pool;
    const failManager = new AgentLifecycleManager(failPool);

    await expect(
      failManager.run({
        executionId: 'exec-004',
        agentType: 'sage',
        organizationId: 'org-001',
        correlationId: 'corr-004',
        input: {},
        handlers: {
          EXECUTE: () => {
            throw new Error('execution failed');
          },
        },
      }),
    ).rejects.toThrow('execution failed');

    // persistTrace should have been called (at least 2 queries: set_config + insert)
    expect(queryMock).toHaveBeenCalled();
    const insertCall = queryMock.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('agent_lifecycle_traces'),
    );
    expect(insertCall).toBeDefined();
  });

  it('runs phases without handlers (no-op)', async () => {
    const trace = await manager.run({
      executionId: 'exec-005',
      agentType: 'nova',
      organizationId: 'org-001',
      correlationId: 'corr-005',
      input: {},
      handlers: {},
    });

    expect(trace.outcome).toBe('completed');
    expect(trace.phases).toHaveLength(11);
    // All phase results should be undefined (no handler)
    for (const phase of trace.phases) {
      expect(phase.result).toBeUndefined();
    }
  });

  it('persists trace with correct SQL parameters', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const trackPool = { query: queryMock } as unknown as Pool;
    const trackManager = new AgentLifecycleManager(trackPool);

    await trackManager.run({
      executionId: 'exec-006',
      agentType: 'guardian',
      organizationId: 'org-999',
      correlationId: 'corr-006',
      input: {},
      handlers: {},
    });

    // Find the INSERT call
    const insertCall = queryMock.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO agent_lifecycle_traces'),
    );

    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] as unknown[];
    expect(params[0]).toBe('org-999'); // organization_id
    expect(params[1]).toBe('exec-006'); // execution_id
    expect(params[2]).toBe('guardian'); // agent_type
    expect(params[3]).toBe('corr-006'); // correlation_id
    expect(params[6]).toBe('completed'); // outcome
  });
});
