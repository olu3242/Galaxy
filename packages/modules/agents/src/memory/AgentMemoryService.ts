import type { Pool } from 'pg';
import type { AgentMemory, MemoryType } from '../types.js';

interface MemoryRow {
  id: string;
  organization_id: string;
  agent_id: string;
  memory_type: string;
  key: string;
  value: Record<string, unknown>;
  relevance_score: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToMemory(row: MemoryRow): AgentMemory {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentId: row.agent_id,
    memoryType: row.memory_type as MemoryType,
    key: row.key,
    value: row.value,
    relevanceScore: parseFloat(row.relevance_score),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.expires_at !== null ? { expiresAt: row.expires_at } : {}),
  };
}

export class AgentMemoryService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async remember(
    organizationId: string,
    agentId: string,
    memoryType: MemoryType,
    key: string,
    value: Record<string, unknown>,
    opts?: { relevanceScore?: number; expiresAt?: string },
  ): Promise<AgentMemory> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<MemoryRow>(
      `INSERT INTO agent_memory
         (organization_id, agent_id, memory_type, key, value, relevance_score, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, agent_id, memory_type, key)
       DO UPDATE SET value = EXCLUDED.value,
                     relevance_score = EXCLUDED.relevance_score,
                     expires_at = EXCLUDED.expires_at,
                     updated_at = NOW()
       RETURNING *`,
      [
        organizationId,
        agentId,
        memoryType,
        key,
        JSON.stringify(value),
        opts?.relevanceScore ?? 1.0,
        opts?.expiresAt ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Upsert into agent_memory returned no row');
    return rowToMemory(row);
  }

  async recall(
    organizationId: string,
    agentId: string,
    memoryType?: MemoryType,
    limit = 50,
  ): Promise<AgentMemory[]> {
    await this.setTenantContext(organizationId);
    const conditions: string[] = [
      'organization_id = $1',
      'agent_id = $2',
      '(expires_at IS NULL OR expires_at > NOW())',
    ];
    const params: unknown[] = [organizationId, agentId];
    let idx = 3;
    if (memoryType !== undefined) {
      conditions.push(`memory_type = $${String(idx)}`);
      params.push(memoryType);
      idx++;
    }
    params.push(limit);
    const result = await this.pool.query<MemoryRow>(
      `SELECT * FROM agent_memory WHERE ${conditions.join(' AND ')}
       ORDER BY relevance_score DESC, updated_at DESC LIMIT $${String(idx)}`,
      params,
    );
    return result.rows.map(rowToMemory);
  }

  async forget(
    organizationId: string,
    agentId: string,
    memoryType: MemoryType,
    key: string,
  ): Promise<void> {
    await this.setTenantContext(organizationId);
    await this.pool.query(
      `DELETE FROM agent_memory WHERE organization_id = $1 AND agent_id = $2 AND memory_type = $3 AND key = $4`,
      [organizationId, agentId, memoryType, key],
    );
  }

  async purgeExpired(organizationId: string): Promise<number> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM agent_memory WHERE organization_id = $1 AND expires_at < NOW() RETURNING id
       ) SELECT COUNT(*) AS count FROM deleted`,
      [organizationId],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}
