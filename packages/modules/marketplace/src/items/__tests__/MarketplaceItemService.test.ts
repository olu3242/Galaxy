import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { MarketplaceItemService } from '../MarketplaceItemService.js';
import type { MarketplaceItemRow } from '../../types.js';

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

const itemRow: MarketplaceItemRow = {
  id: 'item-1',
  organization_id: 'org-1',
  publisher_id: 'pub-1',
  name: 'My Workflow',
  slug: 'my-workflow',
  description: 'A test workflow',
  category: 'workflow',
  status: 'draft',
  pricing_model: 'free',
  price_amount: '0.00',
  price_currency: 'USD',
  tags: ['tag1'],
  metadata: {},
  install_count: '0',
  average_rating: '0.00',
  review_count: '0',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('MarketplaceItemService', () => {
  describe('createItem', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([itemRow])]);
      const svc = new MarketplaceItemService(pool);
      await svc.createItem({
        organizationId: 'org-1',
        publisherId: 'pub-1',
        name: 'My Workflow',
        slug: 'my-workflow',
        description: 'A test workflow',
        category: 'workflow',
        pricingModel: 'free',
        priceAmount: 0,
        priceCurrency: 'USD',
        tags: ['tag1'],
        metadata: {},
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
      expect(((calls[0]?.[1] ?? []) as string[])[1]).toBe('org-1');
    });

    it('returns mapped item on success', async () => {
      const pool = makePool([ok([]), ok([itemRow])]);
      const svc = new MarketplaceItemService(pool);
      const result = await svc.createItem({
        organizationId: 'org-1',
        publisherId: 'pub-1',
        name: 'My Workflow',
        slug: 'my-workflow',
        description: 'A test workflow',
        category: 'workflow',
        pricingModel: 'free',
        priceAmount: 0,
        priceCurrency: 'USD',
        tags: ['tag1'],
        metadata: {},
      });
      expect(result.id).toBe('item-1');
      expect(result.name).toBe('My Workflow');
      expect(result.status).toBe('draft');
      expect(result.priceAmount).toBe(0);
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceItemService(pool);
      await expect(
        svc.createItem({
          organizationId: 'org-1',
          publisherId: 'pub-1',
          name: 'My Workflow',
          slug: 'my-workflow',
          description: 'desc',
          category: 'workflow',
          pricingModel: 'free',
          priceAmount: 0,
          priceCurrency: 'USD',
          tags: [],
          metadata: {},
        }),
      ).rejects.toThrow('Failed to create marketplace item');
    });
  });

  describe('getItem', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([itemRow])]);
      const svc = new MarketplaceItemService(pool);
      await svc.getItem('org-1', 'item-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped item when found', async () => {
      const pool = makePool([ok([]), ok([itemRow])]);
      const svc = new MarketplaceItemService(pool);
      const result = await svc.getItem('org-1', 'item-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('item-1');
      expect(result?.category).toBe('workflow');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceItemService(pool);
      const result = await svc.getItem('org-1', 'item-999');
      expect(result).toBeNull();
    });
  });

  describe('listItems', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([itemRow])]);
      const svc = new MarketplaceItemService(pool);
      await svc.listItems('org-1', {});
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns all mapped items', async () => {
      const pool = makePool([ok([]), ok([itemRow, { ...itemRow, id: 'item-2' }])]);
      const svc = new MarketplaceItemService(pool);
      const results = await svc.listItems('org-1', {});
      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('item-1');
    });

    it('returns empty array when no items', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceItemService(pool);
      const results = await svc.listItems('org-1', {});
      expect(results).toHaveLength(0);
    });

    it('adds category filter to query when provided', async () => {
      const pool = makePool([ok([]), ok([itemRow])]);
      const svc = new MarketplaceItemService(pool);
      await svc.listItems('org-1', { category: 'workflow' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[1]?.[0] as string).toContain('category');
    });
  });

  describe('updateItem', () => {
    it('sets tenant context as first query', async () => {
      const updatedRow: MarketplaceItemRow = { ...itemRow, name: 'Updated Name' };
      const pool = makePool([ok([]), ok([updatedRow])]);
      const svc = new MarketplaceItemService(pool);
      await svc.updateItem('org-1', 'item-1', { name: 'Updated Name' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns updated item', async () => {
      const updatedRow: MarketplaceItemRow = { ...itemRow, name: 'Updated Name' };
      const pool = makePool([ok([]), ok([updatedRow])]);
      const svc = new MarketplaceItemService(pool);
      const result = await svc.updateItem('org-1', 'item-1', { name: 'Updated Name' });
      expect(result?.name).toBe('Updated Name');
    });

    it('returns null when item not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceItemService(pool);
      const result = await svc.updateItem('org-1', 'item-999', { name: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('publishItem', () => {
    it('returns item with pending_review status', async () => {
      const pendingRow: MarketplaceItemRow = { ...itemRow, status: 'pending_review' };
      const pool = makePool([ok([]), ok([pendingRow])]);
      const svc = new MarketplaceItemService(pool);
      const result = await svc.publishItem('org-1', 'item-1');
      expect(result?.status).toBe('pending_review');
    });

    it('returns null when item not found or not in draft status', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new MarketplaceItemService(pool);
      const result = await svc.publishItem('org-1', 'item-1');
      expect(result).toBeNull();
    });
  });

  describe('deleteItem', () => {
    it('returns true when item deleted', async () => {
      const pool = makePool([
        ok([]),
        { rows: [], rowCount: 1, command: 'DELETE', oid: 0, fields: [] },
      ]);
      const svc = new MarketplaceItemService(pool);
      const result = await svc.deleteItem('org-1', 'item-1');
      expect(result).toBe(true);
    });

    it('returns false when item not found', async () => {
      const pool = makePool([
        ok([]),
        { rows: [], rowCount: 0, command: 'DELETE', oid: 0, fields: [] },
      ]);
      const svc = new MarketplaceItemService(pool);
      const result = await svc.deleteItem('org-1', 'item-999');
      expect(result).toBe(false);
    });
  });
});
