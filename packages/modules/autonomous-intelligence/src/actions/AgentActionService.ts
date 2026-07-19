import type { Pool } from 'pg';
import type { AgentAction, AgentActionStatus } from '../types.js';

interface ActionRow {
  id: string;
  organization_id: string;
  agent_id: string;
  action_type: string;
  status: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
}

function rowToAction(row: ActionRow): AgentAction {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentId: row.agent_id,
    actionType: row.action_type,
    status: row.status as AgentActionStatus,
    payload: row.payload,
    createdAt: row.created_at,
    ...(row.result !== null ? { result: row.result } : {}),
    ...(row.error_message !== null ? { errorMessage: row.error_message } : {}),
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
  };
}

export class AgentActionService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async recordAction(
    orgId: string,
    agentId: string,
    actionType: string,
    payload: Record<string, unknown>,
  ): Promise<AgentAction> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<ActionRow>(
      `INSERT INTO agent_actions (organization_id, agent_id, action_type, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orgId, agentId, actionType, JSON.stringify(payload)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO agent_actions returned no row');
    return rowToAction(row);
  }

  async completeAction(
    orgId: string,
    actionId: string,
    result: Record<string, unknown>,
  ): Promise<AgentAction> {
    await this.setTenantContext(orgId);
    const res = await this.pool.query<ActionRow>(
      `UPDATE agent_actions
       SET status = 'completed', result = $3, completed_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, actionId, JSON.stringify(result)],
    );
    const row = res.rows[0];
    if (!row) throw new Error(`AgentAction not found: ${actionId}`);
    return rowToAction(row);
  }

  async failAction(orgId: string, actionId: string, errorMessage: string): Promise<AgentAction> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<ActionRow>(
      `UPDATE agent_actions
       SET status = 'failed', error_message = $3, completed_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, actionId, errorMessage],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`AgentAction not found: ${actionId}`);
    return rowToAction(row);
  }

  async getActions(orgId: string, agentId: string, limit = 50): Promise<AgentAction[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<ActionRow>(
      `SELECT * FROM agent_actions
       WHERE organization_id = $1 AND agent_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [orgId, agentId, limit],
    );
    return result.rows.map(rowToAction);
  }
}
