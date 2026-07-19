import type { Pool } from 'pg';
import type { PermissionAnalytics } from '../types/index.js';

export class PermissionAnalyticsService {
  constructor(private readonly pool: Pool) {}

  async generate(organizationId: string, period: string): Promise<PermissionAnalytics> {
    await this.setTenant(organizationId);

    const [roleDistribution, failedAttempts, dormantAccounts, activeDelegations, abacEvaluated] =
      await Promise.all([
        this.getRoleDistribution(organizationId),
        this.getFailedAuthAttempts(organizationId, period),
        this.getDormantAccounts(organizationId),
        this.getActiveDelegations(organizationId),
        this.getAbacPoliciesEvaluated(organizationId, period),
      ]);

    return {
      organizationId,
      period,
      roleDistribution,
      failedAuthAttempts: failedAttempts,
      privilegeEscalationAttempts: 0,
      dormantAccounts,
      activeDelegations,
      highRiskUsers: [],
      complianceViolations: 0,
      abacPoliciesEvaluated: abacEvaluated,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getRoleDistribution(
    organizationId: string,
  ): Promise<{ role: string; count: number }[]> {
    const result = await this.pool.query<{ role: string; count: string }>(
      `SELECT r.name AS role, COUNT(m.user_id)::text AS count
       FROM memberships m
       JOIN org_roles r ON r.id = m.role_id
       WHERE m.organization_id = $1 AND m.status = 'active'
       GROUP BY r.name
       ORDER BY count DESC`,
      [organizationId],
    );
    return result.rows.map((r) => ({ role: r.role, count: parseInt(r.count, 10) }));
  }

  private async getFailedAuthAttempts(organizationId: string, period: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_logs
       WHERE organization_id = $1
         AND action LIKE 'auth.%'
         AND status = 'denied'
         AND created_at >= NOW() - $2::interval`,
      [organizationId, period],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  private async getDormantAccounts(organizationId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT m.user_id)::text AS count
       FROM memberships m
       WHERE m.organization_id = $1
         AND m.status = 'active'
         AND m.user_id NOT IN (
           SELECT DISTINCT actor_id FROM audit_logs
           WHERE organization_id = $1
             AND created_at >= NOW() - INTERVAL '30 days'
         )`,
      [organizationId],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  private async getActiveDelegations(organizationId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM delegations
       WHERE organization_id = $1
         AND is_active = true
         AND start_at <= NOW()
         AND end_at >= NOW()`,
      [organizationId],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  private async getAbacPoliciesEvaluated(organizationId: string, period: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_logs
       WHERE organization_id = $1
         AND action = 'authorization.evaluated'
         AND created_at >= NOW() - $2::interval`,
      [organizationId, period],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  private async setTenant(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }
}
