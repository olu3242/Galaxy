import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { OrganizationService } from '../OrganizationService.js';

function makePool(rows: unknown[] = []): Pool {
  const query = vi
    .fn()
    .mockResolvedValue({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] });
  return { query } as unknown as Pool;
}

describe('OrganizationService', () => {
  let pool: Pool;
  let service: OrganizationService;

  const orgRow = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Org',
    slug: 'test-org',
    tier: 'starter',
    status: 'active',
    waba_phone_number_id: null,
    waba_access_token_ref: null,
    settings: { industryType: 'church' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    pool = makePool([orgRow]);
    service = new OrganizationService(pool);
  });

  describe('create', () => {
    it('inserts organization and returns typed domain object', async () => {
      const org = await service.create({
        name: 'Test Org',
        slug: 'test-org',
        industryType: 'church',
        correlationId: '00000000-0000-0000-0000-000000000099',
        actorId: '00000000-0000-0000-0000-000000000002',
      });

      expect(org.id).toBe(orgRow.id);
      expect(org.name).toBe('Test Org');
      expect(org.slug).toBe('test-org');
      expect(org.isActive).toBe(true);
    });

    it('calls INSERT with parameterized query (no interpolation)', async () => {
      await service.create({
        name: 'Test Org',
        slug: 'test-org',
        industryType: 'church',
        correlationId: '00000000-0000-0000-0000-000000000099',
        actorId: '00000000-0000-0000-0000-000000000002',
      });

      const query = pool.query as ReturnType<typeof vi.fn>;
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('$1');
      expect(sql).not.toContain("'test-org'");
      expect(params).toContain('test-org');
    });
  });

  describe('getById', () => {
    it('returns null when org not found', async () => {
      const emptyPool = makePool([]);
      const emptyService = new OrganizationService(emptyPool);
      const result = await emptyService.getById('non-existent');
      expect(result).toBeNull();
    });

    it('returns mapped organization', async () => {
      const org = await service.getById(orgRow.id);
      expect(org).not.toBeNull();
      expect(org?.id).toBe(orgRow.id);
      expect(org?.planTier).toBe('starter');
    });
  });
});
