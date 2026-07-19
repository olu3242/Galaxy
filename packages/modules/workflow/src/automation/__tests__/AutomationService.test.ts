import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AutomationService } from '../AutomationService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const AUTO_ID = '00000000-0000-0000-0000-000000000010';
const EXEC_ID = '00000000-0000-0000-0000-000000000020';
const CORR_ID = '00000000-0000-0000-0000-000000000099';

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

function automationRow(
  overrides: Partial<{
    trigger_event: string;
    trigger_conditions: Record<string, unknown> | Record<string, unknown>[];
    is_active: boolean;
  }> = {},
) {
  return {
    id: AUTO_ID,
    organization_id: ORG,
    name: 'Welcome Message',
    trigger_event: overrides.trigger_event ?? 'member.created',
    trigger_conditions: overrides.trigger_conditions ?? {},
    actions: [],
    is_active: overrides.is_active ?? true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function executionRow() {
  return {
    id: EXEC_ID,
    automation_id: AUTO_ID,
    organization_id: ORG,
    status: 'completed',
    event_data: {},
    correlation_id: CORR_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('AutomationService.evaluateTriggers', () => {
  it('returns matched true for automation with no conditions', async () => {
    const pool = makePool([ok([]), ok([automationRow()])]);
    const svc = new AutomationService(pool);
    const result = await svc.evaluateTriggers(ORG, 'member.created', { memberId: 'abc' });
    expect(result).toHaveLength(1);
    expect(result[0]?.automationId).toBe(AUTO_ID);
    expect(result[0]?.matched).toBe(true);
  });

  it('returns empty array when no automations match event', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AutomationService(pool);
    const result = await svc.evaluateTriggers(ORG, 'unknown.event', {});
    expect(result).toEqual([]);
  });

  it('evaluates equals condition correctly — matched', async () => {
    const conditions = [{ field: 'status', operator: 'equals', value: 'active' }];
    const pool = makePool([ok([]), ok([automationRow({ trigger_conditions: conditions })])]);
    const svc = new AutomationService(pool);
    const result = await svc.evaluateTriggers(ORG, 'member.created', { status: 'active' });
    expect(result[0]?.matched).toBe(true);
  });

  it('evaluates equals condition correctly — not matched', async () => {
    const conditions = [{ field: 'status', operator: 'equals', value: 'active' }];
    const pool = makePool([ok([]), ok([automationRow({ trigger_conditions: conditions })])]);
    const svc = new AutomationService(pool);
    const result = await svc.evaluateTriggers(ORG, 'member.created', { status: 'inactive' });
    expect(result[0]?.matched).toBe(false);
  });

  it('sets tenant context before querying', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AutomationService(pool);
    await svc.evaluateTriggers(ORG, 'member.created', {});
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });
});

describe('AutomationService.executeAutomation', () => {
  it('returns executionId and status completed', async () => {
    // setTenantContext + fetch automation + setTenantContext + create execution + setTenantContext + complete execution
    const pool = makePool([
      ok([]),
      ok([automationRow()]),
      ok([]),
      ok([executionRow()]),
      ok([]),
      ok([{ ...executionRow(), status: 'completed' }]),
    ]);
    const svc = new AutomationService(pool);
    const result = await svc.executeAutomation(ORG, AUTO_ID, {}, CORR_ID);
    expect(result.status).toBe('completed');
    expect(typeof result.executionId).toBe('string');
  });

  it('throws when automation not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AutomationService(pool);
    await expect(svc.executeAutomation(ORG, 'nonexistent', {}, CORR_ID)).rejects.toThrow();
  });
});

describe('AutomationService.listAutomations', () => {
  it('returns all automations for org', async () => {
    const rows = [
      automationRow(),
      { ...automationRow(), id: '00000000-0000-0000-0000-000000000099' },
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new AutomationService(pool);
    const result = await svc.listAutomations(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no automations', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AutomationService(pool);
    const result = await svc.listAutomations(ORG);
    expect(result).toEqual([]);
  });

  it('passes isActive filter when provided', async () => {
    const pool = makePool([ok([]), ok([automationRow()])]);
    const svc = new AutomationService(pool);
    await svc.listAutomations(ORG, { isActive: true });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain(true);
  });
});
