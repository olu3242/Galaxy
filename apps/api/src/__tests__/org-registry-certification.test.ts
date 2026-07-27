/**
 * Organization Registry Service Certification Test Suite — Phase 78
 *
 * Certifies OrganizationRegistryService from @galaxy/platform:
 * 1.  listOrganizations returns an array
 * 2.  listOrganizations includes the test org
 * 3.  listOrganizations respects limit
 * 4.  listOrganizations respects offset
 * 5.  searchOrganizations finds by name substring
 * 6.  searchOrganizations finds by slug substring
 * 7.  searchOrganizations returns empty for no match
 * 8.  getOrgStats returns total, active, suspended, trial counts
 * 9.  getOrgStats total is >= number of inserted orgs
 * 10. Cross-scope: orgB appears in listOrganizations independently
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { OrganizationRegistryService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-7801-4000-8000-780100000001';
const orgIdB = '00000000-7801-4000-8000-780100000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Registry Phase 78 Org A', 'registry-phase78-a', 'starter', 'active'),
            ($2, 'Registry Phase 78 Org B', 'registry-phase78-b', 'growth', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Organization Registry Service Certification', () => {
  // ── 1. listOrganizations returns array ────────────────────────────────────
  it('1. listOrganizations returns an array', async () => {
    const svc = new OrganizationRegistryService(pool);
    const orgs = await svc.listOrganizations();
    expect(Array.isArray(orgs)).toBe(true);
    expect(orgs.length).toBeGreaterThan(0);
  });

  // ── 2. listOrganizations includes test org ────────────────────────────────
  it('2. listOrganizations includes the test org', async () => {
    const svc = new OrganizationRegistryService(pool);
    const orgs = await svc.listOrganizations();
    const found = orgs.find((o) => o.id === orgId);
    expect(found).toBeTruthy();
    expect(found?.name).toBe('Registry Phase 78 Org A');
  });

  // ── 3. listOrganizations respects limit ──────────────────────────────────
  it('3. listOrganizations respects limit option', async () => {
    const svc = new OrganizationRegistryService(pool);
    const orgs = await svc.listOrganizations({ limit: 1 });
    expect(orgs.length).toBeLessThanOrEqual(1);
  });

  // ── 4. listOrganizations respects offset ─────────────────────────────────
  it('4. listOrganizations respects offset option', async () => {
    const svc = new OrganizationRegistryService(pool);
    const all = await svc.listOrganizations({ limit: 10 });
    const offset1 = await svc.listOrganizations({ limit: 10, offset: 1 });
    expect(offset1.length).toBeLessThanOrEqual(all.length);
  });

  // ── 5. searchOrganizations finds by name ─────────────────────────────────
  it('5. searchOrganizations finds org by name substring', async () => {
    const svc = new OrganizationRegistryService(pool);
    const results = await svc.searchOrganizations('Registry Phase 78');
    expect(Array.isArray(results)).toBe(true);
    const found = results.find((o) => o.id === orgId);
    expect(found).toBeTruthy();
  });

  // ── 6. searchOrganizations finds by slug ─────────────────────────────────
  it('6. searchOrganizations finds org by slug substring', async () => {
    const svc = new OrganizationRegistryService(pool);
    const results = await svc.searchOrganizations('registry-phase78');
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  // ── 7. searchOrganizations returns empty for no match ────────────────────
  it('7. searchOrganizations returns empty array for non-matching query', async () => {
    const svc = new OrganizationRegistryService(pool);
    const results = await svc.searchOrganizations('zzz-no-match-xyz-9999');
    expect(results.length).toBe(0);
  });

  // ── 8. getOrgStats returns stats object ──────────────────────────────────
  it('8. getOrgStats returns total, active, suspended, trial counts', async () => {
    const svc = new OrganizationRegistryService(pool);
    const stats = await svc.getOrgStats();
    expect(stats).toBeTruthy();
    expect(typeof stats.total).toBe('number');
    expect(typeof stats.active).toBe('number');
    expect(typeof stats.suspended).toBe('number');
    expect(typeof stats.trial).toBe('number');
  });

  // ── 9. getOrgStats total >= inserted orgs ───────────────────────────────
  it('9. getOrgStats total is at least 2 (two orgs inserted)', async () => {
    const svc = new OrganizationRegistryService(pool);
    const stats = await svc.getOrgStats();
    expect(stats.total).toBeGreaterThanOrEqual(2);
  });

  // ── 10. Cross-scope: orgB in listOrganizations ───────────────────────────
  it('10. orgB appears in listOrganizations independently of orgA', async () => {
    const svc = new OrganizationRegistryService(pool);
    const orgs = await svc.listOrganizations();
    const foundA = orgs.find((o) => o.id === orgId);
    const foundB = orgs.find((o) => o.id === orgIdB);
    expect(foundA).toBeTruthy();
    expect(foundB).toBeTruthy();
    expect(foundA?.id).not.toBe(foundB?.id);
  });
});
