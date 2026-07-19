import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OrgLanguageService } from '../language/OrgLanguageService.js';

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
  id: 'lang-1',
  organization_id: ORG,
  term: 'sprint',
  definition: 'A time-boxed iteration',
  aliases: ['iteration', 'cycle'],
  category: 'engineering',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
});

describe('OrgLanguageService.addTerm', () => {
  it('sets tenant context then inserts and returns entry', async () => {
    const row = makeRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgLanguageService(pool);
    const result = await svc.addTerm(
      ORG,
      'sprint',
      'A time-boxed iteration',
      ['iteration'],
      'engineering',
    );
    expect(result.term).toBe('sprint');
    expect(result.organizationId).toBe(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[0]).toContain('INSERT INTO org_language_entries');
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgLanguageService(pool);
    await expect(svc.addTerm(ORG, 'sprint', 'def', [], 'eng')).rejects.toThrow(
      'Failed to add language term',
    );
  });
});

describe('OrgLanguageService.getTerms', () => {
  it('returns all terms for org', async () => {
    const rows = [makeRow(), makeRow({ id: 'lang-2', term: 'epic' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new OrgLanguageService(pool);
    const result = await svc.getTerms(ORG);
    expect(result).toHaveLength(2);
    expect(result[0]?.term).toBe('sprint');
  });

  it('returns empty array when no terms', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgLanguageService(pool);
    const result = await svc.getTerms(ORG);
    expect(result).toEqual([]);
  });
});

describe('OrgLanguageService.lookupTerm', () => {
  it('returns entry when term found', async () => {
    const row = makeRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgLanguageService(pool);
    const result = await svc.lookupTerm(ORG, 'sprint');
    expect(result?.definition).toBe('A time-boxed iteration');
    expect(result?.aliases).toEqual(['iteration', 'cycle']);
  });

  it('returns null when term not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgLanguageService(pool);
    const result = await svc.lookupTerm(ORG, 'missing');
    expect(result).toBeNull();
  });
});

describe('OrgLanguageService.deleteTerm', () => {
  it('sets tenant context and issues DELETE', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgLanguageService(pool);
    await svc.deleteTerm(ORG, 'lang-1');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[1]?.[0]).toContain('DELETE FROM org_language_entries');
    expect(calls[1]?.[1]).toContain('lang-1');
  });
});
