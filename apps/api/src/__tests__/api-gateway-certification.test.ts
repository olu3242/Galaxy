/**
 * API Gateway OS Certification Test Suite
 *
 * Certifies the API Gateway module lifecycle:
 * 1.  gateway_routes and rate_limit_windows tables exist
 * 2.  Route registration persists a record
 * 3.  Route listing returns active routes
 * 4.  Route listing filters by API version
 * 5.  Route deactivation removes route from listing
 * 6.  Enterprise tier rate limit is always allowed
 * 7.  Basic tier rate limit tracks request count
 * 8.  getStatus reflects current usage
 * 9.  buildHeaders returns correct rate limit headers
 * 10. Two distinct API keys have independent rate limit counters
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { GatewayRouteService, GatewayRateLimitService } from '@galaxy/api-gateway';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4201-4000-8000-420000000001';
const apiKeyA = '00000000-4201-4000-8000-420000000010';
const apiKeyB = '00000000-4201-4000-8000-420000000011';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Gateway Test Org A', 'gateway-test-a', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId],
  );

  const svc = new GatewayRouteService(pool);
  await svc.registerRoute({
    path: '/api/v1/cert/shared',
    method: 'GET',
    version: 'v1',
    authRequired: true,
    rateLimitTier: 'basic',
    description: 'Shared cert route',
  });
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM rate_limit_windows WHERE api_key_id IN ($1, $2)`, [apiKeyA, apiKeyB])
    .catch(() => null);
  await pool.query(`DELETE FROM gateway_routes WHERE path LIKE '/api/v1/cert/%'`).catch(() => null);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]).catch(() => null);
  await pool.end();
});

describe('API Gateway OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. gateway_routes and rate_limit_windows tables exist', async () => {
    for (const table of ['gateway_routes', 'rate_limit_windows']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Route registration ─────────────────────────────────────────────────
  it('2. Route registration persists a record', async () => {
    const svc = new GatewayRouteService(pool);

    const route = await svc.registerRoute({
      path: '/api/v1/cert/new-route',
      method: 'POST',
      version: 'v1',
      authRequired: false,
      rateLimitTier: 'free',
      description: 'Cert new route',
    });

    expect(route.id).toBeTruthy();
    expect(route.path).toBe('/api/v1/cert/new-route');
    expect(route.method).toBe('POST');
    expect(route.isActive).toBe(true);
  });

  // ── 3. Route listing returns active routes ────────────────────────────────
  it('3. Route listing returns active routes', async () => {
    const svc = new GatewayRouteService(pool);

    const routes = await svc.listRoutes();
    expect(Array.isArray(routes)).toBe(true);
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.isActive).toBe(true);
    }
  });

  // ── 4. Route listing filters by version ──────────────────────────────────
  it('4. Route listing filters by API version', async () => {
    const svc = new GatewayRouteService(pool);

    const v1Routes = await svc.listRoutes('v1');
    for (const r of v1Routes) {
      expect(r.version).toBe('v1');
    }
  });

  // ── 5. Route deactivation removes route from listing ─────────────────────
  it('5. Route deactivation removes route from listing', async () => {
    const svc = new GatewayRouteService(pool);

    const route = await svc.registerRoute({
      path: '/api/v1/cert/to-remove',
      method: 'DELETE',
      version: 'v1',
      authRequired: true,
      rateLimitTier: 'basic',
      description: 'Route to deactivate',
    });

    await svc.unregisterRoute(route.id);

    const active = await svc.listRoutes();
    const found = active.some((r) => r.id === route.id);
    expect(found).toBe(false);
  });

  // ── 6. Enterprise tier is always allowed ──────────────────────────────────
  it('6. Enterprise tier rate limit is always allowed', async () => {
    const svc = new GatewayRateLimitService(pool);

    const result = await svc.incrementAndCheck(apiKeyA, orgId, 'enterprise');
    expect(result.allowed).toBe(true);
    expect(result.status.isUnlimited).toBe(true);
  });

  // ── 7. Basic tier tracks request count ────────────────────────────────────
  it('7. Basic tier rate limit tracks request count', async () => {
    const svc = new GatewayRateLimitService(pool);

    const first = await svc.incrementAndCheck(apiKeyA, orgId, 'basic');
    expect(first.allowed).toBe(true);
    expect(first.status.tier).toBe('basic');
    expect(first.status.isUnlimited).toBe(false);
  });

  // ── 8. getStatus reflects current usage ───────────────────────────────────
  it('8. getStatus reflects current usage', async () => {
    const svc = new GatewayRateLimitService(pool);

    const status = await svc.getStatus(apiKeyA, 'basic');
    expect(status.tier).toBe('basic');
    expect(status.limit).toBe(1000);
    expect(typeof status.remaining).toBe('number');
    expect(status.remaining).toBeLessThanOrEqual(1000);
  });

  // ── 9. buildHeaders returns correct headers ───────────────────────────────
  it('9. buildHeaders returns correct rate limit headers', async () => {
    const svc = new GatewayRateLimitService(pool);

    const status = await svc.getStatus(apiKeyA, 'basic');
    const headers = svc.buildHeaders(status);
    expect(headers['X-RateLimit-Limit']).toBeDefined();
    expect(headers['X-RateLimit-Remaining']).toBeDefined();
    expect(headers['X-RateLimit-Tier']).toBe('basic');
  });

  // ── 10. Two keys have independent counters ────────────────────────────────
  it('10. Two distinct API keys have independent rate limit counters', async () => {
    const svc = new GatewayRateLimitService(pool);

    await svc.incrementAndCheck(apiKeyA, orgId, 'basic');
    await svc.incrementAndCheck(apiKeyA, orgId, 'basic');

    const statusA = await svc.getStatus(apiKeyA, 'basic');
    const statusB = await svc.getStatus(apiKeyB, 'basic');

    expect(statusA.remaining).toBeLessThan(statusB.remaining);
  });
});
