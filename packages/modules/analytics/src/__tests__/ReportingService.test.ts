import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ReportingService } from '../services/ReportingService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const REPORT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000020';

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

function reportRow(overrides: Partial<{ category: string; template_id: string | null }> = {}) {
  return {
    id: REPORT_ID,
    organization_id: ORG,
    template_id: overrides.template_id ?? null,
    name: 'Monthly Operations Report',
    category: overrides.category ?? 'operations',
    status: 'ready',
    data: {},
    generated_by: USER_ID,
    generated_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('ReportingService.generateReport', () => {
  it('sets tenant context before insert', async () => {
    const pool = makePool([ok([]), ok([reportRow()])]);
    const svc = new ReportingService(pool);
    await svc.generateReport({
      organizationId: ORG,
      name: 'Monthly Operations Report',
      category: 'operations',
      generatedBy: USER_ID,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns mapped Report domain object', async () => {
    const pool = makePool([ok([]), ok([reportRow()])]);
    const svc = new ReportingService(pool);
    const result = await svc.generateReport({
      organizationId: ORG,
      name: 'Monthly Operations Report',
      category: 'operations',
      generatedBy: USER_ID,
    });
    expect(result.id).toBe(REPORT_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.status).toBe('ready');
    expect(result.category).toBe('operations');
    expect(result.generatedBy).toBe(USER_ID);
    expect(result.templateId).toBeNull();
  });

  it('passes templateId when provided', async () => {
    const TEMPLATE_ID = '00000000-0000-0000-0000-000000000099';
    const pool = makePool([ok([]), ok([reportRow({ template_id: TEMPLATE_ID })])]);
    const svc = new ReportingService(pool);
    const result = await svc.generateReport({
      organizationId: ORG,
      name: 'X',
      category: 'executive',
      generatedBy: USER_ID,
      templateId: TEMPLATE_ID,
    });
    expect(result.templateId).toBe(TEMPLATE_ID);
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ReportingService(pool);
    await expect(
      svc.generateReport({
        organizationId: ORG,
        name: 'X',
        category: 'operations',
        generatedBy: USER_ID,
      }),
    ).rejects.toThrow('INSERT RETURNING returned no row');
  });

  it('uses parameterized query — no orgId interpolation', async () => {
    const pool = makePool([ok([]), ok([reportRow()])]);
    const svc = new ReportingService(pool);
    await svc.generateReport({
      organizationId: ORG,
      name: 'X',
      category: 'operations',
      generatedBy: USER_ID,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    for (const [sql] of calls) {
      expect(sql).not.toContain(ORG);
    }
  });
});

describe('ReportingService.getReports', () => {
  it('returns all reports for org', async () => {
    const rows = [reportRow(), { ...reportRow(), id: '00000000-0000-0000-0000-000000000099' }];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new ReportingService(pool);
    const result = await svc.getReports(ORG);
    expect(result).toHaveLength(2);
    expect(result[0]?.organizationId).toBe(ORG);
  });

  it('returns empty array when no reports', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ReportingService(pool);
    const result = await svc.getReports(ORG);
    expect(result).toEqual([]);
  });

  it('includes category filter param when provided', async () => {
    const pool = makePool([ok([]), ok([reportRow({ category: 'compliance' })])]);
    const svc = new ReportingService(pool);
    await svc.getReports(ORG, 'compliance');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain('compliance');
  });
});

describe('ReportingService.getReportTemplates', () => {
  it('returns templates for org', async () => {
    const templateRow = {
      id: '00000000-0000-0000-0000-000000000030',
      organization_id: ORG,
      name: 'Weekly Summary',
      description: 'Summarizes weekly activity',
      category: 'operations',
      config: {},
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const pool = makePool([ok([]), ok([templateRow])]);
    const svc = new ReportingService(pool);
    const result = await svc.getReportTemplates(ORG);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Weekly Summary');
    expect(result[0]?.organizationId).toBe(ORG);
  });

  it('returns empty array when no templates', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ReportingService(pool);
    const result = await svc.getReportTemplates(ORG);
    expect(result).toEqual([]);
  });
});
