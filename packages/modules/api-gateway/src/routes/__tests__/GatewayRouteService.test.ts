import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GatewayRouteService } from '../GatewayRouteService.js';

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
  id: 'route-1',
  path: '/api/v1/users',
  method: 'GET',
  version: 'v1',
  auth_required: true,
  rate_limit_tier: 'free',
  description: 'List users',
  is_active: true,
  created_at: new Date('2025-01-01T00:00:00.000Z'),
};

describe('GatewayRouteService.registerRoute', () => {
  it('inserts and returns the route', async () => {
    const pool = makePool([ok([baseRow])]);
    const svc = new GatewayRouteService(pool);

    const route = await svc.registerRoute({
      path: '/api/v1/users',
      method: 'GET',
      version: 'v1',
      authRequired: true,
      rateLimitTier: 'free',
      description: 'List users',
    });

    expect(route.id).toBe('route-1');
    expect(route.path).toBe('/api/v1/users');
    expect(route.method).toBe('GET');
    expect(route.version).toBe('v1');
    expect(route.authRequired).toBe(true);
    expect(route.rateLimitTier).toBe('free');
    expect(route.isActive).toBe(true);
    expect(route.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('throws when DB returns no rows', async () => {
    const pool = makePool([ok([])]);
    const svc = new GatewayRouteService(pool);

    await expect(
      svc.registerRoute({
        path: '/api/v1/test',
        method: 'POST',
        version: 'v1',
        authRequired: false,
        rateLimitTier: 'basic',
        description: 'Test route',
      }),
    ).rejects.toThrow('Failed to insert gateway route');
  });

  it('passes correct params to DB', async () => {
    const pool = makePool([ok([baseRow])]);
    const svc = new GatewayRouteService(pool);

    await svc.registerRoute({
      path: '/api/v2/items',
      method: 'DELETE',
      version: 'v2',
      authRequired: true,
      rateLimitTier: 'pro',
      description: 'Delete item',
    });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[0]?.[1] ?? []) as unknown[];
    expect(params[0]).toBe('/api/v2/items');
    expect(params[1]).toBe('DELETE');
    expect(params[2]).toBe('v2');
    expect(params[3]).toBe(true);
    expect(params[4]).toBe('pro');
    expect(params[5]).toBe('Delete item');
  });
});

describe('GatewayRouteService.unregisterRoute', () => {
  it('calls UPDATE with the correct route id', async () => {
    const pool = makePool([ok([])]);
    const svc = new GatewayRouteService(pool);

    await svc.unregisterRoute('route-99');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[0]?.[1] ?? []) as unknown[];
    expect(params[0]).toBe('route-99');
  });
});

describe('GatewayRouteService.listRoutes', () => {
  it('returns all active routes when no version filter', async () => {
    const pool = makePool([ok([baseRow, { ...baseRow, id: 'route-2', method: 'POST' }])]);
    const svc = new GatewayRouteService(pool);

    const routes = await svc.listRoutes();

    expect(routes.length).toBe(2);
    expect(routes[0]?.id).toBe('route-1');
    expect(routes[1]?.id).toBe('route-2');
  });

  it('returns empty array when no routes', async () => {
    const pool = makePool([ok([])]);
    const svc = new GatewayRouteService(pool);

    const routes = await svc.listRoutes();
    expect(routes).toEqual([]);
  });

  it('filters by version when provided', async () => {
    const v2Row = { ...baseRow, id: 'route-v2', version: 'v2' };
    const pool = makePool([ok([v2Row])]);
    const svc = new GatewayRouteService(pool);

    const routes = await svc.listRoutes('v2');

    expect(routes.length).toBe(1);
    expect(routes[0]?.version).toBe('v2');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[0]?.[1] ?? []) as unknown[];
    expect(params[0]).toBe('v2');
  });
});

describe('GatewayRouteService.lookupRoute', () => {
  it('returns route on exact match', async () => {
    const pool = makePool([ok([baseRow])]);
    const svc = new GatewayRouteService(pool);

    const route = await svc.lookupRoute('/api/v1/users', 'GET', 'v1');

    expect(route).toBeDefined();
    expect(route?.id).toBe('route-1');
  });

  it('returns undefined when no exact or wildcard match', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new GatewayRouteService(pool);

    const route = await svc.lookupRoute('/api/v1/missing', 'GET', 'v1');

    expect(route).toBeUndefined();
  });

  it('falls back to wildcard match when exact fails', async () => {
    const wildcardRow = {
      ...baseRow,
      id: 'route-wild',
      path: '/api/v1/users/*',
    };
    const pool = makePool([ok([]), ok([wildcardRow])]);
    const svc = new GatewayRouteService(pool);

    const route = await svc.lookupRoute('/api/v1/users/123', 'GET', 'v1');

    expect(route).toBeDefined();
    expect(route?.id).toBe('route-wild');
  });

  it('matches :param segments via wildcard', async () => {
    const paramRow = {
      ...baseRow,
      id: 'route-param',
      path: '/api/v1/users/:id',
    };
    const pool = makePool([ok([]), ok([paramRow])]);
    const svc = new GatewayRouteService(pool);

    const route = await svc.lookupRoute('/api/v1/users/abc-123', 'GET', 'v1');

    expect(route).toBeDefined();
    expect(route?.id).toBe('route-param');
  });

  it('does not match :param segment across slashes', async () => {
    const paramRow = {
      ...baseRow,
      id: 'route-param',
      path: '/api/v1/users/:id',
    };
    const pool = makePool([ok([]), ok([paramRow])]);
    const svc = new GatewayRouteService(pool);

    // :id should not match two path segments
    const route = await svc.lookupRoute('/api/v1/users/abc/extra', 'GET', 'v1');

    expect(route).toBeUndefined();
  });
});
