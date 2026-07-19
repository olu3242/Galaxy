import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ReviewService } from '../ReviewService.js';
import type { ReviewRow } from '../../types.js';

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

const reviewRow: ReviewRow = {
  id: 'rev-1',
  organization_id: 'org-1',
  marketplace_item_id: 'item-1',
  author_id: 'user-1',
  rating: '5',
  title: 'Excellent',
  body: 'Works great',
  status: 'pending',
  moderated_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('ReviewService', () => {
  describe('submitReview', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([reviewRow])]);
      const svc = new ReviewService(pool);
      await svc.submitReview({
        organizationId: 'org-1',
        marketplaceItemId: 'item-1',
        authorId: 'user-1',
        rating: 5,
        title: 'Excellent',
        body: 'Works great',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
      expect(((calls[0]?.[1] ?? []) as string[])[1]).toBe('org-1');
    });

    it('returns mapped review on success', async () => {
      const pool = makePool([ok([]), ok([reviewRow])]);
      const svc = new ReviewService(pool);
      const result = await svc.submitReview({
        organizationId: 'org-1',
        marketplaceItemId: 'item-1',
        authorId: 'user-1',
        rating: 5,
        title: 'Excellent',
        body: 'Works great',
      });
      expect(result.id).toBe('rev-1');
      expect(result.rating).toBe(5);
      expect(result.status).toBe('pending');
      expect(result.moderatedAt).toBeNull();
    });

    it('throws when rating is below 1', async () => {
      const pool = makePool([ok([])]);
      const svc = new ReviewService(pool);
      await expect(
        svc.submitReview({
          organizationId: 'org-1',
          marketplaceItemId: 'item-1',
          authorId: 'user-1',
          rating: 0,
          title: 'Bad',
          body: 'Too low',
        }),
      ).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('throws when rating is above 5', async () => {
      const pool = makePool([ok([])]);
      const svc = new ReviewService(pool);
      await expect(
        svc.submitReview({
          organizationId: 'org-1',
          marketplaceItemId: 'item-1',
          authorId: 'user-1',
          rating: 6,
          title: 'Too high',
          body: 'Out of range',
        }),
      ).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ReviewService(pool);
      await expect(
        svc.submitReview({
          organizationId: 'org-1',
          marketplaceItemId: 'item-1',
          authorId: 'user-1',
          rating: 4,
          title: 'Good',
          body: 'Nice',
        }),
      ).rejects.toThrow('Failed to submit review');
    });
  });

  describe('moderateReview', () => {
    it('sets tenant context as first query', async () => {
      const approvedRow: ReviewRow = {
        ...reviewRow,
        status: 'approved',
        moderated_at: '2024-01-02T00:00:00Z',
      };
      // [0] set_config, [1] UPDATE reviews RETURNING, [2] recalculateRating UPDATE marketplace_items
      const pool = makePool([ok([]), ok([approvedRow]), ok([])]);
      const svc = new ReviewService(pool);
      await svc.moderateReview('org-1', 'rev-1', 'approved');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns approved review and triggers rating recalculation', async () => {
      const approvedRow: ReviewRow = {
        ...reviewRow,
        status: 'approved',
        moderated_at: '2024-01-02T00:00:00Z',
      };
      const pool = makePool([ok([]), ok([approvedRow]), ok([])]);
      const svc = new ReviewService(pool);
      const result = await svc.moderateReview('org-1', 'rev-1', 'approved');
      expect(result?.status).toBe('approved');
      // recalculateRating should have been called (3 total queries)
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls).toHaveLength(3);
    });

    it('returns rejected review without recalculation', async () => {
      const rejectedRow: ReviewRow = {
        ...reviewRow,
        status: 'rejected',
        moderated_at: '2024-01-02T00:00:00Z',
      };
      const pool = makePool([ok([]), ok([rejectedRow])]);
      const svc = new ReviewService(pool);
      const result = await svc.moderateReview('org-1', 'rev-1', 'rejected');
      expect(result?.status).toBe('rejected');
      // no recalculation — only 2 queries
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls).toHaveLength(2);
    });

    it('returns null when review not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ReviewService(pool);
      const result = await svc.moderateReview('org-1', 'rev-999', 'approved');
      expect(result).toBeNull();
    });
  });

  describe('listReviews', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([reviewRow])]);
      const svc = new ReviewService(pool);
      await svc.listReviews('org-1', 'item-1', {});
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns all mapped reviews', async () => {
      const pool = makePool([ok([]), ok([reviewRow, { ...reviewRow, id: 'rev-2' }])]);
      const svc = new ReviewService(pool);
      const results = await svc.listReviews('org-1', 'item-1', {});
      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('rev-1');
    });

    it('returns empty array when no reviews', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ReviewService(pool);
      const results = await svc.listReviews('org-1', 'item-1', {});
      expect(results).toHaveLength(0);
    });

    it('adds status filter when provided', async () => {
      const pool = makePool([ok([]), ok([reviewRow])]);
      const svc = new ReviewService(pool);
      await svc.listReviews('org-1', 'item-1', { status: 'approved' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[1]?.[0] as string).toContain('status');
    });
  });
});
