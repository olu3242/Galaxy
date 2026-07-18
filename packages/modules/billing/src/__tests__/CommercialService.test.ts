import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { CommercialService } from '../commercial/CommercialService.js';

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

const planRow = {
  id: 'plan-1',
  name: 'Starter',
  monthly_price_cents: 1000,
  annual_price_cents: 10000,
};

const policyRow = {
  id: 'pol-1',
  key: 'grace_period_days',
  value: 7,
  description: 'Days before suspension',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('CommercialService', () => {
  describe('getPricingConfig', () => {
    it('returns pricing configs mapped from plan rows', async () => {
      const pool = makePool([ok([planRow])]);
      const svc = new CommercialService(pool);
      const configs = await svc.getPricingConfig();
      expect(configs).toHaveLength(1);
      expect(configs[0]?.planId).toBe('plan-1');
      expect(configs[0]?.planName).toBe('Starter');
      expect(configs[0]?.monthlyPriceCents).toBe(1000);
      expect(configs[0]?.annualPriceCents).toBe(10000);
      expect(configs[0]?.currency).toBe('usd');
    });

    it('calculates annual discount percent correctly', async () => {
      // monthly=1000, annual=10000 => annualMonthly=833, discount=17%
      const pool = makePool([ok([planRow])]);
      const svc = new CommercialService(pool);
      const configs = await svc.getPricingConfig();
      const annualMonthly = Math.round(10000 / 12);
      const expected = Math.round(((1000 - annualMonthly) / 1000) * 100);
      expect(configs[0]?.annualDiscountPercent).toBe(expected);
    });

    it('returns zero discount when monthly price is 0', async () => {
      const freeRow = { ...planRow, monthly_price_cents: 0 };
      const pool = makePool([ok([freeRow])]);
      const svc = new CommercialService(pool);
      const configs = await svc.getPricingConfig();
      expect(configs[0]?.annualDiscountPercent).toBe(0);
    });

    it('returns empty array when no plans', async () => {
      const pool = makePool([ok([])]);
      const svc = new CommercialService(pool);
      const configs = await svc.getPricingConfig();
      expect(configs).toHaveLength(0);
    });
  });

  describe('getBillingPolicy', () => {
    it('returns policy when found', async () => {
      const pool = makePool([ok([policyRow])]);
      const svc = new CommercialService(pool);
      const policy = await svc.getBillingPolicy('grace_period_days');
      expect(policy?.id).toBe('pol-1');
      expect(policy?.key).toBe('grace_period_days');
      expect(policy?.value).toBe(7);
    });

    it('returns null when policy not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new CommercialService(pool);
      const policy = await svc.getBillingPolicy('nonexistent');
      expect(policy).toBeNull();
    });

    it('passes key as parameter', async () => {
      const pool = makePool([ok([policyRow])]);
      const svc = new CommercialService(pool);
      await svc.getBillingPolicy('grace_period_days');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[1]).toContain('grace_period_days');
    });
  });

  describe('setBillingPolicy', () => {
    it('returns upserted policy', async () => {
      const pool = makePool([ok([policyRow])]);
      const svc = new CommercialService(pool);
      const policy = await svc.setBillingPolicy('grace_period_days', 7, 'Days before suspension');
      expect(policy.id).toBe('pol-1');
      expect(policy.key).toBe('grace_period_days');
      expect(policy.updatedAt).toBe('2024-01-01T00:00:00Z');
    });

    it('throws when upsert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new CommercialService(pool);
      await expect(svc.setBillingPolicy('key', 'value')).rejects.toThrow('Policy upsert failed');
    });

    it('passes null description when not provided', async () => {
      const pool = makePool([ok([policyRow])]);
      const svc = new CommercialService(pool);
      await svc.setBillingPolicy('grace_period_days', 7);
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[1]?.[2]).toBeNull();
    });
  });
});
