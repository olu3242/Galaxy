import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { MembershipService } from '../MembershipService.js';

function makePool(rows: unknown[] = []): Pool {
  const query = vi
    .fn()
    .mockResolvedValue({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] });
  return { query } as unknown as Pool;
}

const membershipRow = {
  id: '00000000-0000-0000-0000-000000000010',
  organization_id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  role_id: null,
  status: 'active',
  joined_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('MembershipService', () => {
  let pool: Pool;
  let service: MembershipService;

  beforeEach(() => {
    pool = makePool([membershipRow]);
    service = new MembershipService(pool);
  });

  describe('addMember', () => {
    it('sets tenant context before inserting', async () => {
      await service.addMember({
        organizationId: membershipRow.organization_id,
        userId: membershipRow.user_id,
        correlationId: '00000000-0000-0000-0000-000000000099',
        actorId: 'system',
      });

      const query = pool.query as ReturnType<typeof vi.fn>;
      const firstCall = query.mock.calls[0] as [string, string[]];
      expect(firstCall[0]).toContain('set_config');
      expect(firstCall[1]).toContain('app.current_tenant');
      expect(firstCall[1]).toContain(membershipRow.organization_id);
    });

    it('returns membership with correct fields', async () => {
      const membership = await service.addMember({
        organizationId: membershipRow.organization_id,
        userId: membershipRow.user_id,
        correlationId: '00000000-0000-0000-0000-000000000099',
        actorId: 'system',
      });

      expect(membership.id).toBe(membershipRow.id);
      expect(membership.organizationId).toBe(membershipRow.organization_id);
      expect(membership.userId).toBe(membershipRow.user_id);
      expect(membership.status).toBe('active');
    });
  });

  describe('getMembership', () => {
    it('returns null when not found', async () => {
      const emptyPool = makePool([]);
      const emptyService = new MembershipService(emptyPool);
      const result = await emptyService.getMembership('org-id', 'user-id');
      expect(result).toBeNull();
    });
  });
});
