import type { Pool } from 'pg';
import type { OrgMemory, StoreMemoryInput, RecallQuery, MemoryStats, MemoryType } from './types.js';

interface DbMemory {
  id: string;
  organization_id: string;
  memory_type: string;
  subject: string;
  content: string;
  source: string;
  confidence: string;
  relevance_tags: string[];
  is_valid: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapMemory(row: DbMemory): OrgMemory {
  return {
    id: row.id,
    organizationId: row.organization_id,
    memoryType: row.memory_type as MemoryType,
    subject: row.subject,
    content: row.content,
    source: row.source,
    confidence: parseFloat(row.confidence),
    relevanceTags: row.relevance_tags,
    isValid: row.is_valid,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class OrgMemoryService {
  constructor(private readonly pool: Pool) {}

  async store(orgId: string, input: StoreMemoryInput): Promise<OrgMemory> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<DbMemory>(
      `INSERT INTO org_memories
        (organization_id, memory_type, subject, content, source, confidence, relevance_tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        orgId,
        input.memoryType,
        input.subject,
        input.content,
        input.source,
        input.confidence ?? 1.0,
        input.relevanceTags ?? [],
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO org_memories returned no row');
    return mapMemory(row);
  }

  async recall(orgId: string, query: RecallQuery): Promise<OrgMemory[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const conditions = ['organization_id = $1'];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (query.type !== undefined) {
      conditions.push(`memory_type = $${String(idx)}`);
      params.push(query.type);
      idx++;
    }
    if (query.onlyValid !== false) {
      conditions.push('is_valid = TRUE');
    }
    if (query.tags !== undefined && query.tags.length > 0) {
      conditions.push(`relevance_tags && $${String(idx)}`);
      params.push(query.tags);
      idx++;
    }

    const limit = query.limit ?? 20;
    params.push(limit);

    const result = await this.pool.query<DbMemory>(
      `SELECT * FROM org_memories
       WHERE ${conditions.join(' AND ')}
       ORDER BY confidence DESC, created_at DESC
       LIMIT $${String(idx)}`,
      params,
    );
    return result.rows.map(mapMemory);
  }

  async invalidate(orgId: string, memoryId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    await this.pool.query(
      `UPDATE org_memories SET is_valid = FALSE, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [memoryId, orgId],
    );
  }

  async getMemoryStats(orgId: string): Promise<MemoryStats> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<{
      memory_type: string;
      count: string;
      avg_confidence: string;
      invalid_count: string;
    }>(
      `SELECT
        memory_type,
        COUNT(*)::text AS count,
        AVG(confidence)::text AS avg_confidence,
        COUNT(*) FILTER (WHERE is_valid = FALSE)::text AS invalid_count
       FROM org_memories
       WHERE organization_id = $1
       GROUP BY memory_type`,
      [orgId],
    );

    const byType: Record<string, number> = {};
    let total = 0;
    let totalConfidence = 0;
    let invalidCount = 0;

    for (const row of result.rows) {
      const count = parseInt(row.count, 10);
      byType[row.memory_type] = count;
      total += count;
      totalConfidence += parseFloat(row.avg_confidence) * count;
      invalidCount += parseInt(row.invalid_count, 10);
    }

    return {
      total,
      byType: byType as Record<MemoryType, number>,
      averageConfidence: total > 0 ? totalConfidence / total : 0,
      invalidCount,
    };
  }
}
