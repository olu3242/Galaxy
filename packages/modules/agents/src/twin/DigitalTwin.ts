import type { Pool } from 'pg';

export interface DigitalTwinSnapshot {
  organizationId: string;
  capturedAt: string;
  workflowSummary: {
    total: number;
    running: number;
    pending: number;
    failed: number;
    completedLast24h: number;
  };
  approvalSummary: {
    pending: number;
    overdueCount: number;
    avgResolutionHours: number;
  };
  memberSummary: {
    total: number;
    active: number;
    departments: number;
  };
  riskIndicators: {
    highRiskWorkflows: number;
    complianceFlags: number;
    pendingEscalations: number;
  };
  agentActivity: {
    activeExecutions: number;
    completedLast24h: number;
    failedLast24h: number;
  };
}

interface WorkflowStatusRow {
  status: string;
  count: string;
}

interface WorkflowCompletedRow {
  count: string;
}

interface ApprovalPendingRow {
  pending: string;
  overdue: string;
  avg_resolution_hours: string | null;
}

interface MemberRow {
  total: string;
  active: string;
  departments: string;
}

interface AgentActivityRow {
  active_executions: string;
  completed_last24h: string;
  failed_last24h: string;
}

export class DigitalTwin {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async capture(organizationId: string): Promise<DigitalTwinSnapshot> {
    await this.setTenantContext(organizationId);

    const [
      workflowStatusResult,
      workflowCompletedResult,
      approvalResult,
      memberResult,
      agentResult,
    ] = await Promise.all([
      this.pool.query<WorkflowStatusRow>(
        `SELECT status, COUNT(*) AS count
           FROM workflow_instances
           WHERE organization_id = $1
           GROUP BY status`,
        [organizationId],
      ),
      this.pool.query<WorkflowCompletedRow>(
        `SELECT COUNT(*) AS count
           FROM workflow_instances
           WHERE organization_id = $1
             AND status = 'completed'
             AND updated_at >= NOW() - INTERVAL '24 hours'`,
        [organizationId],
      ),
      this.pool.query<ApprovalPendingRow>(
        `SELECT
             COUNT(*) FILTER (WHERE status = 'pending') AS pending,
             COUNT(*) FILTER (WHERE status = 'pending' AND created_at < NOW() - INTERVAL '48 hours') AS overdue,
             AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)
               FILTER (WHERE resolved_at IS NOT NULL) AS avg_resolution_hours
           FROM approvals
           WHERE organization_id = $1`,
        [organizationId],
      ),
      this.pool.query<MemberRow>(
        `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE is_active = true) AS active,
             COUNT(DISTINCT department) AS departments
           FROM memberships
           WHERE organization_id = $1`,
        [organizationId],
      ),
      this.pool.query<AgentActivityRow>(
        `SELECT
             COUNT(*) FILTER (WHERE status = 'running') AS active_executions,
             COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= NOW() - INTERVAL '24 hours') AS completed_last24h,
             COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '24 hours') AS failed_last24h
           FROM agent_executions
           WHERE organization_id = $1`,
        [organizationId],
      ),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of workflowStatusResult.rows) {
      statusMap[row.status] = parseInt(row.count, 10);
    }

    const completedRow = workflowCompletedResult.rows[0];
    const approvalRow = approvalResult.rows[0];
    const memberRow = memberResult.rows[0];
    const agentRow = agentResult.rows[0];

    const workflowTotal = Object.values(statusMap).reduce((sum, n) => sum + n, 0);
    const completedLast24h = completedRow !== undefined ? parseInt(completedRow.count, 10) : 0;

    const approvalPending = approvalRow !== undefined ? parseInt(approvalRow.pending, 10) : 0;
    const approvalOverdue = approvalRow !== undefined ? parseInt(approvalRow.overdue, 10) : 0;
    const avgResolutionHours =
      approvalRow !== undefined && approvalRow.avg_resolution_hours !== null
        ? parseFloat(approvalRow.avg_resolution_hours)
        : 0;

    const memberTotal = memberRow !== undefined ? parseInt(memberRow.total, 10) : 0;
    const memberActive = memberRow !== undefined ? parseInt(memberRow.active, 10) : 0;
    const memberDepartments = memberRow !== undefined ? parseInt(memberRow.departments, 10) : 0;

    const activeExecutions = agentRow !== undefined ? parseInt(agentRow.active_executions, 10) : 0;
    const agentCompleted = agentRow !== undefined ? parseInt(agentRow.completed_last24h, 10) : 0;
    const agentFailed = agentRow !== undefined ? parseInt(agentRow.failed_last24h, 10) : 0;

    return {
      organizationId,
      capturedAt: new Date().toISOString(),
      workflowSummary: {
        total: workflowTotal,
        running: statusMap.running ?? 0,
        pending: statusMap.pending ?? 0,
        failed: statusMap.failed ?? 0,
        completedLast24h,
      },
      approvalSummary: {
        pending: approvalPending,
        overdueCount: approvalOverdue,
        avgResolutionHours,
      },
      memberSummary: {
        total: memberTotal,
        active: memberActive,
        departments: memberDepartments,
      },
      riskIndicators: {
        highRiskWorkflows: 0,
        complianceFlags: 0,
        pendingEscalations: 0,
      },
      agentActivity: {
        activeExecutions,
        completedLast24h: agentCompleted,
        failedLast24h: agentFailed,
      },
    };
  }

  snapshot(twin: DigitalTwinSnapshot): Record<string, unknown> {
    return twin as unknown as Record<string, unknown>;
  }
}
