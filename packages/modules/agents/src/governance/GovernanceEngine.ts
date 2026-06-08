import type { Pool } from 'pg';
import type { AgentCapability } from '../types.js';

interface MemberRow {
  id: string;
  role: string | null;
}

const CAPABILITY_REQUIRED_ROLES: Record<AgentCapability, string[]> = {
  read_workflows: ['member', 'manager', 'admin', 'owner'],
  read_analytics: ['member', 'manager', 'admin', 'owner'],
  read_knowledge: ['member', 'manager', 'admin', 'owner'],
  write_tasks: ['manager', 'admin', 'owner'],
  trigger_workflows: ['manager', 'admin', 'owner'],
  approve_decisions: ['manager', 'admin', 'owner'],
  assess_risk: ['manager', 'admin', 'owner'],
  generate_recommendations: ['manager', 'admin', 'owner'],
};

export class GovernanceEngine {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async validateCapability(
    organizationId: string,
    actorId: string,
    capability: AgentCapability,
  ): Promise<{ allowed: boolean; reason: string }> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<MemberRow>(
      `SELECT m.id, r.name AS role
       FROM memberships m
       LEFT JOIN member_roles mr ON mr.member_id = m.id AND mr.organization_id = m.organization_id
       LEFT JOIN roles r ON r.id = mr.role_id AND r.organization_id = m.organization_id
       WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active'
       LIMIT 1`,
      [organizationId, actorId],
    );

    if (result.rows.length === 0) {
      return { allowed: false, reason: 'Actor is not an active member of the organization' };
    }

    const member = result.rows[0];
    if (!member)
      return { allowed: false, reason: 'Actor is not an active member of the organization' };
    const role = member.role ?? 'member';
    const allowed = CAPABILITY_REQUIRED_ROLES[capability].includes(role);

    return {
      allowed,
      reason: allowed
        ? `Role '${role}' is authorized for capability '${capability}'`
        : `Role '${role}' is not authorized for capability '${capability}'`,
    };
  }

  async validateAgentWriteAction(
    organizationId: string,
    actorId: string,
    action: string,
    context: Record<string, unknown>,
  ): Promise<{ allowed: boolean; reason: string; auditTrail: Record<string, unknown> }> {
    await this.setTenantContext(organizationId);

    const auditTrail = {
      actorId,
      action,
      organizationId,
      context,
      evaluatedAt: new Date().toISOString(),
    };

    const cap = this.actionToCapability(action);
    if (!cap) {
      return { allowed: false, reason: `Unknown action: ${action}`, auditTrail };
    }

    const check = await this.validateCapability(organizationId, actorId, cap);
    return { ...check, auditTrail };
  }

  private actionToCapability(action: string): AgentCapability | null {
    const map: Record<string, AgentCapability> = {
      create_task: 'write_tasks',
      trigger_workflow: 'trigger_workflows',
      approve_decision: 'approve_decisions',
      assess_risk: 'assess_risk',
      generate_recommendation: 'generate_recommendations',
    };
    return map[action] ?? null;
  }
}
