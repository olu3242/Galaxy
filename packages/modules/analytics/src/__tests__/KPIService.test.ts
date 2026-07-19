import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { KPIService } from '../services/KPIService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const KPI_ID = '00000000-0000-0000-0000-000000000010';
const OWNER_ID = '00000000-0000-0000-0000-000000000020';

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

function kpiRow(overrides: Partial<{ status: string; current_value: string }> = {}) {
  return {
    id: KPI_ID,
    organization_id: ORG,
    name: 'Workflow Completion Rate',
    description: 'Percentage of workflows completed on time',
    metric_name: 'workflow.completion_rate',
    target_value: '95',
    current_value: overrides.current_value ?? '0',
    unit: 'percent',
    period: 'monthly',
    status: overrides.status ?? 'not_set',
    owner_id: OWNER_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('KPIService.setKPI', () => {
  it('sets tenant context before upsert', async () => {
    const pool = makePool([ok([]), ok([kpiRow()])]);
    const svc = new KPIService(pool);
    await svc.setKPI({
      organizationId: ORG,
      name: 'Workflow Completion Rate',
      metricName: 'workflow.completion_rate',
      targetValue: 95,
      unit: 'percent',
      period: 'monthly',
      ownerId: OWNER_ID,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns mapped KPI with numeric values', async () => {
    const pool = makePool([ok([]), ok([kpiRow()])]);
    const svc = new KPIService(pool);
    const result = await svc.setKPI({
      organizationId: ORG,
      name: 'Workflow Completion Rate',
      metricName: 'workflow.completion_rate',
      targetValue: 95,
      unit: 'percent',
      period: 'monthly',
      ownerId: OWNER_ID,
    });
    expect(result.id).toBe(KPI_ID);
    expect(result.targetValue).toBe(95);
    expect(result.currentValue).toBe(0);
    expect(result.status).toBe('not_set');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KPIService(pool);
    await expect(
      svc.setKPI({
        organizationId: ORG,
        name: 'X',
        metricName: 'x',
        targetValue: 100,
        unit: 'count',
        period: 'daily',
        ownerId: OWNER_ID,
      }),
    ).rejects.toThrow('INSERT RETURNING returned no row');
  });

  it('uses parameterized query — no orgId interpolation', async () => {
    const pool = makePool([ok([]), ok([kpiRow()])]);
    const svc = new KPIService(pool);
    await svc.setKPI({
      organizationId: ORG,
      name: 'X',
      metricName: 'x',
      targetValue: 100,
      unit: 'count',
      period: 'daily',
      ownerId: OWNER_ID,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    for (const [sql] of calls) {
      expect(sql).not.toContain(ORG);
    }
  });
});

describe('KPIService.getKPIs', () => {
  it('returns all KPIs for org', async () => {
    const rows = [kpiRow(), { ...kpiRow(), id: '00000000-0000-0000-0000-000000000099' }];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new KPIService(pool);
    const result = await svc.getKPIs(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no KPIs', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KPIService(pool);
    const result = await svc.getKPIs(ORG);
    expect(result).toEqual([]);
  });
});

describe('KPIService.evaluateKPI', () => {
  it('sets status on_track when ratio >= 0.95', async () => {
    // calls: set_config · SELECT kpi · UPDATE RETURNING
    const updated = kpiRow({ current_value: '90', status: 'on_track' });
    const pool = makePool([ok([]), ok([kpiRow()]), ok([updated])]);
    const svc = new KPIService(pool);
    const result = await svc.evaluateKPI(ORG, KPI_ID, 90.25); // 90.25/95 ≈ 0.95
    expect(result.status).toBe('on_track');
    expect(result.currentValue).toBe(90);
  });

  it('sets status at_risk when ratio between 0.75 and 0.95', async () => {
    const updated = kpiRow({ current_value: '80', status: 'at_risk' });
    const pool = makePool([ok([]), ok([kpiRow()]), ok([updated])]);
    const svc = new KPIService(pool);
    const result = await svc.evaluateKPI(ORG, KPI_ID, 80);
    expect(result.status).toBe('at_risk');
  });

  it('sets status off_track when ratio < 0.75', async () => {
    const updated = kpiRow({ current_value: '50', status: 'off_track' });
    const pool = makePool([ok([]), ok([kpiRow()]), ok([updated])]);
    const svc = new KPIService(pool);
    const result = await svc.evaluateKPI(ORG, KPI_ID, 50);
    expect(result.status).toBe('off_track');
  });

  it('throws when KPI not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KPIService(pool);
    await expect(svc.evaluateKPI(ORG, 'nonexistent', 90)).rejects.toThrow('not found');
  });
});
