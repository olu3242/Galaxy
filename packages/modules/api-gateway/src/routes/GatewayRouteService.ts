import type { Pool } from 'pg';
import type { GatewayRoute, RegisterRouteInput, ApiVersion } from '../types.js';

interface GatewayRouteRow {
  id: string;
  path: string;
  method: string;
  version: string;
  auth_required: boolean;
  rate_limit_tier: string;
  description: string;
  is_active: boolean;
  created_at: Date;
}

function toGatewayRoute(row: GatewayRouteRow): GatewayRoute {
  return {
    id: row.id,
    path: row.path,
    method: row.method as GatewayRoute['method'],
    version: row.version as ApiVersion,
    authRequired: row.auth_required,
    rateLimitTier: row.rate_limit_tier as GatewayRoute['rateLimitTier'],
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
  };
}

export class GatewayRouteService {
  constructor(private readonly pool: Pool) {}

  async registerRoute(input: RegisterRouteInput): Promise<GatewayRoute> {
    const result = await this.pool.query<GatewayRouteRow>(
      `INSERT INTO gateway_routes (path, method, version, auth_required, rate_limit_tier, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.path, input.method, input.version, input.authRequired, input.rateLimitTier, input.description],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to insert gateway route');
    return toGatewayRoute(row);
  }

  async unregisterRoute(id: string): Promise<void> {
    await this.pool.query('UPDATE gateway_routes SET is_active = false WHERE id = $1', [id]);
  }

  async listRoutes(version?: ApiVersion): Promise<GatewayRoute[]> {
    if (version !== undefined) {
      const result = await this.pool.query<GatewayRouteRow>(
        'SELECT * FROM gateway_routes WHERE version = $1 AND is_active = true ORDER BY path, method',
        [version],
      );
      return result.rows.map(toGatewayRoute);
    }
    const result = await this.pool.query<GatewayRouteRow>(
      'SELECT * FROM gateway_routes WHERE is_active = true ORDER BY path, method',
    );
    return result.rows.map(toGatewayRoute);
  }

  async lookupRoute(path: string, method: string, version: ApiVersion): Promise<GatewayRoute | undefined> {
    // Exact match first
    const exact = await this.pool.query<GatewayRouteRow>(
      `SELECT * FROM gateway_routes
       WHERE path = $1 AND method = $2 AND version = $3 AND is_active = true
       LIMIT 1`,
      [path, method, version],
    );
    if (exact.rows[0]) return toGatewayRoute(exact.rows[0]);

    // Wildcard match: routes ending with /* or :param segments
    const allRoutes = await this.pool.query<GatewayRouteRow>(
      `SELECT * FROM gateway_routes
       WHERE method = $1 AND version = $2 AND is_active = true AND (path LIKE '%*' OR path LIKE '%:')
       ORDER BY length(path) DESC`,
      [method, version],
    );

    for (const row of allRoutes.rows) {
      if (matchesWildcard(row.path, path)) {
        return toGatewayRoute(row);
      }
    }
    return undefined;
  }
}

function matchesWildcard(pattern: string, path: string): boolean {
  // Convert route pattern like /api/v1/users/:id or /api/v1/* to regex
  const regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/:[^/]+/g, '[^/]+');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}
