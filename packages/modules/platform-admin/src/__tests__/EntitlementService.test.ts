import { describe, it, expect, vi } from 'vitest';
import { EntitlementService } from '../features/EntitlementService.js';
import type { Pool, QueryResult } from 'pg';

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

const entitlementRow = {
  id: 'ent-1',
  plan_tier: 'professional',
  feature_key: 'advanced_analytics',
  is_enabled: true,
  config: {},
  created_at: '2024-01-01T00:00:00Z',
};

const overrideRow = {
  id: 'ovr-1',
  organization_id: 'org-1',
  feature_key: 'advanced_analytics',
  is_enabled: false,
  override_reason: 'trial ended',
  created_at: '2024-01-01T00:00:00Z',
};

describe('EntitlementService', () => {
  describe('getEntitlementsForPlan', () => {
    it('returns entitlements for plan', async () => {
      const pool = makePool([ok([entitlementRow])]);
      const svc = new EntitlementService(pool);
      const results = await svc.getEntitlementsForPlan('professional');
      expect(results).toHaveLength(1);
      expect(results[0]?.planTier).toBe('professional');
      expect(results[0]?.featureKey).toBe('advanced_analytics');
    });

    it('returns empty array when no entitlements', async () => {
      const pool = makePool([ok([])]);
      const svc = new EntitlementService(pool);
      const results = await svc.getEntitlementsForPlan('starter');
      expect(results).toHaveLength(0);
    });

    it('passes planTier as parameter', async () => {
      const pool = makePool([ok([])]);
      const svc = new EntitlementService(pool);
      await svc.getEntitlementsForPlan('enterprise');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0] as [string, unknown[]])[1]).toContain('enterprise');
    });
  });

  describe('isFeatureEntitled', () => {
    it('returns true when feature is enabled', async () => {
      const pool = makePool([ok([entitlementRow])]);
      const svc = new EntitlementService(pool);
      const result = await svc.isFeatureEntitled('professional', 'advanced_analytics');
      expect(result).toBe(true);
    });

    it('returns false when feature is disabled', async () => {
      const pool = makePool([ok([{ ...entitlementRow, is_enabled: false }])]);
      const svc = new EntitlementService(pool);
      const result = await svc.isFeatureEntitled('professional', 'advanced_analytics');
      expect(result).toBe(false);
    });

    it('returns false when not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new EntitlementService(pool);
      const result = await svc.isFeatureEntitled('starter', 'advanced_analytics');
      expect(result).toBe(false);
    });
  });

  describe('upsertEntitlement', () => {
    it('upserts and returns mapped entitlement', async () => {
      const pool = makePool([ok([entitlementRow])]);
      const svc = new EntitlementService(pool);
      const result = await svc.upsertEntitlement('professional', 'advanced_analytics', true, {});
      expect(result.id).toBe('ent-1');
      expect(result.isEnabled).toBe(true);
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new EntitlementService(pool);
      await expect(
        svc.upsertEntitlement('professional', 'advanced_analytics', true),
      ).rejects.toThrow('Upsert failed');
    });
  });

  describe('getOrgOverride', () => {
    it('sets tenant context then queries override', async () => {
      const pool = makePool([ok([]), ok([overrideRow])]);
      const svc = new EntitlementService(pool);
      const result = await svc.getOrgOverride('org-1', 'advanced_analytics');
      expect(result).not.toBeNull();
      expect(result?.isEnabled).toBe(false);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0] as [string, unknown[]])[0]).toContain('set_config');
    });

    it('returns null when no override exists', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EntitlementService(pool);
      const result = await svc.getOrgOverride('org-1', 'some_feature');
      expect(result).toBeNull();
    });
  });

  describe('setOrgOverride', () => {
    it('sets tenant context then upserts override', async () => {
      const pool = makePool([ok([]), ok([overrideRow])]);
      const svc = new EntitlementService(pool);
      const result = await svc.setOrgOverride('org-1', 'advanced_analytics', false, 'trial ended');
      expect(result.overrideReason).toBe('trial ended');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0] as [string, unknown[]])[0]).toContain('set_config');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new EntitlementService(pool);
      await expect(svc.setOrgOverride('org-1', 'feature', true)).rejects.toThrow(
        'Override upsert failed',
      );
    });
  });

  describe('isFeatureEnabledForOrg', () => {
    it('returns override value when override exists', async () => {
      // getOrgOverride: set_config + SELECT -> overrideRow (is_enabled=false)
      const pool = makePool([ok([]), ok([overrideRow])]);
      const svc = new EntitlementService(pool);
      const result = await svc.isFeatureEnabledForOrg(
        'org-1',
        'advanced_analytics',
        'professional',
      );
      expect(result).toBe(false);
    });

    it('falls back to entitlement when no override', async () => {
      // getOrgOverride: set_config + SELECT (empty) then isFeatureEntitled: SELECT
      const pool = makePool([ok([]), ok([]), ok([entitlementRow])]);
      const svc = new EntitlementService(pool);
      const result = await svc.isFeatureEnabledForOrg(
        'org-1',
        'advanced_analytics',
        'professional',
      );
      expect(result).toBe(true);
    });
  });
});
