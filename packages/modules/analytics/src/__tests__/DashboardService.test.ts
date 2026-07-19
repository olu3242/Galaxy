import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { DashboardService } from '../services/DashboardService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const WIDGET_ID = '00000000-0000-0000-0000-000000000010';

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

function widgetRow(overrides: Partial<{ category: string; type: string }> = {}) {
  return {
    id: WIDGET_ID,
    organization_id: ORG,
    category: overrides.category ?? 'executive',
    name: 'Workflow Velocity',
    type: overrides.type ?? 'chart',
    config: {},
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('DashboardService.createWidget', () => {
  it('sets tenant context before insert', async () => {
    const pool = makePool([ok([]), ok([widgetRow()])]);
    const svc = new DashboardService(pool);
    await svc.createWidget({
      organizationId: ORG,
      category: 'executive',
      name: 'Workflow Velocity',
      type: 'chart',
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns mapped DashboardWidget on success', async () => {
    const pool = makePool([ok([]), ok([widgetRow({ category: 'operations', type: 'metric' })])]);
    const svc = new DashboardService(pool);
    const result = await svc.createWidget({
      organizationId: ORG,
      category: 'operations',
      name: 'Workflow Velocity',
      type: 'metric',
    });
    expect(result.id).toBe(WIDGET_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.category).toBe('operations');
    expect(result.type).toBe('metric');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new DashboardService(pool);
    await expect(
      svc.createWidget({ organizationId: ORG, category: 'executive', name: 'X', type: 'chart' }),
    ).rejects.toThrow('INSERT RETURNING returned no row');
  });

  it('throws on invalid category', async () => {
    const pool = makePool([ok([]), ok([widgetRow()])]);
    const svc = new DashboardService(pool);
    await expect(
      svc.createWidget({
        organizationId: ORG,
        category: 'invalid-cat' as 'executive',
        name: 'X',
        type: 'chart',
      }),
    ).rejects.toThrow();
  });

  it('uses parameterized query — no orgId string interpolation', async () => {
    const pool = makePool([ok([]), ok([widgetRow()])]);
    const svc = new DashboardService(pool);
    await svc.createWidget({
      organizationId: ORG,
      category: 'executive',
      name: 'X',
      type: 'chart',
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    for (const [sql] of calls) {
      expect(sql).not.toContain(ORG);
    }
  });
});

describe('DashboardService.getWidgets', () => {
  it('sets tenant context before select', async () => {
    const pool = makePool([ok([]), ok([widgetRow()])]);
    const svc = new DashboardService(pool);
    await svc.getWidgets(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('returns all widgets when no category filter', async () => {
    const rows = [widgetRow({ category: 'executive' }), widgetRow({ category: 'operations' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new DashboardService(pool);
    const result = await svc.getWidgets(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no widgets', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new DashboardService(pool);
    const result = await svc.getWidgets(ORG);
    expect(result).toEqual([]);
  });

  it('includes category param when filter provided', async () => {
    const pool = makePool([ok([]), ok([widgetRow({ category: 'executive' })])]);
    const svc = new DashboardService(pool);
    await svc.getWidgets(ORG, 'executive');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const selectParams = calls[1]?.[1] ?? [];
    expect(selectParams).toContain('executive');
  });
});

describe('DashboardService.getDashboard', () => {
  it('returns dashboard with category and widgets', async () => {
    const rows = [widgetRow({ category: 'executive' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new DashboardService(pool);
    const result = await svc.getDashboard(ORG, 'executive');
    expect(result.category).toBe('executive');
    expect(result.organizationId).toBe(ORG);
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0]?.id).toBe(WIDGET_ID);
  });

  it('returns empty widgets array when none exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new DashboardService(pool);
    const result = await svc.getDashboard(ORG, 'operations');
    expect(result.widgets).toEqual([]);
  });
});
