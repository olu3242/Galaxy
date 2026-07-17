import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { InstallationService } from '../InstallationService.js';
import type { InstallationRow } from '../../types.js';

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

const installRow: InstallationRow = {
  id: 'inst-1',
  organization_id: 'org-1',
  marketplace_item_id: 'item-1',
  installed_by: 'user-1',
  status: 'active',
  installed_at: '2024-01-01T00:00:00Z',
  uninstalled_at: null,
  config: { key: 'value' },
};

describe('InstallationService', () => {
  describe('installItem', () => {
    it('sets tenant context as first query', async () => {
      // [0] set_config, [1] SELECT existing (rowCount=0), [2] INSERT RETURNING *, [3] UPDATE install_count
      const pool = makePool([ok([]), ok([]), ok([installRow]), ok([])]);
      const svc = new InstallationService(pool);
      await svc.installItem({
        organizationId: 'org-1',
        marketplaceItemId: 'item-1',
        installedBy: 'user-1',
        config: { key: 'value' },
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
      expect(((calls[0]?.[1] ?? []) as string[])[1]).toBe('org-1');
    });

    it('returns mapped installation on success', async () => {
      const pool = makePool([ok([]), ok([]), ok([installRow]), ok([])]);
      const svc = new InstallationService(pool);
      const result = await svc.installItem({
        organizationId: 'org-1',
        marketplaceItemId: 'item-1',
        installedBy: 'user-1',
        config: { key: 'value' },
      });
      expect(result.id).toBe('inst-1');
      expect(result.status).toBe('active');
      expect(result.config).toEqual({ key: 'value' });
    });

    it('throws when item is already installed', async () => {
      // existing check returns rowCount=1
      const existing: QueryResult<InstallationRow> = {
        rows: [installRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
      const pool = makePool([ok([]), existing]);
      const svc = new InstallationService(pool);
      await expect(
        svc.installItem({
          organizationId: 'org-1',
          marketplaceItemId: 'item-1',
          installedBy: 'user-1',
          config: {},
        }),
      ).rejects.toThrow('Item is already installed');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([]), ok([]), ok([])]);
      const svc = new InstallationService(pool);
      await expect(
        svc.installItem({
          organizationId: 'org-1',
          marketplaceItemId: 'item-1',
          installedBy: 'user-1',
          config: {},
        }),
      ).rejects.toThrow('Failed to install item');
    });
  });

  describe('uninstallItem', () => {
    it('sets tenant context as first query', async () => {
      const uninstalledRow: InstallationRow = {
        ...installRow,
        status: 'uninstalled',
        uninstalled_at: '2024-01-02T00:00:00Z',
      };
      const pool = makePool([ok([]), ok([uninstalledRow]), ok([])]);
      const svc = new InstallationService(pool);
      await svc.uninstallItem('org-1', 'inst-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped installation after uninstall', async () => {
      const uninstalledRow: InstallationRow = {
        ...installRow,
        status: 'uninstalled',
        uninstalled_at: '2024-01-02T00:00:00Z',
      };
      const pool = makePool([ok([]), ok([uninstalledRow]), ok([])]);
      const svc = new InstallationService(pool);
      const result = await svc.uninstallItem('org-1', 'inst-1');
      expect(result?.status).toBe('uninstalled');
      expect(result?.uninstalledAt).toBe('2024-01-02T00:00:00Z');
    });

    it('returns null when installation not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InstallationService(pool);
      const result = await svc.uninstallItem('org-1', 'inst-999');
      expect(result).toBeNull();
    });
  });

  describe('getInstallation', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([installRow])]);
      const svc = new InstallationService(pool);
      await svc.getInstallation('org-1', 'inst-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns installation when found', async () => {
      const pool = makePool([ok([]), ok([installRow])]);
      const svc = new InstallationService(pool);
      const result = await svc.getInstallation('org-1', 'inst-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('inst-1');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InstallationService(pool);
      const result = await svc.getInstallation('org-1', 'inst-999');
      expect(result).toBeNull();
    });
  });

  describe('listInstallations', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([installRow])]);
      const svc = new InstallationService(pool);
      await svc.listInstallations('org-1', {});
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns all mapped installations', async () => {
      const pool = makePool([ok([]), ok([installRow, { ...installRow, id: 'inst-2' }])]);
      const svc = new InstallationService(pool);
      const results = await svc.listInstallations('org-1', {});
      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('inst-1');
    });

    it('returns empty array when none exist', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new InstallationService(pool);
      const results = await svc.listInstallations('org-1', {});
      expect(results).toHaveLength(0);
    });

    it('adds status filter to query when provided', async () => {
      const pool = makePool([ok([]), ok([installRow])]);
      const svc = new InstallationService(pool);
      await svc.listInstallations('org-1', { status: 'active' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[1]?.[0] as string).toContain('status');
    });
  });
});
