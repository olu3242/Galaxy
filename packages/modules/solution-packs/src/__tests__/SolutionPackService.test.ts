import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { SolutionPackService } from '../SolutionPackService.js';
import type { SolutionPackRow, PackInstallationRow } from '../types.js';

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

const ORG = 'org-packs';

function makePackRow(overrides: Partial<SolutionPackRow> = {}): SolutionPackRow {
  return {
    id: 'pack-1',
    name: 'Fintech Starter',
    industry: 'fintech',
    description: 'A starter pack',
    version: '1.0.0',
    is_published: true,
    pack_data: { includedWorkflows: ['wf-1'], includedKnowledgeTemplates: [], recommendedAgents: [] },
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeInstallationRow(overrides: Partial<PackInstallationRow> = {}): PackInstallationRow {
  return {
    id: 'install-1',
    organization_id: ORG,
    pack_id: 'pack-1',
    installed_by: 'user-1',
    installed_at: '2026-07-01T00:00:00.000Z',
    status: 'installed',
    ...overrides,
  };
}

describe('SolutionPackService', () => {
  describe('createPack', () => {
    it('inserts and returns a mapped pack', async () => {
      const row = makePackRow({ is_published: false });
      const pool = makePool([ok([row])]);
      const svc = new SolutionPackService(pool);
      const pack = await svc.createPack({
        name: 'Fintech Starter',
        industry: 'fintech',
        description: 'A starter pack',
        version: '1.0.0',
        packData: { includedWorkflows: ['wf-1'], includedKnowledgeTemplates: [], recommendedAgents: [] },
      });
      expect(pack.id).toBe('pack-1');
      expect(pack.isPublished).toBe(false);
      expect(pack.industry).toBe('fintech');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new SolutionPackService(pool);
      await expect(
        svc.createPack({
          name: 'X',
          industry: 'retail',
          description: 'D',
          version: '1.0.0',
          packData: { includedWorkflows: [], includedKnowledgeTemplates: [], recommendedAgents: [] },
        }),
      ).rejects.toThrow('Failed to create');
    });
  });

  describe('listAvailablePacks', () => {
    it('returns all published packs without filter', async () => {
      const rows = [makePackRow({ id: 'p1' }), makePackRow({ id: 'p2', industry: 'retail' })];
      const pool = makePool([ok(rows)]);
      const svc = new SolutionPackService(pool);
      const packs = await svc.listAvailablePacks();
      expect(packs).toHaveLength(2);
    });

    it('filters by industry when specified', async () => {
      const rows = [makePackRow()];
      const pool = makePool([ok(rows)]);
      const svc = new SolutionPackService(pool);
      const packs = await svc.listAvailablePacks({ industry: 'fintech' });
      expect(packs).toHaveLength(1);
      expect(packs[0]?.industry).toBe('fintech');
    });
  });

  describe('getPack', () => {
    it('returns pack when found', async () => {
      const row = makePackRow();
      const pool = makePool([ok([row])]);
      const svc = new SolutionPackService(pool);
      const pack = await svc.getPack('pack-1');
      expect(pack?.id).toBe('pack-1');
    });

    it('returns undefined when not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new SolutionPackService(pool);
      const pack = await svc.getPack('missing');
      expect(pack).toBeUndefined();
    });
  });

  describe('installPack', () => {
    it('sets tenant context and returns installation', async () => {
      const packRow = makePackRow();
      const installRow = makeInstallationRow();
      // setTenantContext, getPack SELECT, INSERT
      const pool = makePool([ok([]), ok([packRow]), ok([installRow])]);
      const svc = new SolutionPackService(pool);
      const installation = await svc.installPack(ORG, 'pack-1', 'user-1');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(installation.id).toBe('install-1');
      expect(installation.status).toBe('installed');
    });

    it('throws when pack not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SolutionPackService(pool);
      await expect(svc.installPack(ORG, 'missing-pack', 'user-1')).rejects.toThrow('not found');
    });
  });

  describe('listInstallations', () => {
    it('returns installations for org', async () => {
      const rows = [makeInstallationRow({ id: 'i1' }), makeInstallationRow({ id: 'i2' })];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new SolutionPackService(pool);
      const installs = await svc.listInstallations(ORG);
      expect(installs).toHaveLength(2);
      expect(installs[0]?.organizationId).toBe(ORG);
    });
  });
});
