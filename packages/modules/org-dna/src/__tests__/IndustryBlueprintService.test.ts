import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { IndustryBlueprintService } from '../blueprints/IndustryBlueprintService.js';

const ORG = '00000000-0000-0000-0000-000000000001';

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

const makeBlueprintRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'bp-1',
  industry: 'fintech',
  name: 'Fintech Blueprint',
  description: 'Standard fintech setup',
  default_workflows: { approval: true },
  default_roles: { cfo: true },
  default_policies: { kyc: true },
  created_at: new Date('2024-01-01'),
  ...overrides,
});

const makeDNARow = (overrides: Record<string, unknown> = {}) => ({
  id: 'dna-1',
  organization_id: ORG,
  identity_profile: {},
  operating_profile: {},
  workflow_profile: {},
  language_profile: { greet: 'hi' },
  industry_blueprint: null,
  completeness_score: 0,
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe('IndustryBlueprintService.getBlueprint', () => {
  it('returns mapped blueprint when found', async () => {
    const row = makeBlueprintRow();
    const pool = makePool([ok([row])]);
    const svc = new IndustryBlueprintService(pool);
    const result = await svc.getBlueprint('fintech');
    expect(result?.industry).toBe('fintech');
    expect(result?.defaultWorkflows).toEqual({ approval: true });
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([])]);
    const svc = new IndustryBlueprintService(pool);
    const result = await svc.getBlueprint('unknown');
    expect(result).toBeNull();
  });
});

describe('IndustryBlueprintService.listBlueprints', () => {
  it('returns all blueprints ordered', async () => {
    const rows = [makeBlueprintRow(), makeBlueprintRow({ id: 'bp-2', industry: 'healthtech' })];
    const pool = makePool([ok(rows)]);
    const svc = new IndustryBlueprintService(pool);
    const results = await svc.listBlueprints();
    expect(results).toHaveLength(2);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    expect(calls[0]?.[0]).toContain('ORDER BY industry ASC');
  });
});

describe('IndustryBlueprintService.applyBlueprint', () => {
  it('throws when blueprint not found', async () => {
    // getBlueprint returns empty
    const pool = makePool([ok([])]);
    const svc = new IndustryBlueprintService(pool);
    await expect(svc.applyBlueprint(ORG, 'unknown')).rejects.toThrow(
      'Industry blueprint not found',
    );
  });

  it('merges blueprint into DNA and upserts', async () => {
    const bpRow = makeBlueprintRow();
    const dnaRow = makeDNARow();
    const upsertedDNA = makeDNARow({
      industry_blueprint: 'fintech',
      identity_profile: { industry: 'fintech' },
    });

    // call order:
    // 0: getBlueprint SELECT
    // 1: dnaService.getDNA -> setTenant
    // 2: dnaService.getDNA -> SELECT
    // 3: dnaService.upsertDNA -> setTenant
    // 4: dnaService.upsertDNA -> INSERT/UPSERT
    const pool = makePool([ok([bpRow]), ok([]), ok([dnaRow]), ok([]), ok([upsertedDNA])]);
    const svc = new IndustryBlueprintService(pool);
    const result = await svc.applyBlueprint(ORG, 'fintech');
    expect(result.industryBlueprint).toBe('fintech');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    // The upsert call (call 4) should include the industry in identity_profile
    const upsertParams = calls[4]?.[1] ?? [];
    expect(JSON.stringify(upsertParams)).toContain('fintech');
  });
});
