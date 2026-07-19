/**
 * Developer OS — APIKeyService unit tests
 *
 * Covers: generateKey · rotateKey · revokeKey · listKeys · getKey · validateKey · hasScope
 */
import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import type { Pool, QueryResult } from 'pg';
import { APIKeyService } from '../apikeys/APIKeyService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const KEY_ID = '00000000-0000-0000-0000-000000000010';
const NOW = '2026-01-01T00:00:00.000Z';

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

function keyRow(
  overrides: Partial<{
    status: string;
    scopes: string[];
    prefix: string;
    hashed_secret: string;
  }> = {},
) {
  return {
    id: KEY_ID,
    organization_id: ORG,
    name: 'My API Key',
    prefix: overrides.prefix ?? 'gx_abc12345',
    hashed_secret: overrides.hashed_secret ?? 'hash-placeholder',
    scopes: overrides.scopes ?? ['read', 'write'],
    status: overrides.status ?? 'active',
    last_used_at: null,
    expires_at: null,
    created_by: 'user-1',
    created_at: NOW,
    updated_at: NOW,
  };
}

// ─── generateKey ──────────────────────────────────────────────────────────────

describe('APIKeyService.generateKey', () => {
  it('sets tenant context and returns key with plainSecret', async () => {
    const pool = makePool([ok([]), ok([keyRow()])]);
    const svc = new APIKeyService(pool);
    const result = await svc.generateKey({
      organizationId: ORG,
      name: 'My API Key',
      scopes: ['read', 'write'],
      createdBy: 'user-1',
    });

    expect(result.id).toBe(KEY_ID);
    expect(result.status).toBe('active');
    expect(result.plainSecret).toMatch(/^gx_[a-f0-9]{8}_[a-f0-9]{64}$/);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new APIKeyService(pool);
    await expect(
      svc.generateKey({ organizationId: ORG, name: 'X', scopes: [], createdBy: 'u1' }),
    ).rejects.toThrow('Failed to generate API key');
  });
});

// ─── rotateKey ────────────────────────────────────────────────────────────────

describe('APIKeyService.rotateKey', () => {
  it('returns new plainSecret with same prefix', async () => {
    const prefix = 'gx_abc12345';
    const pool = makePool([
      ok([]), // set_config (rotateKey)
      ok([]), // set_config (inner getKey)
      ok([keyRow({ prefix })]), // SELECT (inner getKey)
      ok([keyRow({ prefix })]), // UPDATE
    ]);
    const svc = new APIKeyService(pool);
    const result = await svc.rotateKey(ORG, KEY_ID);

    expect(result.plainSecret).toMatch(new RegExp(`^${prefix}_[a-f0-9]{64}$`));
  });

  it('throws when key not found', async () => {
    const pool = makePool([
      ok([]), // set_config (rotateKey)
      ok([]), // set_config (inner getKey)
      ok([]), // SELECT (returns nothing)
    ]);
    const svc = new APIKeyService(pool);
    await expect(svc.rotateKey(ORG, 'ghost')).rejects.toThrow('API key not found');
  });
});

// ─── revokeKey ────────────────────────────────────────────────────────────────

describe('APIKeyService.revokeKey', () => {
  it('returns key with revoked status', async () => {
    const pool = makePool([ok([]), ok([keyRow({ status: 'revoked' })])]);
    const svc = new APIKeyService(pool);
    const result = await svc.revokeKey(ORG, KEY_ID);
    expect(result.status).toBe('revoked');
  });

  it('throws when key not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new APIKeyService(pool);
    await expect(svc.revokeKey(ORG, 'ghost')).rejects.toThrow('API key not found');
  });
});

// ─── listKeys ─────────────────────────────────────────────────────────────────

describe('APIKeyService.listKeys', () => {
  it('returns active keys for org', async () => {
    const pool = makePool([ok([]), ok([keyRow(), keyRow()])]);
    const svc = new APIKeyService(pool);
    const result = await svc.listKeys(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when none exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new APIKeyService(pool);
    const result = await svc.listKeys(ORG);
    expect(result).toHaveLength(0);
  });
});

// ─── getKey ───────────────────────────────────────────────────────────────────

describe('APIKeyService.getKey', () => {
  it('returns key when found', async () => {
    const pool = makePool([ok([]), ok([keyRow()])]);
    const svc = new APIKeyService(pool);
    const result = await svc.getKey(ORG, KEY_ID);
    expect(result?.id).toBe(KEY_ID);
    expect(result?.scopes).toEqual(['read', 'write']);
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new APIKeyService(pool);
    const result = await svc.getKey(ORG, 'ghost');
    expect(result).toBeNull();
  });
});

// ─── validateKey ──────────────────────────────────────────────────────────────

describe('APIKeyService.validateKey', () => {
  it('returns key when hash matches and key is active', async () => {
    const plainKey = 'gx_abc12345_' + 'a'.repeat(64);
    const hashedSecret = createHash('sha256').update(plainKey).digest('hex');
    const pool = makePool([ok([keyRow({ hashed_secret: hashedSecret })]), ok([])]);
    const svc = new APIKeyService(pool);
    const result = await svc.validateKey(plainKey);
    expect(result?.id).toBe(KEY_ID);
  });

  it('returns null when no matching key found', async () => {
    const pool = makePool([ok([])]);
    const svc = new APIKeyService(pool);
    const result = await svc.validateKey('gx_bad_key');
    expect(result).toBeNull();
  });
});

// ─── hasScope ─────────────────────────────────────────────────────────────────

describe('APIKeyService.hasScope', () => {
  it('returns true when key has exact scope', () => {
    const svc = new APIKeyService({} as Pool);
    const key = { scopes: ['read', 'write'] } as Parameters<typeof svc.hasScope>[0];
    expect(svc.hasScope(key, 'read')).toBe(true);
  });

  it('returns false when scope not present', () => {
    const svc = new APIKeyService({} as Pool);
    const key = { scopes: ['read'] } as Parameters<typeof svc.hasScope>[0];
    expect(svc.hasScope(key, 'admin')).toBe(false);
  });

  it('returns true when key has wildcard scope', () => {
    const svc = new APIKeyService({} as Pool);
    const key = { scopes: ['*'] } as Parameters<typeof svc.hasScope>[0];
    expect(svc.hasScope(key, 'admin')).toBe(true);
  });
});
