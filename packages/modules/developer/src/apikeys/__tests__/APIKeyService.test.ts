import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { APIKeyService } from '../APIKeyService.js';

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

const baseRow = {
  id: 'key-1',
  organization_id: 'org-1',
  name: 'My Key',
  prefix: 'gx_abc123',
  hashed_secret: 'hash',
  scopes: ['read'],
  status: 'active',
  last_used_at: null,
  expires_at: null,
  created_by: 'user-1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('APIKeyService', () => {
  describe('generateKey', () => {
    it('inserts a new key and returns it with plainSecret', async () => {
      const pool = makePool([ok([]), ok([baseRow])]);
      const svc = new APIKeyService(pool);
      const result = await svc.generateKey({
        organizationId: 'org-1',
        name: 'My Key',
        scopes: ['read'],
        createdBy: 'user-1',
      });

      expect(result.id).toBe('key-1');
      expect(result.plainSecret).toBeDefined();
      expect(typeof result.plainSecret).toBe('string');
      expect(result.plainSecret.length).toBeGreaterThan(0);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new APIKeyService(pool);
      await expect(
        svc.generateKey({
          organizationId: 'org-1',
          name: 'My Key',
          scopes: ['read'],
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Failed to generate API key');
    });
  });

  describe('revokeKey', () => {
    it('updates status to revoked and returns the key', async () => {
      const revokedRow = { ...baseRow, status: 'revoked' };
      const pool = makePool([ok([]), ok([revokedRow])]);
      const svc = new APIKeyService(pool);
      const result = await svc.revokeKey('org-1', 'key-1');
      expect(result.status).toBe('revoked');
    });

    it('throws when key not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new APIKeyService(pool);
      await expect(svc.revokeKey('org-1', 'key-1')).rejects.toThrow('API key not found');
    });
  });

  describe('listKeys', () => {
    it('returns mapped keys', async () => {
      const pool = makePool([ok([]), ok([baseRow, { ...baseRow, id: 'key-2', name: 'Key 2' }])]);
      const svc = new APIKeyService(pool);
      const keys = await svc.listKeys('org-1');
      expect(keys).toHaveLength(2);
      expect(keys[0]?.id).toBe('key-1');
    });

    it('returns empty array when no keys', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new APIKeyService(pool);
      const keys = await svc.listKeys('org-1');
      expect(keys).toHaveLength(0);
    });
  });

  describe('getKey', () => {
    it('returns key when found', async () => {
      const pool = makePool([ok([]), ok([baseRow])]);
      const svc = new APIKeyService(pool);
      const key = await svc.getKey('org-1', 'key-1');
      expect(key?.id).toBe('key-1');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new APIKeyService(pool);
      const key = await svc.getKey('org-1', 'missing');
      expect(key).toBeNull();
    });

    it('maps optional fields when present', async () => {
      const rowWithDates = {
        ...baseRow,
        last_used_at: '2024-06-01T00:00:00Z',
        expires_at: '2025-01-01T00:00:00Z',
      };
      const pool = makePool([ok([]), ok([rowWithDates])]);
      const svc = new APIKeyService(pool);
      const key = await svc.getKey('org-1', 'key-1');
      expect(key?.lastUsedAt).toBe('2024-06-01T00:00:00Z');
      expect(key?.expiresAt).toBe('2025-01-01T00:00:00Z');
    });
  });

  describe('validateKey', () => {
    it('returns key when valid and updates last_used_at', async () => {
      const pool = makePool([ok([baseRow]), ok([])]);
      const svc = new APIKeyService(pool);
      const key = await svc.validateKey('gx_abc123_somesecret');
      expect(key?.id).toBe('key-1');
    });

    it('returns null when no matching key', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new APIKeyService(pool);
      const key = await svc.validateKey('invalid-key');
      expect(key).toBeNull();
    });
  });

  describe('hasScope', () => {
    it('returns true when key has exact scope', () => {
      const svc = new APIKeyService(makePool([]));
      const key = { ...baseRow, scopes: ['read', 'write'] } as Parameters<typeof svc.hasScope>[0];
      expect(svc.hasScope(key, 'read')).toBe(true);
    });

    it('returns true when key has wildcard scope', () => {
      const svc = new APIKeyService(makePool([]));
      const key = { ...baseRow, scopes: ['*'] } as Parameters<typeof svc.hasScope>[0];
      expect(svc.hasScope(key, 'delete')).toBe(true);
    });

    it('returns false when scope not present', () => {
      const svc = new APIKeyService(makePool([]));
      const key = { ...baseRow, scopes: ['read'] } as Parameters<typeof svc.hasScope>[0];
      expect(svc.hasScope(key, 'write')).toBe(false);
    });
  });
});
