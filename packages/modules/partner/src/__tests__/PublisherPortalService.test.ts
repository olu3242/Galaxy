import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PublisherPortalService } from '../publisher/PublisherPortalService.js';

const ORG = '00000000-0000-0000-0000-000000000005';

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

const makePayoutRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'payout-1',
  organization_id: ORG,
  amount: '500',
  status: 'pending',
  period: '2024-06',
  settled_at: null,
  created_at: '2024-06-01T00:00:00Z',
  ...overrides,
});

describe('PublisherPortalService.onboardPublisher', () => {
  it('sets tenant context and upserts publisher', async () => {
    const pool = makePool([ok([]), ok([{ id: 'pub-1' }])]);
    const svc = new PublisherPortalService(pool);
    const result = await svc.onboardPublisher({
      organizationId: ORG,
      displayName: 'Acme Publisher',
      email: 'pub@acme.com',
    });
    expect(result.publisherId).toBe('pub-1');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    expect(calls[1]?.[0]).toContain('ON CONFLICT');
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PublisherPortalService(pool);
    await expect(
      svc.onboardPublisher({ organizationId: ORG, displayName: 'X', email: 'x@x.com' }),
    ).rejects.toThrow('Failed to onboard publisher');
  });
});

describe('PublisherPortalService.getPublisherAnalytics', () => {
  it('returns parsed analytics from two queries', async () => {
    const itemsRow = {
      total_earnings: '1500',
      total_installs: '200',
      average_rating: '4.5',
      review_count: '30',
      item_count: '5',
    };
    const pendingRow = { pending_amount: '300' };
    // call 0: setTenant, call 1: itemsResult, call 2: pendingResult
    const pool = makePool([ok([]), ok([itemsRow]), ok([pendingRow])]);
    const svc = new PublisherPortalService(pool);
    const analytics = await svc.getPublisherAnalytics(ORG);
    expect(analytics.totalEarnings).toBe(1500);
    expect(analytics.pendingPayouts).toBe(300);
    expect(analytics.totalItems).toBe(5);
    expect(analytics.totalInstalls).toBe(200);
    expect(analytics.averageRating).toBe(4.5);
    expect(analytics.reviewCount).toBe(30);
  });

  it('defaults to zeros when no rows', async () => {
    const pool = makePool([ok([]), ok([]), ok([])]);
    const svc = new PublisherPortalService(pool);
    const analytics = await svc.getPublisherAnalytics(ORG);
    expect(analytics.totalEarnings).toBe(0);
    expect(analytics.totalItems).toBe(0);
  });
});

describe('PublisherPortalService.listPayouts', () => {
  it('returns mapped payout list', async () => {
    const rows = [makePayoutRow(), makePayoutRow({ id: 'payout-2', amount: '700' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new PublisherPortalService(pool);
    const result = await svc.listPayouts(ORG);
    expect(result).toHaveLength(2);
    expect(result[0]?.amount).toBe(500);
    expect(result[0]?.settledAt).toBeNull();
  });
});

describe('PublisherPortalService.createPayout', () => {
  it('inserts payout with pending status', async () => {
    const row = makePayoutRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PublisherPortalService(pool);
    const result = await svc.createPayout(ORG, 500, '2024-06');
    expect(result.status).toBe('pending');
    expect(result.amount).toBe(500);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    expect(calls[1]?.[0]).toContain("'pending'");
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PublisherPortalService(pool);
    await expect(svc.createPayout(ORG, 100, '2024-06')).rejects.toThrow('Failed to create payout');
  });
});

describe('PublisherPortalService.settlePayout', () => {
  it('sets status to settled and returns payout', async () => {
    const row = makePayoutRow({ status: 'settled', settled_at: '2024-06-15T00:00:00Z' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PublisherPortalService(pool);
    const result = await svc.settlePayout(ORG, 'payout-1');
    expect(result?.status).toBe('settled');
    expect(result?.settledAt).toBe('2024-06-15T00:00:00Z');
  });

  it('returns null when payout not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PublisherPortalService(pool);
    const result = await svc.settlePayout(ORG, 'missing');
    expect(result).toBeNull();
  });
});

describe('PublisherPortalService.resolvePublisherTier', () => {
  it('returns platinum for earnings >= 100000', async () => {
    const pool = makePool([ok([]), ok([{ total: '150000' }])]);
    const svc = new PublisherPortalService(pool);
    expect(await svc.resolvePublisherTier(ORG)).toBe('platinum');
  });

  it('returns gold for earnings >= 25000', async () => {
    const pool = makePool([ok([]), ok([{ total: '30000' }])]);
    const svc = new PublisherPortalService(pool);
    expect(await svc.resolvePublisherTier(ORG)).toBe('gold');
  });

  it('returns silver for earnings >= 5000', async () => {
    const pool = makePool([ok([]), ok([{ total: '10000' }])]);
    const svc = new PublisherPortalService(pool);
    expect(await svc.resolvePublisherTier(ORG)).toBe('silver');
  });

  it('returns registered for earnings < 5000', async () => {
    const pool = makePool([ok([]), ok([{ total: '1000' }])]);
    const svc = new PublisherPortalService(pool);
    expect(await svc.resolvePublisherTier(ORG)).toBe('registered');
  });

  it('returns registered when no earnings row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PublisherPortalService(pool);
    expect(await svc.resolvePublisherTier(ORG)).toBe('registered');
  });
});
