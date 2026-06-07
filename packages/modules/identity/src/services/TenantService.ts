import type { Pool } from 'pg';

export interface TenantContext {
  organizationId: string;
}

/**
 * TenantService — resolves and sets the tenant context for database queries.
 *
 * Every database interaction must be preceded by setting the tenant context
 * via set_config so that Row-Level Security policies are enforced correctly.
 */
export class TenantService {
  constructor(private readonly pool: Pool) {}

  /**
   * Sets the app.current_tenant PostgreSQL session variable.
   * Must be called before any tenant-scoped query.
   */
  async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  /**
   * Returns the current tenant context from the database session.
   */
  async getCurrentTenant(): Promise<string | null> {
    const result = await this.pool.query<{ current_tenant: string }>(
      "SELECT current_setting('app.current_tenant', true) AS current_tenant",
    );
    const value = result.rows[0]?.current_tenant;
    return value && value.length > 0 ? value : null;
  }

  /**
   * Verifies that an organization exists and is active.
   */
  async assertOrganizationActive(organizationId: string): Promise<void> {
    const result = await this.pool.query<{ status: string }>(
      'SELECT status FROM organizations WHERE id = $1',
      [organizationId],
    );

    const org = result.rows[0];

    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    if (org.status !== 'active') {
      throw new Error(`Organization ${organizationId} is not active (status: ${org.status})`);
    }
  }

  /**
   * Runs a callback with the tenant context set.
   */
  async withTenant<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    await this.setTenantContext(organizationId);
    return fn();
  }
}
