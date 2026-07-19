import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { MarketplaceAnalyticsService } from '../MarketplaceAnalyticsService.js';

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

const itemAnalyticsRow = {
  id: 'item-1',
  name: 'My Workflow',
  install_count: '10',
  average_rating: '4.50',
  review_count: '3',
};

describe('MarketplaceAnalyticsService', () => {
  describe('getItemAnalytics', () => {
    it('sets tenant context as first query', async () => {
      // [0] set_config, [1] SELECT item, [2] SELECT active_count, [3] SELECT revenue
      const pool = makePool([
        ok([]),
        ok([itemAnalyticsRow]),
        ok([{ active_count: '8' }]),
        ok([{ revenue: '99.90' }]),
      ]);
      const svc = new MarketplaceAnalyticsService(pool);
      await svc.getItemAnalytics('org-1', 'item-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
      expect(((calls[0]?.[1] ?? []) as string[])[1]).toBe('org-1');
    });

    it('returns analytics with correct data', async () => {
      const pool = makePool([
        ok([]),
        ok([itemAnalyticsRow]),
        ok([{ active_count: '8' }]),
        ok([{ revenue: '99.90' }]),
      ]);
      const svc = new MarketplaceAnalyticsService(pool);
      const result = await svc.getItemAnalytics('org-1', 'item-1');
      expect(result).not.toBeNull();
      expect(result?.itemId).toBe('item-1');
      expect(result?.itemName).toBe('My Workflow');
      expect(result?.installCount).toBe(10);
      expect(result?.activeInstallCount).toBe(8);
      expect(result?.totalRevenue).toBe(99.9);
      expect(result?.averageRating).toBe(4.5);
      expect(result?.reviewCount).toBe(3);
    });

    it('returns null when item not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceAnalyticsService(pool);
      const result = await svc.getItemAnalytics('org-1', 'item-999');
      expect(result).toBeNull();
    });

    it('defaults to 0 active count and revenue when rows missing', async () => {
      const pool = makePool([ok([]), ok([itemAnalyticsRow]), ok([]), ok([])]);
      const svc = new MarketplaceAnalyticsService(pool);
      const result = await svc.getItemAnalytics('org-1', 'item-1');
      expect(result?.activeInstallCount).toBe(0);
      expect(result?.totalRevenue).toBe(0);
    });
  });

  describe('getMarketplaceOverview', () => {
    it('sets tenant context as first query', async () => {
      // [0] set_config, [1] overview aggregate, [2] top items, [3] active counts, [4] revenue
      const pool = makePool([
        ok([]),
        ok([{ total_items: '5', total_installs: '20', total_revenue: '199.95' }]),
        ok([itemAnalyticsRow]),
        ok([{ marketplace_item_id: 'item-1', active_count: '8' }]),
        ok([{ marketplace_item_id: 'item-1', revenue: '99.90' }]),
      ]);
      const svc = new MarketplaceAnalyticsService(pool);
      await svc.getMarketplaceOverview('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns overview with correct totals and top items', async () => {
      const pool = makePool([
        ok([]),
        ok([{ total_items: '5', total_installs: '20', total_revenue: '199.95' }]),
        ok([itemAnalyticsRow]),
        ok([{ marketplace_item_id: 'item-1', active_count: '8' }]),
        ok([{ marketplace_item_id: 'item-1', revenue: '99.90' }]),
      ]);
      const svc = new MarketplaceAnalyticsService(pool);
      const result = await svc.getMarketplaceOverview('org-1');
      expect(result.totalItems).toBe(5);
      expect(result.totalInstalls).toBe(20);
      expect(result.totalRevenue).toBe(199.95);
      expect(result.topItems).toHaveLength(1);
      expect(result.topItems[0]?.itemId).toBe('item-1');
      expect(result.topItems[0]?.activeInstallCount).toBe(8);
      expect(result.topItems[0]?.totalRevenue).toBe(99.9);
    });

    it('returns empty overview when no items', async () => {
      // With no items, active/revenue queries are skipped
      const pool = makePool([
        ok([]),
        ok([{ total_items: '0', total_installs: '0', total_revenue: '0' }]),
        ok([]),
      ]);
      const svc = new MarketplaceAnalyticsService(pool);
      const result = await svc.getMarketplaceOverview('org-1');
      expect(result.totalItems).toBe(0);
      expect(result.topItems).toHaveLength(0);
    });

    it('defaults totals to 0 when overview row missing', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new MarketplaceAnalyticsService(pool);
      const result = await svc.getMarketplaceOverview('org-1');
      expect(result.totalItems).toBe(0);
      expect(result.totalInstalls).toBe(0);
      expect(result.totalRevenue).toBe(0);
    });
  });
});
