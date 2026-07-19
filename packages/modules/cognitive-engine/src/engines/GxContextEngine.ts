import type { Pool } from 'pg';

export interface AgentContext {
  tenantId: string;
  actorId: string;
  organizationId: string;
  departmentId?: string;
  teamId?: string;
  conversationId?: string;
  workflowInstanceId?: string;
  sessionMetadata: Record<string, unknown>;
  // enriched at runtime
  organizationName?: string;
  departmentName?: string;
  memberRole?: string;
  activeWorkflows?: number;
  pendingApprovals?: number;
}

export interface ContextEnrichmentInput {
  tenantId: string;
  actorId: string;
  organizationId: string;
  departmentId?: string;
  conversationId?: string;
  workflowInstanceId?: string;
  sessionMetadata?: Record<string, unknown>;
}

export class GxContextEngine {
  constructor(private readonly pool: Pool) {}

  async enrich(input: ContextEnrichmentInput): Promise<AgentContext> {
    // set tenant context
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    // parallel queries for org name, member role, pending approvals count, active workflow count
    const [orgResult, memberResult, pendingResult, workflowResult] = await Promise.all([
      this.pool.query<{ name: string }>('SELECT name FROM organizations WHERE id = $1 LIMIT 1', [
        input.organizationId,
      ]),
      this.pool.query<{ role_name: string; department_id: string | null }>(
        `
        SELECT r.name AS role_name, m.department_id
        FROM memberships m
        JOIN roles r ON r.id = m.role_id
        WHERE m.user_id = $1 AND m.organization_id = $2 AND m.status = 'active'
        LIMIT 1
      `,
        [input.actorId, input.organizationId],
      ),
      this.pool.query<{ count: string }>(
        `
        SELECT COUNT(*) AS count FROM approvals
        WHERE organization_id = $1 AND status = 'pending'
      `,
        [input.organizationId],
      ),
      this.pool.query<{ count: string }>(
        `
        SELECT COUNT(*) AS count FROM workflow_instances
        WHERE organization_id = $1 AND status IN ('pending','running')
      `,
        [input.organizationId],
      ),
    ]);

    const ctx: AgentContext = {
      tenantId: input.tenantId,
      actorId: input.actorId,
      organizationId: input.organizationId,
      sessionMetadata: input.sessionMetadata ?? {},
    };

    if (input.departmentId !== undefined) ctx.departmentId = input.departmentId;
    if (input.conversationId !== undefined) ctx.conversationId = input.conversationId;
    if (input.workflowInstanceId !== undefined) ctx.workflowInstanceId = input.workflowInstanceId;

    const orgName = orgResult.rows[0]?.name;
    if (orgName !== undefined) ctx.organizationName = orgName;

    const member = memberResult.rows[0];
    if (member) {
      ctx.memberRole = member.role_name;
      if (member.department_id !== null) ctx.departmentId = member.department_id;
    }

    ctx.pendingApprovals = parseInt(pendingResult.rows[0]?.count ?? '0', 10);
    ctx.activeWorkflows = parseInt(workflowResult.rows[0]?.count ?? '0', 10);

    return ctx;
  }

  snapshot(ctx: AgentContext): Record<string, unknown> {
    return {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      actorId: ctx.actorId,
      memberRole: ctx.memberRole,
      departmentId: ctx.departmentId,
      activeWorkflows: ctx.activeWorkflows,
      pendingApprovals: ctx.pendingApprovals,
      sessionMetadata: ctx.sessionMetadata,
    };
  }
}
