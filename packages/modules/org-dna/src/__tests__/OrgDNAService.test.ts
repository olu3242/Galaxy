import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OrgDNAService } from '../dna/OrgDNAService.js';

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

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'dna-1',
  organization_id: ORG,
  identity_profile: { name: 'Acme' },
  operating_profile: {},
  workflow_profile: {},
  language_profile: {},
  industry_blueprint: null,
  completeness_score: 20,
  version: 1,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
});

describe('OrgDNAService.upsertDNA', () => {
  it('calls setTenantContext then upsert and returns mapped DNA', async () => {
    const row = makeRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgDNAService(pool);
    const result = await svc.upsertDNA(ORG, { name: 'Acme' }, {}, {}, {});
    expect(result.organizationId).toBe(ORG);
    expect(result.identityProfile).toEqual({ name: 'Acme' });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[0]).toContain('ON CONFLICT');
  });

  it('includes industryBlueprint when provided', async () => {
    const row = makeRow({ industry_blueprint: 'fintech' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgDNAService(pool);
    const result = await svc.upsertDNA(ORG, {}, {}, {}, {}, 'fintech');
    expect(result.industryBlueprint).toBe('fintech');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[1]).toContain('fintech');
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgDNAService(pool);
    await expect(svc.upsertDNA(ORG, {}, {}, {}, {})).rejects.toThrow('Failed to upsert org DNA');
  });
});

describe('OrgDNAService.getDNA', () => {
  it('returns mapped DNA when row exists', async () => {
    const row = makeRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgDNAService(pool);
    const result = await svc.getDNA(ORG);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('dna-1');
  });

  it('returns null when no row found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgDNAService(pool);
    const result = await svc.getDNA(ORG);
    expect(result).toBeNull();
  });
});

describe('OrgDNAService.updateDNAField', () => {
  it('updates a field and returns mapped DNA', async () => {
    const row = makeRow({ identity_profile: { updated: true } });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgDNAService(pool);
    const result = await svc.updateDNAField(ORG, 'identityProfile', { updated: true });
    expect(result.identityProfile).toEqual({ updated: true });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[0]).toContain('identity_profile');
  });

  it('throws when no row returned', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgDNAService(pool);
    await expect(svc.updateDNAField(ORG, 'identityProfile', {})).rejects.toThrow(
      'Org DNA not found',
    );
  });
});

describe('OrgDNAService.computeCompleteness', () => {
  it('returns 0 when no DNA row found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgDNAService(pool);
    const score = await svc.computeCompleteness(ORG);
    expect(score).toBe(0);
  });

  it('computes score based on filled profiles', async () => {
    const row = makeRow({
      identity_profile: { a: 1 },
      operating_profile: { b: 2 },
      workflow_profile: { c: 3 },
      language_profile: {},
      industry_blueprint: null,
    });
    // query 0: setTenant, query 1: SELECT, query 2: UPDATE
    const pool = makePool([ok([]), ok([row]), ok([])]);
    const svc = new OrgDNAService(pool);
    const score = await svc.computeCompleteness(ORG);
    // 3/5 filled = 60
    expect(score).toBe(60);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[2]?.[1]).toContain(60);
  });

  it('returns 100 when all 5 fields are filled', async () => {
    const row = makeRow({
      identity_profile: { a: 1 },
      operating_profile: { b: 2 },
      workflow_profile: { c: 3 },
      language_profile: { d: 4 },
      industry_blueprint: 'tech',
    });
    const pool = makePool([ok([]), ok([row]), ok([])]);
    const svc = new OrgDNAService(pool);
    const score = await svc.computeCompleteness(ORG);
    expect(score).toBe(100);
  });
});
