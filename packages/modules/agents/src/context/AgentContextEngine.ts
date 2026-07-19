import type { Pool } from 'pg';
import type { AgentContextSnapshot } from '../types.js';

interface WorkflowRunSummary {
  id: string;
  workflow_id: string;
  status: string;
  automation_domain: string | null;
  sla_due_at: string | null;
  created_at: string;
}

interface ApprovalSummary {
  id: string;
  title: string;
  status: string;
  requested_by: string;
  created_at: string;
}

interface DecisionSummary {
  id: string;
  decision_type: string;
  subject: string;
  outcome: string;
  confidence_score: string;
  created_at: string;
}

interface ContextSnapshotRow {
  id: string;
  organization_id: string;
  agent_id: string;
  execution_id: string | null;
  context_data: Record<string, unknown>;
  workflow_runs: Record<string, unknown>[];
  pending_approvals: Record<string, unknown>[];
  recent_decisions: Record<string, unknown>[];
  created_at: string;
}

export class AgentContextEngine {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async buildContext(
    organizationId: string,
    agentId: string,
    executionId?: string,
    opts?: { automationDomains?: string[] },
  ): Promise<AgentContextSnapshot> {
    await this.setTenantContext(organizationId);

    const domainFilter =
      opts?.automationDomains && opts.automationDomains.length > 0
        ? `AND automation_domain = ANY($2::text[])`
        : '';

    const wfParams: unknown[] = [organizationId];
    if (opts?.automationDomains && opts.automationDomains.length > 0) {
      wfParams.push(opts.automationDomains);
    }

    const [wfResult, approvalResult, decisionResult, orgResult] = await Promise.all([
      this.pool.query<WorkflowRunSummary>(
        `SELECT id, workflow_id, status, automation_domain, sla_due_at, created_at
         FROM workflow_runs
         WHERE organization_id = $1 ${domainFilter}
           AND status IN ('pending','running','waiting','escalated')
         ORDER BY created_at DESC LIMIT 20`,
        wfParams,
      ),
      this.pool.query<ApprovalSummary>(
        `SELECT id, title, status, requested_by, created_at
         FROM approvals
         WHERE organization_id = $1 AND status = 'pending'
         ORDER BY created_at DESC LIMIT 20`,
        [organizationId],
      ),
      this.pool.query<DecisionSummary>(
        `SELECT id, decision_type, subject, outcome, confidence_score, created_at
         FROM decisions
         WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [organizationId],
      ),
      this.pool.query<{ member_count: string; workflow_count: string }>(
        `SELECT
           (SELECT COUNT(*) FROM memberships WHERE organization_id = $1 AND status = 'active') AS member_count,
           (SELECT COUNT(*) FROM workflows WHERE organization_id = $1 AND is_active = true) AS workflow_count`,
        [organizationId],
      ),
    ]);

    const org = orgResult.rows[0];
    const contextData: Record<string, unknown> = {
      organizationId,
      memberCount: parseInt(org?.member_count ?? '0', 10),
      activeWorkflowCount: parseInt(org?.workflow_count ?? '0', 10),
      activeRunCount: wfResult.rows.length,
      pendingApprovalCount: approvalResult.rows.length,
      capturedAt: new Date().toISOString(),
    };

    const result = await this.pool.query<ContextSnapshotRow>(
      `INSERT INTO agent_context_snapshots
         (organization_id, agent_id, execution_id, context_data, workflow_runs, pending_approvals, recent_decisions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        organizationId,
        agentId,
        executionId ?? null,
        JSON.stringify(contextData),
        JSON.stringify(wfResult.rows),
        JSON.stringify(approvalResult.rows),
        JSON.stringify(decisionResult.rows),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO agent_context_snapshots returned no row');
    return {
      id: row.id,
      organizationId: row.organization_id,
      agentId: row.agent_id,
      contextData: row.context_data,
      workflowRuns: row.workflow_runs,
      pendingApprovals: row.pending_approvals,
      recentDecisions: row.recent_decisions,
      createdAt: row.created_at,
      ...(row.execution_id !== null ? { executionId: row.execution_id } : {}),
    };
  }
}
