import type { Pool } from 'pg';
import type { Agent, AgentCapability, AgentType, RegisterAgentInput } from '../types.js';

interface AgentRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  agent_type: string;
  capabilities: string[];
  automation_domains: string[];
  config: Record<string, unknown>;
  is_active: boolean;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    agentType: row.agent_type as AgentType,
    capabilities: row.capabilities as AgentCapability[],
    automationDomains: row.automation_domains,
    config: row.config,
    isActive: row.is_active,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.description !== null ? { description: row.description } : {}),
  };
}

export class AgentRegistryService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async registerAgent(input: RegisterAgentInput): Promise<Agent> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<AgentRow>(
      `INSERT INTO agents
         (organization_id, name, description, agent_type, capabilities,
          automation_domains, config, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.description ?? null,
        input.agentType,
        input.capabilities,
        input.automationDomains,
        JSON.stringify(input.config ?? {}),
        input.createdBy,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO agents returned no row');
    return rowToAgent(row);
  }

  async getAgent(organizationId: string, agentId: string): Promise<Agent | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AgentRow>(
      `SELECT * FROM agents WHERE organization_id = $1 AND id = $2`,
      [organizationId, agentId],
    );
    const row = result.rows[0];
    return row !== undefined ? rowToAgent(row) : null;
  }

  async listAgents(
    organizationId: string,
    opts?: { agentType?: AgentType; isActive?: boolean },
  ): Promise<Agent[]> {
    await this.setTenantContext(organizationId);
    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;
    if (opts?.agentType !== undefined) {
      conditions.push(`agent_type = $${String(idx)}`);
      params.push(opts.agentType);
      idx++;
    }
    if (opts?.isActive !== undefined) {
      conditions.push(`is_active = $${String(idx)}`);
      params.push(opts.isActive);
    }
    const result = await this.pool.query<AgentRow>(
      `SELECT * FROM agents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params,
    );
    return result.rows.map(rowToAgent);
  }

  async deactivateAgent(organizationId: string, agentId: string): Promise<Agent> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AgentRow>(
      `UPDATE agents SET is_active = false, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [organizationId, agentId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Agent not found: ${agentId}`);
    return rowToAgent(row);
  }
}
