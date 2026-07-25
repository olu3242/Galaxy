import type { Pool } from 'pg';
import type { AggregatedContext } from './types.js';

interface WorkflowRow {
  total: string;
  active: string;
  near_sla: string;
  breached: string;
}

interface ApprovalRow {
  total: string;
  stale_pending: string;
  oldest_days: string;
}

interface TaskRow {
  total: string;
  open: string;
}

interface OverloadedRow {
  assigned_to: string;
  cnt: string;
}

interface ComplianceRow {
  passed: string;
  failed: string;
  warnings: string;
}

export class ContextAggregator {
  constructor(private readonly pool: Pool) {}

  async aggregate(orgId: string): Promise<AggregatedContext> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const [workflowResult, approvalResult, taskResult, overloadedResult, complianceResult] =
      await Promise.all([
        this.pool.query<WorkflowRow>(
          `SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status IN ('active', 'running'))::text AS active,
            COUNT(*) FILTER (
              WHERE status IN ('active', 'running')
                AND sla_due_at IS NOT NULL
                AND sla_due_at < NOW() + INTERVAL '24 hours'
                AND sla_due_at > NOW()
            )::text AS near_sla,
            COUNT(*) FILTER (
              WHERE status IN ('active', 'running')
                AND sla_due_at IS NOT NULL
                AND sla_due_at < NOW()
            )::text AS breached
          FROM workflow_runs
          WHERE organization_id = $1`,
          [orgId],
        ),
        this.pool.query<ApprovalRow>(
          `SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (
              WHERE status = 'pending'
                AND created_at < NOW() - INTERVAL '3 days'
            )::text AS stale_pending,
            COALESCE(
              EXTRACT(DAY FROM NOW() - MIN(created_at) FILTER (WHERE status = 'pending'))::text,
              '0'
            ) AS oldest_days
          FROM approvals
          WHERE organization_id = $1`,
          [orgId],
        ),
        this.pool.query<TaskRow>(
          `SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled'))::text AS open
          FROM tasks
          WHERE organization_id = $1`,
          [orgId],
        ),
        this.pool.query<OverloadedRow>(
          `SELECT assigned_to, COUNT(*)::text AS cnt
          FROM tasks
          WHERE organization_id = $1
            AND status NOT IN ('completed', 'cancelled')
            AND assigned_to IS NOT NULL
          GROUP BY assigned_to
          HAVING COUNT(*) > 10
          ORDER BY COUNT(*) DESC
          LIMIT 20`,
          [orgId],
        ),
        this.pool.query<ComplianceRow>(
          `SELECT
            COUNT(*) FILTER (WHERE status = 'pass')::text AS passed,
            COUNT(*) FILTER (WHERE status = 'fail')::text AS failed,
            COUNT(*) FILTER (WHERE status = 'warning')::text AS warnings
          FROM compliance_checks
          WHERE organization_id = $1
            AND run_at > NOW() - INTERVAL '30 days'`,
          [orgId],
        ),
      ]);

    const wf = workflowResult.rows[0] ?? {
      total: '0',
      active: '0',
      near_sla: '0',
      breached: '0',
    };
    const ap = approvalResult.rows[0] ?? { total: '0', stale_pending: '0', oldest_days: '0' };
    const tk = taskResult.rows[0] ?? { total: '0', open: '0' };
    const co = complianceResult.rows[0] ?? { passed: '0', failed: '0', warnings: '0' };

    const workflowTotal = parseInt(wf.total, 10);
    const nearSla = parseInt(wf.near_sla, 10);
    const breached = parseInt(wf.breached, 10);
    const failedCompliance = parseInt(co.failed, 10);

    const riskFactors: string[] = [];
    if (breached > 0) riskFactors.push(`${String(breached)} SLA breached workflow(s)`);
    if (nearSla > 0) riskFactors.push(`${String(nearSla)} workflow(s) near SLA`);
    if (failedCompliance > 0)
      riskFactors.push(`${String(failedCompliance)} compliance check(s) failed`);

    const riskLevel =
      riskFactors.length === 0
        ? 'low'
        : breached > 3 || failedCompliance > 2
          ? 'critical'
          : riskFactors.length >= 2
            ? 'high'
            : 'medium';

    return {
      workflowStats: {
        total: workflowTotal,
        active: parseInt(wf.active, 10),
        nearSla,
        breached,
      },
      approvalBacklog: {
        total: parseInt(ap.total, 10),
        stalePending: parseInt(ap.stale_pending, 10),
        oldestDays: parseFloat(ap.oldest_days),
      },
      taskStats: {
        total: parseInt(tk.total, 10),
        open: parseInt(tk.open, 10),
        overloaded: overloadedResult.rows.map((r) => ({
          memberId: r.assigned_to,
          count: parseInt(r.cnt, 10),
        })),
      },
      riskSummary: {
        level: riskLevel,
        factors: riskFactors,
      },
      recentIncidents: [],
      complianceStatus: {
        passed: parseInt(co.passed, 10),
        failed: failedCompliance,
        warnings: parseInt(co.warnings, 10),
      },
    };
  }
}
