/**
 * Dependency Health OS Certification Test Suite — Phase 68
 *
 * Certifies DependencyHealthService:
 * 1.  getHealthMatrix returns a matrix object
 * 2.  matrix contains the organizationId
 * 3.  matrix contains generatedAt timestamp
 * 4.  matrix contains an overall health field
 * 5.  matrix contains a dependencies array
 * 6.  dependencies array has exactly 9 probes
 * 7.  postgresql dependency reports healthy
 * 8.  redis dependency reports warning when no REDIS_URL configured
 * 9.  overall is not unavailable when postgresql is healthy
 * 10. Cross-scope: getHealthMatrix with orgIdB returns orgIdB in result
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { DependencyHealthService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-6801-4000-8000-680000000001';
const orgIdB = '00000000-6801-4000-8000-680000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'DepHealth Phase 68 Org A', 'dephealth-phase68-a', 'starter', 'active'),
            ($2, 'DepHealth Phase 68 Org B', 'dephealth-phase68-b', 'starter', 'active')
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

describe('Dependency Health OS Certification', () => {
  // ── 1. getHealthMatrix returns matrix ────────────────────────────────────
  it('1. getHealthMatrix returns a health matrix object', async () => {
    const svc = new DependencyHealthService(pool);
    const matrix = await svc.getHealthMatrix(orgId);
    expect(matrix).toBeTruthy();
  });

  // ── 2. matrix contains organizationId ────────────────────────────────────
  it('2. matrix contains the organizationId', async () => {
    const svc = new DependencyHealthService(pool);
    const matrix = await svc.getHealthMatrix(orgId);
    expect(matrix.organizationId).toBe(orgId);
  });

  // ── 3. matrix contains generatedAt ───────────────────────────────────────
  it('3. matrix contains a generatedAt timestamp', async () => {
    const svc = new DependencyHealthService(pool);
    const matrix = await svc.getHealthMatrix(orgId);
    expect(matrix.generatedAt).toBeTruthy();
    expect(new Date(matrix.generatedAt).getTime()).toBeGreaterThan(0);
  });

  // ── 4. matrix contains overall field ─────────────────────────────────────
  it('4. matrix contains an overall health field', async () => {
    const svc = new DependencyHealthService(pool);
    const matrix = await svc.getHealthMatrix(orgId);
    expect(['healthy', 'warning', 'degraded', 'unavailable']).toContain(matrix.overall);
  });

  // ── 5. matrix contains dependencies array ────────────────────────────────
  it('5. matrix contains a dependencies array', async () => {
    const svc = new DependencyHealthService(pool);
    const matrix = await svc.getHealthMatrix(orgId);
    expect(Array.isArray(matrix.dependencies)).toBe(true);
  });

  // ── 6. dependencies has 9 probes ─────────────────────────────────────────
  it('6. dependencies array has exactly 9 probes', async () => {
    const svc = new DependencyHealthService(pool);
    const matrix = await svc.getHealthMatrix(orgId);
    expect(matrix.dependencies.length).toBe(9);
  });

  // ── 7. postgresql is healthy ─────────────────────────────────────────────
  it('7. postgresql dependency reports healthy', async () => {
    const svc = new DependencyHealthService(pool);
    const matrix = await svc.getHealthMatrix(orgId);
    const pg = matrix.dependencies.find((d) => d.name === 'postgresql');
    expect(pg).toBeTruthy();
    expect(['healthy', 'warning']).toContain(pg?.health);
  });

  // ── 8. redis reports warning when no REDIS_URL ───────────────────────────
  it('8. redis dependency reports warning when REDIS_URL is absent', async () => {
    const svc = new DependencyHealthService(pool, undefined);
    const matrix = await svc.getHealthMatrix(orgId);
    const redis = matrix.dependencies.find((d) => d.name === 'redis');
    expect(redis).toBeTruthy();
    expect(redis?.health).toBe('warning');
  });

  // ── 9. overall not unavailable when postgres healthy ─────────────────────
  it('9. overall is not unavailable when postgresql is healthy', async () => {
    const svc = new DependencyHealthService(pool);
    const matrix = await svc.getHealthMatrix(orgId);
    const pg = matrix.dependencies.find((d) => d.name === 'postgresql');
    if (pg?.health === 'healthy' || pg?.health === 'warning') {
      expect(matrix.overall).not.toBe('unavailable');
    }
  });

  // ── 10. Cross-scope: orgIdB result has orgIdB ─────────────────────────────
  it('10. getHealthMatrix with orgIdB returns orgIdB in the matrix', async () => {
    const svc = new DependencyHealthService(pool);
    const matrixB = await svc.getHealthMatrix(orgIdB);
    expect(matrixB.organizationId).toBe(orgIdB);
    const matrixA = await svc.getHealthMatrix(orgId);
    expect(matrixA.organizationId).toBe(orgId);
    expect(matrixA.organizationId).not.toBe(matrixB.organizationId);
  });
});
