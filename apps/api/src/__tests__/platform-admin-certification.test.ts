/**
 * Platform Admin OS Certification Test Suite
 *
 * Certifies the Platform Admin / Feature Flag module lifecycle:
 * 1.  feature_flags table exists
 * 2.  createFlag persists a record with isEnabled=false by default
 * 3.  getFlag returns the flag by key
 * 4.  listFlags returns active flags
 * 5.  toggleFlag enables a flag
 * 6.  isFlagEnabled reflects toggled state
 * 7.  toggleFlag disables a flag
 * 8.  listFlags filters by scope
 * 9.  deleteFlag removes the flag
 * 10. getFlag returns null for unknown key
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { FeatureFlagService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const certFlagKey = 'cert-platform-admin-flag-46';
const certFlagKey2 = 'cert-platform-admin-flag-46-b';
const certFlagKey3 = 'cert-platform-admin-flag-46-scoped';

let sharedFlagId: string;

beforeAll(async () => {
  const svc = new FeatureFlagService(pool);
  const flag = await svc.createFlag({
    key: certFlagKey,
    description: 'Shared cert flag for platform admin tests',
    scope: 'global',
  });
  sharedFlagId = flag.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM feature_flags WHERE key IN ($1, $2, $3)`, [
      certFlagKey,
      certFlagKey2,
      certFlagKey3,
    ])
    .catch(() => null);
  await pool.end();
});

describe('Platform Admin OS Certification', () => {
  // ── 1. Table exists ────────────────────────────────────────────────────────
  it('1. feature_flags table exists', async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'feature_flags' AND table_schema = 'public'`,
    );
    expect(Number(r.rows[0]?.count ?? 0), 'feature_flags must have columns').toBeGreaterThan(0);
  });

  // ── 2. createFlag defaults isEnabled to false ─────────────────────────────
  it('2. createFlag persists a record with isEnabled=false by default', async () => {
    const svc = new FeatureFlagService(pool);

    const flag = await svc.createFlag({
      key: certFlagKey2,
      description: 'Second cert flag',
      scope: 'global',
    });

    expect(flag.id).toBeTruthy();
    expect(flag.key).toBe(certFlagKey2);
    expect(flag.isEnabled).toBe(false);
  });

  // ── 3. getFlag returns the flag by key ───────────────────────────────────
  it('3. getFlag returns the flag by key', async () => {
    const svc = new FeatureFlagService(pool);

    const flag = await svc.getFlag(certFlagKey);
    expect(flag).not.toBeNull();
    expect(flag?.key).toBe(certFlagKey);
    expect(flag?.id).toBe(sharedFlagId);
  });

  // ── 4. listFlags returns active flags ────────────────────────────────────
  it('4. listFlags returns active flags', async () => {
    const svc = new FeatureFlagService(pool);

    const flags = await svc.listFlags();
    expect(Array.isArray(flags)).toBe(true);
    expect(flags.length).toBeGreaterThan(0);
    const keys = flags.map((f) => f.key);
    expect(keys).toContain(certFlagKey);
  });

  // ── 5. toggleFlag enables a flag ─────────────────────────────────────────
  it('5. toggleFlag enables a flag', async () => {
    const svc = new FeatureFlagService(pool);

    const updated = await svc.toggleFlag(sharedFlagId, true);
    expect(updated).not.toBeNull();
    expect(updated?.isEnabled).toBe(true);
  });

  // ── 6. isFlagEnabled reflects toggled state ───────────────────────────────
  it('6. isFlagEnabled reflects toggled state', async () => {
    const svc = new FeatureFlagService(pool);

    const enabled = await svc.isFlagEnabled(certFlagKey);
    expect(enabled).toBe(true);
  });

  // ── 7. toggleFlag disables a flag ────────────────────────────────────────
  it('7. toggleFlag disables a flag', async () => {
    const svc = new FeatureFlagService(pool);

    const updated = await svc.toggleFlag(sharedFlagId, false);
    expect(updated?.isEnabled).toBe(false);

    const enabled = await svc.isFlagEnabled(certFlagKey);
    expect(enabled).toBe(false);
  });

  // ── 8. listFlags filters by scope ────────────────────────────────────────
  it('8. listFlags filters by scope', async () => {
    const svc = new FeatureFlagService(pool);

    await svc.createFlag({ key: certFlagKey3, scope: 'beta', description: 'Beta scoped flag' });

    const betaFlags = await svc.listFlags({ scope: 'beta' });
    for (const f of betaFlags) {
      expect(f.scope).toBe('beta');
    }
    const betaKeys = betaFlags.map((f) => f.key);
    expect(betaKeys).toContain(certFlagKey3);
  });

  // ── 9. deleteFlag removes the flag ───────────────────────────────────────
  it('9. deleteFlag removes the flag', async () => {
    const svc = new FeatureFlagService(pool);

    const flag = await svc.createFlag({ key: 'cert-platform-admin-to-delete-46', scope: 'global' });
    const deleted = await svc.deleteFlag(flag.id);
    expect(deleted).toBe(true);

    const found = await svc.getFlag('cert-platform-admin-to-delete-46');
    expect(found).toBeNull();
  });

  // ── 10. getFlag returns null for unknown key ──────────────────────────────
  it('10. getFlag returns null for unknown key', async () => {
    const svc = new FeatureFlagService(pool);

    const flag = await svc.getFlag('cert-platform-admin-nonexistent-key-xyz');
    expect(flag).toBeNull();
  });
});
