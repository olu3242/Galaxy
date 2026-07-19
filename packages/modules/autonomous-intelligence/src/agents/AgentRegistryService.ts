import type { Pool } from 'pg';
import type { AgentStatus, AgentType, AutonomousAgent } from '../types.js';

interface AgentRow {
  id: string;
  organization_id: string;
  agent_type: string;
  status: string;
  last_run_at: Date | null;
  next_run_at: Date | null;
  config: Record<string, unknown>;
  metrics: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function rowToAgent(row: AgentRow): AutonomousAgent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentType: row.agent_type as AgentType,
    status: row.status as AgentStatus,
    config: row.config,
    metrics: row.metrics,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.last_run_at !== null ? { lastRunAt: row.last_run_at } : {}),
    ...(row.next_run_at !== null ? { nextRunAt: row.next_run_at } : {}),
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

  async registerAgent(
    orgId: string,
    agentType: AgentType,
    config: Record<string, unknown>,
  ): Promise<AutonomousAgent> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<AgentRow>(
      `INSERT INTO autonomous_agents (organization_id, agent_type, config)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, agent_type)
       DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()
       RETURNING *`,
      [orgId, agentType, JSON.stringify(config)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO autonomous_agents returned no row');
    return rowToAgent(row);
  }

  async getAgent(orgId: string, agentId: string): Promise<AutonomousAgent> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<AgentRow>(
      `SELECT * FROM autonomous_agents WHERE organization_id = $1 AND id = $2`,
      [orgId, agentId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Agent not found: ${agentId}`);
    return rowToAgent(row);
  }

  async listAgents(orgId: string): Promise<AutonomousAgent[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<AgentRow>(
      `SELECT * FROM autonomous_agents WHERE organization_id = $1 ORDER BY created_at DESC`,
      [orgId],
    );
    return result.rows.map(rowToAgent);
  }

  async updateAgentStatus(
    orgId: string,
    agentId: string,
    status: AgentStatus,
  ): Promise<AutonomousAgent> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<AgentRow>(
      `UPDATE autonomous_agents
       SET status = $3, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, agentId, status],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Agent not found: ${agentId}`);
    return rowToAgent(row);
  }

  async updateAgentMetrics(
    orgId: string,
    agentId: string,
    metrics: Record<string, unknown>,
  ): Promise<AutonomousAgent> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<AgentRow>(
      `UPDATE autonomous_agents
       SET metrics = $3, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, agentId, JSON.stringify(metrics)],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Agent not found: ${agentId}`);
    return rowToAgent(row);
  }
}
