import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { MarketplaceBillingService } from '../MarketplaceBillingService.js';
import type { MarketplaceBillingRow } from '../../types.js';

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

const billingRow: MarketplaceBillingRow = {
  id: 'bill-1',
  organization_id: 'org-1',
  installation_id: 'inst-1',
  marketplace_item_id: 'item-1',
  period_start: '2024-01-01',
  period_end: '2024-01-31',
  usage_units: '100',
  fee_amount: '9.99',
  fee_currency: 'USD',
  status: 'pending',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('MarketplaceBillingService', () => {
  describe('recordUsage', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([billingRow])]);
      const svc = new MarketplaceBillingService(pool);
      await svc.recordUsage({
        organizationId: 'org-1',
        installationId: 'inst-1',
        marketplaceItemId: 'item-1',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        usageUnits: 100,
        feeAmount: 9.99,
        feeCurrency: 'USD',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
      expect(((calls[0]?.[1] ?? []) as string[])[1]).toBe('org-1');
    });

    it('returns mapped billing record on success', async () => {
      const pool = makePool([ok([]), ok([billingRow])]);
      const svc = new MarketplaceBillingService(pool);
      const result = await svc.recordUsage({
        organizationId: 'org-1',
        installationId: 'inst-1',
        marketplaceItemId: 'item-1',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        usageUnits: 100,
        feeAmount: 9.99,
        feeCurrency: 'USD',
      });
      expect(result.id).toBe('bill-1');
      expect(result.usageUnits).toBe(100);
      expect(result.feeAmount).toBe(9.99);
      expect(result.status).toBe('pending');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceBillingService(pool);
      await expect(
        svc.recordUsage({
          organizationId: 'org-1',
          installationId: 'inst-1',
          marketplaceItemId: 'item-1',
          periodStart: '2024-01-01',
          periodEnd: '2024-01-31',
          usageUnits: 1,
          feeAmount: 1,
          feeCurrency: 'USD',
        }),
      ).rejects.toThrow('Failed to record usage');
    });
  });

  describe('listBilling', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([billingRow])]);
      const svc = new MarketplaceBillingService(pool);
      await svc.listBilling('org-1', {});
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns all mapped billing records', async () => {
      const pool = makePool([ok([]), ok([billingRow, { ...billingRow, id: 'bill-2' }])]);
      const svc = new MarketplaceBillingService(pool);
      const results = await svc.listBilling('org-1', {});
      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('bill-1');
    });

    it('returns empty array when no billing records', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceBillingService(pool);
      const results = await svc.listBilling('org-1', {});
      expect(results).toHaveLength(0);
    });

    it('adds installationId filter when provided', async () => {
      const pool = makePool([ok([]), ok([billingRow])]);
      const svc = new MarketplaceBillingService(pool);
      await svc.listBilling('org-1', { installationId: 'inst-1' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[1]?.[0] as string).toContain('installation_id');
    });
  });

  describe('markInvoiced', () => {
    it('sets tenant context as first query', async () => {
      const invoicedRow: MarketplaceBillingRow = { ...billingRow, status: 'invoiced' };
      const pool = makePool([ok([]), ok([invoicedRow])]);
      const svc = new MarketplaceBillingService(pool);
      await svc.markInvoiced('org-1', 'bill-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns invoiced billing record', async () => {
      const invoicedRow: MarketplaceBillingRow = { ...billingRow, status: 'invoiced' };
      const pool = makePool([ok([]), ok([invoicedRow])]);
      const svc = new MarketplaceBillingService(pool);
      const result = await svc.markInvoiced('org-1', 'bill-1');
      expect(result?.status).toBe('invoiced');
    });

    it('returns null when billing record not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceBillingService(pool);
      const result = await svc.markInvoiced('org-1', 'bill-999');
      expect(result).toBeNull();
    });
  });

  describe('markPaid', () => {
    it('returns paid billing record', async () => {
      const paidRow: MarketplaceBillingRow = { ...billingRow, status: 'paid' };
      const pool = makePool([ok([]), ok([paidRow])]);
      const svc = new MarketplaceBillingService(pool);
      const result = await svc.markPaid('org-1', 'bill-1');
      expect(result?.status).toBe('paid');
    });

    it('returns null when billing record not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceBillingService(pool);
      const result = await svc.markPaid('org-1', 'bill-999');
      expect(result).toBeNull();
    });
  });

  describe('calculateTotalFees', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([{ total: '29.97' }])]);
      const svc = new MarketplaceBillingService(pool);
      await svc.calculateTotalFees('org-1', '2024-01-01', '2024-01-31');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns summed fee amount', async () => {
      const pool = makePool([ok([]), ok([{ total: '29.97' }])]);
      const svc = new MarketplaceBillingService(pool);
      const total = await svc.calculateTotalFees('org-1', '2024-01-01', '2024-01-31');
      expect(total).toBe(29.97);
    });

    it('returns 0 when no billing records', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceBillingService(pool);
      const total = await svc.calculateTotalFees('org-1', '2024-01-01', '2024-01-31');
      expect(total).toBe(0);
    });
  });
});
