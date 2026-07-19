import type { Pool } from 'pg';
import type { HealthStatus, HealthStatusRow, HealthStatusLevel } from '../types.js';

function rowToHealth(row: HealthStatusRow): HealthStatus {
  return {
    id: row.id,
    organizationId: row.organization_id,
    component: row.component,
    status: row.status as HealthStatusLevel,
    details: row.details,
    checkedAt: row.checked_at,
  };
}

interface WorkflowRunRateRow {
  run_count: string;
  failed_count: string;
}

interface AgentSuccessRow {
  total: string;
  success: string;
}

interface SLABreachRow {
  total_runs: string;
  breached_runs: string;
}

export class PlatformHealthService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async checkWorkflowHealth(organizationId: string): Promise<HealthStatus> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<WorkflowRunRateRow>(
      `SELECT
         COUNT(*) AS run_count,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
       FROM workflow_runs
       WHERE organization_id = $1
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [organizationId],
    );

    const row = result.rows[0];
    const runCount = parseInt(row?.run_count ?? '0', 10);
    const failedCount = parseInt(row?.failed_count ?? '0', 10);
    const failureRate = runCount > 0 ? failedCount / runCount : 0;

    let status: HealthStatusLevel = 'healthy';
    if (failureRate > 0.5) status = 'critical';
    else if (failureRate > 0.2) status = 'degraded';

    return this.upsertHealth(organizationId, 'workflow', status, {
      runCount,
      failedCount,
      failureRate,
    });
  }

  async checkAgentHealth(organizationId: string): Promise<HealthStatus> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<AgentSuccessRow>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'completed') AS success
       FROM agent_executions
       WHERE organization_id = $1
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [organizationId],
    );

    const row = result.rows[0];
    const total = parseInt(row?.total ?? '0', 10);
    const success = parseInt(row?.success ?? '0', 10);
    const successRate = total > 0 ? success / total : 1;

    let status: HealthStatusLevel = 'healthy';
    if (successRate < 0.5) status = 'critical';
    else if (successRate < 0.8) status = 'degraded';

    return this.upsertHealth(organizationId, 'agent', status, {
      total,
      success,
      successRate,
    });
  }

  async checkSLAHealth(organizationId: string): Promise<HealthStatus> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<SLABreachRow>(
      `SELECT
         COUNT(*) AS total_runs,
         COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL AND completed_at > sla_due_at) AS breached_runs
       FROM workflow_runs
       WHERE organization_id = $1
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [organizationId],
    );

    const row = result.rows[0];
    const totalRuns = parseInt(row?.total_runs ?? '0', 10);
    const breachedRuns = parseInt(row?.breached_runs ?? '0', 10);
    const breachRate = totalRuns > 0 ? breachedRuns / totalRuns : 0;

    let status: HealthStatusLevel = 'healthy';
    if (breachRate > 0.3) status = 'critical';
    else if (breachRate > 0.1) status = 'degraded';

    return this.upsertHealth(organizationId, 'sla', status, {
      totalRuns,
      breachedRuns,
      breachRate,
    });
  }

  private async upsertHealth(
    organizationId: string,
    component: string,
    status: HealthStatusLevel,
    details: Record<string, unknown>,
  ): Promise<HealthStatus> {
    const result = await this.pool.query<HealthStatusRow>(
      `INSERT INTO platform_health_checks (organization_id, component, status, details)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, component)
       DO UPDATE SET status = EXCLUDED.status, details = EXCLUDED.details, checked_at = NOW()
       RETURNING *`,
      [organizationId, component, status, JSON.stringify(details)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to upsert health check');
    return rowToHealth(row);
  }

  async getHealth(organizationId: string): Promise<HealthStatus[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<HealthStatusRow>(
      'SELECT * FROM platform_health_checks WHERE organization_id = $1 ORDER BY checked_at DESC',
      [organizationId],
    );
    return result.rows.map(rowToHealth);
  }
}
