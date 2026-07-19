import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { EntitlementService } from '../EntitlementService.js';

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

const planFeatureRow = {
  plan_name: 'pro',
  feature_flag_id: 'ff-1',
  feature_name: 'advanced_analytics',
  included: true,
};

describe('EntitlementService', () => {
  describe('getPlanFeatures', () => {
    it('returns plan features', async () => {
      const pool = makePool([ok([planFeatureRow])]);
      const svc = new EntitlementService(pool);
      const result = await svc.getPlanFeatures('pro');
      expect(result[0]?.planName).toBe('pro');
      expect(result[0]?.featureName).toBe('advanced_analytics');
      expect(result[0]?.included).toBe(true);
    });

    it('returns empty array when no features for plan', async () => {
      const pool = makePool([ok([])]);
      const svc = new EntitlementService(pool);
      const result = await svc.getPlanFeatures('free');
      expect(result).toHaveLength(0);
    });
  });

  describe('setPlanFeature', () => {
    it('returns the upserted plan feature', async () => {
      const pool = makePool([ok([planFeatureRow])]);
      const svc = new EntitlementService(pool);
      const result = await svc.setPlanFeature({
        planName: 'pro',
        featureFlagId: 'ff-1',
        included: true,
      });
      expect(result.planName).toBe('pro');
      expect(result.included).toBe(true);
    });

    it('throws when upsert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new EntitlementService(pool);
      await expect(
        svc.setPlanFeature({ planName: 'pro', featureFlagId: 'ff-1', included: true }),
      ).rejects.toThrow('Failed to set plan feature');
    });
  });

  describe('orgHasFeature', () => {
    it('returns true when org has feature', async () => {
      const pool = makePool([ok([{ has_feature: true }])]);
      const svc = new EntitlementService(pool);
      const result = await svc.orgHasFeature('org-1', 'advanced_analytics');
      expect(result).toBe(true);
    });

    it('returns false when org does not have feature', async () => {
      const pool = makePool([ok([{ has_feature: false }])]);
      const svc = new EntitlementService(pool);
      const result = await svc.orgHasFeature('org-1', 'advanced_analytics');
      expect(result).toBe(false);
    });

    it('returns false when no row returned', async () => {
      const pool = makePool([ok([])]);
      const svc = new EntitlementService(pool);
      const result = await svc.orgHasFeature('org-1', 'feature_x');
      expect(result).toBe(false);
    });
  });
});
