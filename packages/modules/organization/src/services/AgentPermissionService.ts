import type { Pool } from 'pg';
import type { AgentPermissionProfile } from '../types/index.js';

interface AgentPermissionRow {
  id: string;
  organization_id: string;
  agent_type: string;
  agent_name: string;
  allowed_tools: string[];
  accessible_knowledge_sources: string[];
  writable_resources: string[];
  approval_limits: Record<string, number>;
  escalation_rules: AgentPermissionProfile['escalationRules'];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentPermissionInput {
  organizationId: string;
  agentType: string;
  agentName: string;
  allowedTools: string[];
  accessibleKnowledgeSources: string[];
  writableResources: string[];
  approvalLimits: Record<string, number>;
  escalationRules: AgentPermissionProfile['escalationRules'];
}

export class AgentPermissionService {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateAgentPermissionInput): Promise<AgentPermissionProfile> {
    await this.setTenant(input.organizationId);

    const result = await this.pool.query<AgentPermissionRow>(
      `INSERT INTO agent_permission_profiles
         (organization_id, agent_type, agent_name, allowed_tools,
          accessible_knowledge_sources, writable_resources, approval_limits, escalation_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.organizationId,
        input.agentType,
        input.agentName,
        input.allowedTools,
        input.accessibleKnowledgeSources,
        input.writableResources,
        JSON.stringify(input.approvalLimits),
        JSON.stringify(input.escalationRules),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to create agent permission profile');
    return this.mapRow(row);
  }

  async getByAgentType(
    organizationId: string,
    agentType: string,
  ): Promise<AgentPermissionProfile | null> {
    await this.setTenant(organizationId);

    const result = await this.pool.query<AgentPermissionRow>(
      `SELECT * FROM agent_permission_profiles
       WHERE organization_id = $1 AND agent_type = $2 AND is_active = true
       LIMIT 1`,
      [organizationId, agentType],
    );

    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async canWrite(organizationId: string, agentType: string, resource: string): Promise<boolean> {
    const profile = await this.getByAgentType(organizationId, agentType);
    if (!profile) return false;
    return profile.writableResources.includes(resource) || profile.writableResources.includes('*');
  }

  async canUseTool(organizationId: string, agentType: string, tool: string): Promise<boolean> {
    const profile = await this.getByAgentType(organizationId, agentType);
    if (!profile) return false;
    return profile.allowedTools.includes(tool) || profile.allowedTools.includes('*');
  }

  async getApprovalLimit(
    organizationId: string,
    agentType: string,
    action: string,
  ): Promise<number> {
    const profile = await this.getByAgentType(organizationId, agentType);
    if (!profile) return 0;
    return profile.approvalLimits[action] ?? profile.approvalLimits['*'] ?? 0;
  }

  async deactivate(organizationId: string, profileId: string): Promise<void> {
    await this.setTenant(organizationId);

    await this.pool.query(
      `UPDATE agent_permission_profiles SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [profileId, organizationId],
    );
  }

  private async setTenant(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  private mapRow(row: AgentPermissionRow): AgentPermissionProfile {
    return {
      id: row.id,
      organizationId: row.organization_id,
      agentType: row.agent_type,
      agentName: row.agent_name,
      allowedTools: row.allowed_tools,
      accessibleKnowledgeSources: row.accessible_knowledge_sources,
      writableResources: row.writable_resources,
      approvalLimits: row.approval_limits,
      escalationRules: row.escalation_rules,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
