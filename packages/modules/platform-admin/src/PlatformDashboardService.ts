import type { Pool } from 'pg';
import type { PlatformMetric } from './types.js';

export interface PlatformDashboardMetrics {
  totalOrgs: number;
  activeTenants: number;
  mrrCents: number;
  healthScore: number;
  totalWorkflows: number;
  totalMembers: number;
  metrics: PlatformMetric[];
  generatedAt: string;
}

export class PlatformDashboardService {
  constructor(private readonly pool: Pool) {}

  async getAggregateMetrics(): Promise<PlatformDashboardMetrics> {
    const result = await this.pool.query<{
      total_orgs: string;
      active_tenants: string;
      total_workflows: string;
      total_members: string;
    }>(
      `SELECT
         COUNT(DISTINCT o.id)::text AS total_orgs,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'active')::text AS active_tenants,
         COUNT(DISTINCT w.id)::text AS total_workflows,
         COUNT(DISTINCT m.id)::text AS total_members
       FROM organizations o
       LEFT JOIN workflows w ON w.organization_id = o.id
       LEFT JOIN members m ON m.organization_id = o.id`,
    );

    const revenueResult = await this.pool.query<{ mrr_cents: string }>(
      `SELECT COALESCE(SUM(p.monthly_price_cents), 0)::text AS mrr_cents
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.status = 'active'`,
    );

    const row = result.rows[0];
    const totalOrgs = parseInt(row?.total_orgs ?? '0', 10);
    const activeTenants = parseInt(row?.active_tenants ?? '0', 10);
    const totalWorkflows = parseInt(row?.total_workflows ?? '0', 10);
    const totalMembers = parseInt(row?.total_members ?? '0', 10);
    const mrrCents = parseInt(revenueResult.rows[0]?.mrr_cents ?? '0', 10);
    const healthScore = totalOrgs > 0 ? Math.round((activeTenants / totalOrgs) * 100) : 100;

    const now = new Date().toISOString();

    const metrics: PlatformMetric[] = [
      { key: 'total_orgs', value: totalOrgs, measuredAt: now },
      { key: 'active_tenants', value: activeTenants, measuredAt: now },
      { key: 'mrr_cents', value: mrrCents, unit: 'cents', measuredAt: now },
      { key: 'health_score', value: healthScore, unit: 'percent', measuredAt: now },
      { key: 'total_workflows', value: totalWorkflows, measuredAt: now },
      { key: 'total_members', value: totalMembers, measuredAt: now },
    ];

    return {
      totalOrgs,
      activeTenants,
      mrrCents,
      healthScore,
      totalWorkflows,
      totalMembers,
      metrics,
      generatedAt: now,
    };
  }
}
