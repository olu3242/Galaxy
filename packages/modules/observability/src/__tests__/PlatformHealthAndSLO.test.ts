/**
 * Observability OS — PlatformHealthService · SLOService unit tests
 *
 * Covers: checkWorkflowHealth · checkAgentHealth · checkSLAHealth · getHealth ·
 *         createSLO · getSLO · listSLOs · updateCompliance · computeWorkflowSLOCompliance · deleteSLO
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PlatformHealthService } from '../health/PlatformHealthService.js';
import { SLOService } from '../slo/SLOService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const NOW = '2026-01-01T00:00:00.000Z';
const SLO_ID = '00000000-0000-0000-0000-000000000010';

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

function healthRow(component = 'workflow', status = 'healthy') {
  return {
    id: '00000000-0000-0000-0000-000000000020',
    organization_id: ORG,
    component,
    status,
    details: {},
    checked_at: NOW,
  };
}

function sloRow(
  overrides: Partial<{
    current_compliance: string;
    is_breaching: boolean;
  }> = {},
) {
  return {
    id: SLO_ID,
    organization_id: ORG,
    name: 'Workflow Completion SLO',
    description: 'Ensure 95% workflow completion',
    target_percentage: '95',
    window_days: '30',
    current_compliance: overrides.current_compliance ?? '97',
    is_breaching: overrides.is_breaching ?? false,
    created_at: NOW,
    updated_at: NOW,
  };
}

// ─── PlatformHealthService ────────────────────────────────────────────────────

describe('PlatformHealthService.checkWorkflowHealth', () => {
  it('sets tenant context then queries workflow_runs', async () => {
    const pool = makePool([
      ok([]),
      ok([{ run_count: '10', failed_count: '1' }]),
      ok([healthRow('workflow', 'healthy')]),
    ]);
    const svc = new PlatformHealthService(pool);
    await svc.checkWorkflowHealth(ORG);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
    expect((calls[0] as [string, unknown[]])[1]).toContain(ORG);
  });

  it('returns healthy status when failure rate is below 20%', async () => {
    const pool = makePool([
      ok([]),
      ok([{ run_count: '10', failed_count: '1' }]),
      ok([healthRow('workflow', 'healthy')]),
    ]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.checkWorkflowHealth(ORG);
    expect(result.status).toBe('healthy');
    expect(result.component).toBe('workflow');
  });

  it('returns degraded status when failure rate is between 20-50%', async () => {
    const pool = makePool([
      ok([]),
      ok([{ run_count: '10', failed_count: '3' }]),
      ok([healthRow('workflow', 'degraded')]),
    ]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.checkWorkflowHealth(ORG);
    expect(result.status).toBe('degraded');
  });

  it('returns critical status when failure rate exceeds 50%', async () => {
    const pool = makePool([
      ok([]),
      ok([{ run_count: '10', failed_count: '6' }]),
      ok([healthRow('workflow', 'critical')]),
    ]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.checkWorkflowHealth(ORG);
    expect(result.status).toBe('critical');
  });

  it('throws when upsert returns no row', async () => {
    const pool = makePool([ok([]), ok([{ run_count: '5', failed_count: '0' }]), ok([])]);
    const svc = new PlatformHealthService(pool);
    await expect(svc.checkWorkflowHealth(ORG)).rejects.toThrow('Failed to upsert health check');
  });
});

describe('PlatformHealthService.checkAgentHealth', () => {
  it('returns healthy when agent success rate is high', async () => {
    const pool = makePool([
      ok([]),
      ok([{ total: '10', success: '9' }]),
      ok([healthRow('agent', 'healthy')]),
    ]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.checkAgentHealth(ORG);
    expect(result.status).toBe('healthy');
    expect(result.component).toBe('agent');
  });

  it('returns critical when success rate is below 50%', async () => {
    const pool = makePool([
      ok([]),
      ok([{ total: '10', success: '4' }]),
      ok([healthRow('agent', 'critical')]),
    ]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.checkAgentHealth(ORG);
    expect(result.status).toBe('critical');
  });

  it('returns healthy when no agent executions (zero total)', async () => {
    const pool = makePool([
      ok([]),
      ok([{ total: '0', success: '0' }]),
      ok([healthRow('agent', 'healthy')]),
    ]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.checkAgentHealth(ORG);
    expect(result.status).toBe('healthy');
  });
});

describe('PlatformHealthService.checkSLAHealth', () => {
  it('returns healthy when breach rate is low', async () => {
    const pool = makePool([
      ok([]),
      ok([{ total_runs: '20', breached_runs: '1' }]),
      ok([healthRow('sla', 'healthy')]),
    ]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.checkSLAHealth(ORG);
    expect(result.status).toBe('healthy');
    expect(result.component).toBe('sla');
  });

  it('returns critical when breach rate exceeds 30%', async () => {
    const pool = makePool([
      ok([]),
      ok([{ total_runs: '10', breached_runs: '4' }]),
      ok([healthRow('sla', 'critical')]),
    ]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.checkSLAHealth(ORG);
    expect(result.status).toBe('critical');
  });
});

describe('PlatformHealthService.getHealth', () => {
  it('returns all health checks for the org', async () => {
    const pool = makePool([
      ok([]),
      ok([healthRow('workflow', 'healthy'), healthRow('agent', 'degraded')]),
    ]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.getHealth(ORG);
    expect(result).toHaveLength(2);
    expect(result[0]?.component).toBe('workflow');
    expect(result[1]?.component).toBe('agent');
  });

  it('returns empty array when no checks recorded', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PlatformHealthService(pool);
    const result = await svc.getHealth(ORG);
    expect(result).toHaveLength(0);
  });
});

// ─── SLOService ───────────────────────────────────────────────────────────────

describe('SLOService.createSLO', () => {
  it('sets tenant context and returns mapped SLO', async () => {
    const pool = makePool([ok([]), ok([sloRow()])]);
    const svc = new SLOService(pool);
    const result = await svc.createSLO({
      organizationId: ORG,
      name: 'Workflow Completion SLO',
      description: 'Ensure 95% workflow completion',
      targetPercentage: 95,
      windowDays: 30,
    });

    expect(result.id).toBe(SLO_ID);
    expect(result.name).toBe('Workflow Completion SLO');
    expect(result.targetPercentage).toBe(95);
    expect(result.windowDays).toBe(30);
    expect(result.isBreaching).toBe(false);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new SLOService(pool);
    await expect(
      svc.createSLO({
        organizationId: ORG,
        name: 'X',
        description: 'Y',
        targetPercentage: 99,
        windowDays: 7,
      }),
    ).rejects.toThrow('Failed to create SLO');
  });
});

describe('SLOService.getSLO', () => {
  it('returns the SLO when found', async () => {
    const pool = makePool([ok([]), ok([sloRow()])]);
    const svc = new SLOService(pool);
    const result = await svc.getSLO(ORG, SLO_ID);
    expect(result?.id).toBe(SLO_ID);
    expect(result?.currentCompliance).toBe(97);
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new SLOService(pool);
    const result = await svc.getSLO(ORG, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('SLOService.listSLOs', () => {
  it('returns all SLOs for org', async () => {
    const pool = makePool([ok([]), ok([sloRow(), sloRow()])]);
    const svc = new SLOService(pool);
    const result = await svc.listSLOs(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when none exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new SLOService(pool);
    const result = await svc.listSLOs(ORG);
    expect(result).toHaveLength(0);
  });
});

describe('SLOService.updateCompliance', () => {
  it('updates compliance and sets is_breaching based on target', async () => {
    const pool = makePool([ok([]), ok([sloRow({ current_compliance: '92', is_breaching: true })])]);
    const svc = new SLOService(pool);
    const result = await svc.updateCompliance(ORG, SLO_ID, 92);
    expect(result?.currentCompliance).toBe(92);
    expect(result?.isBreaching).toBe(true);
  });

  it('returns null when SLO not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new SLOService(pool);
    const result = await svc.updateCompliance(ORG, 'ghost', 95);
    expect(result).toBeNull();
  });
});

describe('SLOService.computeWorkflowSLOCompliance', () => {
  it('returns null when SLO not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new SLOService(pool);
    const result = await svc.computeWorkflowSLOCompliance(ORG, 'bad-id');
    expect(result).toBeNull();
  });

  it('computes compliance from workflow_runs and updates SLO', async () => {
    // set_config, SELECT slo, SELECT compliance, set_config (updateCompliance), UPDATE
    const pool = makePool([
      ok([]),
      ok([sloRow()]),
      ok([{ compliance: '97.5' }]),
      ok([]),
      ok([sloRow({ current_compliance: '97.5' })]),
    ]);
    const svc = new SLOService(pool);
    const result = await svc.computeWorkflowSLOCompliance(ORG, SLO_ID);
    expect(result?.currentCompliance).toBe(97.5);
  });
});

describe('SLOService.deleteSLO', () => {
  it('returns true when a row is deleted', async () => {
    const deleteResult: QueryResult = {
      rows: [],
      rowCount: 1,
      command: 'DELETE',
      oid: 0,
      fields: [],
    };
    const pool = makePool([ok([]), deleteResult]);
    const svc = new SLOService(pool);
    const result = await svc.deleteSLO(ORG, SLO_ID);
    expect(result).toBe(true);
  });

  it('returns false when no row matched', async () => {
    const deleteResult: QueryResult = {
      rows: [],
      rowCount: 0,
      command: 'DELETE',
      oid: 0,
      fields: [],
    };
    const pool = makePool([ok([]), deleteResult]);
    const svc = new SLOService(pool);
    const result = await svc.deleteSLO(ORG, 'ghost');
    expect(result).toBe(false);
  });
});
