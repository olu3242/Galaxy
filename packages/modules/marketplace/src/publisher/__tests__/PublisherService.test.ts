import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PublisherService } from '../PublisherService.js';
import type { PublisherRow } from '../../types.js';

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

const publisherRow: PublisherRow = {
  id: 'pub-1',
  organization_id: 'org-1',
  display_name: 'Acme Corp',
  email: 'publisher@acme.com',
  status: 'pending',
  verified_at: null,
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('PublisherService', () => {
  describe('registerPublisher', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([publisherRow])]);
      const svc = new PublisherService(pool);
      await svc.registerPublisher({
        organizationId: 'org-1',
        displayName: 'Acme Corp',
        email: 'publisher@acme.com',
        metadata: {},
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
      expect(((calls[0]?.[1] ?? []) as string[])[1]).toBe('org-1');
    });

    it('returns mapped publisher on success', async () => {
      const pool = makePool([ok([]), ok([publisherRow])]);
      const svc = new PublisherService(pool);
      const result = await svc.registerPublisher({
        organizationId: 'org-1',
        displayName: 'Acme Corp',
        email: 'publisher@acme.com',
        metadata: {},
      });
      expect(result.id).toBe('pub-1');
      expect(result.status).toBe('pending');
      expect(result.verifiedAt).toBeNull();
      expect(result.displayName).toBe('Acme Corp');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PublisherService(pool);
      await expect(
        svc.registerPublisher({
          organizationId: 'org-1',
          displayName: 'Acme Corp',
          email: 'publisher@acme.com',
          metadata: {},
        }),
      ).rejects.toThrow('Failed to register publisher');
    });
  });

  describe('getPublisher', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([publisherRow])]);
      const svc = new PublisherService(pool);
      await svc.getPublisher('org-1', 'pub-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns mapped publisher when found', async () => {
      const pool = makePool([ok([]), ok([publisherRow])]);
      const svc = new PublisherService(pool);
      const result = await svc.getPublisher('org-1', 'pub-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('pub-1');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PublisherService(pool);
      const result = await svc.getPublisher('org-1', 'pub-999');
      expect(result).toBeNull();
    });
  });

  describe('listPublishers', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([publisherRow])]);
      const svc = new PublisherService(pool);
      await svc.listPublishers('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns all mapped publishers', async () => {
      const pool = makePool([ok([]), ok([publisherRow, { ...publisherRow, id: 'pub-2' }])]);
      const svc = new PublisherService(pool);
      const results = await svc.listPublishers('org-1');
      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('pub-1');
    });

    it('returns empty array when no publishers', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PublisherService(pool);
      const results = await svc.listPublishers('org-1');
      expect(results).toHaveLength(0);
    });
  });

  describe('approvePublisher', () => {
    it('sets tenant context as first query', async () => {
      const approvedRow: PublisherRow = {
        ...publisherRow,
        status: 'approved',
        verified_at: '2024-01-02T00:00:00Z',
      };
      const pool = makePool([ok([]), ok([approvedRow])]);
      const svc = new PublisherService(pool);
      await svc.approvePublisher('org-1', 'pub-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0] as string).toContain('set_config');
    });

    it('returns approved publisher', async () => {
      const approvedRow: PublisherRow = {
        ...publisherRow,
        status: 'approved',
        verified_at: '2024-01-02T00:00:00Z',
      };
      const pool = makePool([ok([]), ok([approvedRow])]);
      const svc = new PublisherService(pool);
      const result = await svc.approvePublisher('org-1', 'pub-1');
      expect(result?.status).toBe('approved');
      expect(result?.verifiedAt).toBe('2024-01-02T00:00:00Z');
    });

    it('returns null when publisher not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PublisherService(pool);
      const result = await svc.approvePublisher('org-1', 'pub-999');
      expect(result).toBeNull();
    });
  });

  describe('suspendPublisher', () => {
    it('returns suspended publisher', async () => {
      const suspendedRow: PublisherRow = { ...publisherRow, status: 'suspended' };
      const pool = makePool([ok([]), ok([suspendedRow])]);
      const svc = new PublisherService(pool);
      const result = await svc.suspendPublisher('org-1', 'pub-1');
      expect(result?.status).toBe('suspended');
    });

    it('returns null when publisher not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PublisherService(pool);
      const result = await svc.suspendPublisher('org-1', 'pub-999');
      expect(result).toBeNull();
    });
  });
});
