import type { Pool } from 'pg';
import type { PlatformMetric } from '../types.js';

export interface TenantMetrics {
  organizationId: string;
  memberCount: number;
  workflowCount: number;
  activeWorkflows: number;
  auditLogCount: number;
  measuredAt: string;
}

export class MetricsService {
  constructor(private readonly pool: Pool) {}

  async getPlatformMetrics(): Promise<PlatformMetric[]> {
    const result = await this.pool.query<{
      total_orgs: string;
      active_orgs: string;
      total_members: string;
      total_workflows: string;
    }>(
      `SELECT
         COUNT(DISTINCT o.id)::text AS total_orgs,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'active')::text AS active_orgs,
         COUNT(DISTINCT m.id)::text AS total_members,
         COUNT(DISTINCT w.id)::text AS total_workflows
       FROM organizations o
       LEFT JOIN members m ON m.organization_id = o.id
       LEFT JOIN workflows w ON w.organization_id = o.id`,
    );

    const row = result.rows[0];
    const now = new Date().toISOString();

    return [
      { key: 'total_orgs', value: parseInt(row?.total_orgs ?? '0', 10), measuredAt: now },
      { key: 'active_orgs', value: parseInt(row?.active_orgs ?? '0', 10), measuredAt: now },
      { key: 'total_members', value: parseInt(row?.total_members ?? '0', 10), measuredAt: now },
      { key: 'total_workflows', value: parseInt(row?.total_workflows ?? '0', 10), measuredAt: now },
    ];
  }

  async getTenantMetrics(orgId: string): Promise<TenantMetrics> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<{
      member_count: string;
      workflow_count: string;
      active_workflows: string;
      audit_count: string;
    }>(
      `SELECT
         COUNT(DISTINCT m.id)::text AS member_count,
         COUNT(DISTINCT w.id)::text AS workflow_count,
         COUNT(DISTINCT w.id) FILTER (WHERE w.status = 'active')::text AS active_workflows,
         COUNT(DISTINCT al.id)::text AS audit_count
       FROM organizations o
       LEFT JOIN members m ON m.organization_id = o.id
       LEFT JOIN workflows w ON w.organization_id = o.id
       LEFT JOIN audit_logs al ON al.organization_id = o.id
       WHERE o.id = $1`,
      [orgId],
    );

    const row = result.rows[0];
    return {
      organizationId: orgId,
      memberCount: parseInt(row?.member_count ?? '0', 10),
      workflowCount: parseInt(row?.workflow_count ?? '0', 10),
      activeWorkflows: parseInt(row?.active_workflows ?? '0', 10),
      auditLogCount: parseInt(row?.audit_count ?? '0', 10),
      measuredAt: new Date().toISOString(),
    };
  }
}
