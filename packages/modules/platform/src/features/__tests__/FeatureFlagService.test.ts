import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { FeatureFlagService } from '../FeatureFlagService.js';

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

const flagRow = {
  id: 'ff-1',
  name: 'dark_mode',
  description: 'Enable dark mode',
  enabled: false,
  rollout_percentage: '50',
  created_at: '2024-01-01T00:00:00Z',
};

const entitlementRow = {
  id: 'ent-1',
  organization_id: 'org-1',
  feature_flag_id: 'ff-1',
  enabled: true,
  overridden_at: '2024-01-01T00:00:00Z',
};

describe('FeatureFlagService', () => {
  describe('createFlag', () => {
    it('returns created flag', async () => {
      const pool = makePool([ok([flagRow])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.createFlag({ name: 'dark_mode', rolloutPercentage: 50 });
      expect(result.id).toBe('ff-1');
      expect(result.rolloutPercentage).toBe(50);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new FeatureFlagService(pool);
      await expect(svc.createFlag({ name: 'x' })).rejects.toThrow('Failed to create feature flag');
    });
  });

  describe('listFlags', () => {
    it('returns all flags', async () => {
      const pool = makePool([ok([flagRow])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.listFlags();
      expect(result[0]?.name).toBe('dark_mode');
    });

    it('returns empty array when no flags', async () => {
      const pool = makePool([ok([])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.listFlags();
      expect(result).toHaveLength(0);
    });
  });

  describe('toggleFlag', () => {
    it('returns updated flag', async () => {
      const enabled = { ...flagRow, enabled: true };
      const pool = makePool([ok([enabled])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.toggleFlag('ff-1', true);
      expect(result?.enabled).toBe(true);
    });

    it('returns null when flag not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.toggleFlag('missing', true);
      expect(result).toBeNull();
    });
  });

  describe('setEntitlement', () => {
    it('returns upserted entitlement', async () => {
      const pool = makePool([ok([entitlementRow])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.setEntitlement({
        organizationId: 'org-1',
        featureFlagId: 'ff-1',
        enabled: true,
      });
      expect(result.id).toBe('ent-1');
      expect(result.enabled).toBe(true);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new FeatureFlagService(pool);
      await expect(
        svc.setEntitlement({ organizationId: 'org-1', featureFlagId: 'ff-1', enabled: true }),
      ).rejects.toThrow('Failed to set entitlement');
    });
  });

  describe('getEntitlements', () => {
    it('returns entitlements for org', async () => {
      const pool = makePool([ok([entitlementRow])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.getEntitlements('org-1');
      expect(result[0]?.organizationId).toBe('org-1');
    });
  });

  describe('isEnabled', () => {
    it('returns true when feature is enabled', async () => {
      const pool = makePool([ok([{ enabled: true }])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.isEnabled('org-1', 'dark_mode');
      expect(result).toBe(true);
    });

    it('returns false when no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new FeatureFlagService(pool);
      const result = await svc.isEnabled('org-1', 'missing_feature');
      expect(result).toBe(false);
    });
  });
});
