import type { Pool } from 'pg';

export type MemoryScope = 'short_term' | 'long_term' | 'episodic' | 'organizational' | 'semantic';

export interface MemoryEntry {
  id: string;
  agentId: string;
  organizationId: string;
  scope: MemoryScope;
  key: string;
  value: Record<string, unknown>;
  relevanceScore: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryWriteInput {
  agentId: string;
  organizationId: string;
  scope: MemoryScope;
  key: string;
  value: Record<string, unknown>;
  relevanceScore?: number;
  ttlSeconds?: number;
}

export interface MemoryReadInput {
  agentId: string;
  organizationId: string;
  scope?: MemoryScope;
  key?: string;
  limit?: number;
  minRelevance?: number;
}

export class GxMemoryEngine {
  constructor(private readonly pool: Pool) {}

  async write(input: MemoryWriteInput): Promise<MemoryEntry> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const expiresAt =
      input.ttlSeconds !== undefined
        ? new Date(Date.now() + input.ttlSeconds * 1000).toISOString()
        : null;

    const result = await this.pool.query<{
      id: string;
      agent_id: string;
      organization_id: string;
      scope: string;
      key: string;
      value: Record<string, unknown>;
      relevance_score: number;
      expires_at: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO agent_memories (agent_id, organization_id, scope, key, value, relevance_score, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (agent_id, organization_id, scope, key)
       DO UPDATE SET value = EXCLUDED.value, relevance_score = EXCLUDED.relevance_score,
         expires_at = EXCLUDED.expires_at, updated_at = NOW()
       RETURNING *`,
      [
        input.agentId,
        input.organizationId,
        input.scope,
        input.key,
        JSON.stringify(input.value),
        input.relevanceScore ?? 0.5,
        expiresAt,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Memory write returned no row');

    const entry: MemoryEntry = {
      id: row.id,
      agentId: row.agent_id,
      organizationId: row.organization_id,
      scope: row.scope as MemoryScope,
      key: row.key,
      value: row.value,
      relevanceScore: row.relevance_score,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (row.expires_at !== null) entry.expiresAt = row.expires_at;
    return entry;
  }

  async read(input: MemoryReadInput): Promise<MemoryEntry[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const conditions: string[] = [
      'agent_id = $1',
      'organization_id = $2',
      '(expires_at IS NULL OR expires_at > NOW())',
    ];
    const params: unknown[] = [input.agentId, input.organizationId];
    let idx = 3;

    if (input.scope !== undefined) {
      conditions.push(`scope = $${String(idx)}`);
      params.push(input.scope);
      idx++;
    }
    if (input.key !== undefined) {
      conditions.push(`key = $${String(idx)}`);
      params.push(input.key);
      idx++;
    }
    if (input.minRelevance !== undefined) {
      conditions.push(`relevance_score >= $${String(idx)}`);
      params.push(input.minRelevance);
      idx++;
    }

    const limit = input.limit ?? 20;

    const result = await this.pool.query<{
      id: string;
      agent_id: string;
      organization_id: string;
      scope: string;
      key: string;
      value: Record<string, unknown>;
      relevance_score: number;
      expires_at: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM agent_memories WHERE ${conditions.join(' AND ')}
       ORDER BY relevance_score DESC, updated_at DESC LIMIT ${String(limit)}`,
      params,
    );

    return result.rows.map((row) => {
      const entry: MemoryEntry = {
        id: row.id,
        agentId: row.agent_id,
        organizationId: row.organization_id,
        scope: row.scope as MemoryScope,
        key: row.key,
        value: row.value,
        relevanceScore: row.relevance_score,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      if (row.expires_at !== null) entry.expiresAt = row.expires_at;
      return entry;
    });
  }

  async forget(
    agentId: string,
    organizationId: string,
    key: string,
    scope: MemoryScope,
  ): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    await this.pool.query(
      'DELETE FROM agent_memories WHERE agent_id = $1 AND organization_id = $2 AND key = $3 AND scope = $4',
      [agentId, organizationId, key, scope],
    );
  }

  async consolidate(agentId: string, organizationId: string): Promise<number> {
    // Promote high-relevance short_term memories to long_term
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<{ count: string }>(
      `WITH promoted AS (
         UPDATE agent_memories SET scope = 'long_term', updated_at = NOW()
         WHERE agent_id = $1 AND organization_id = $2 AND scope = 'short_term'
           AND relevance_score >= 0.8
         RETURNING id
       )
       SELECT COUNT(*) AS count FROM promoted`,
      [agentId, organizationId],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}
