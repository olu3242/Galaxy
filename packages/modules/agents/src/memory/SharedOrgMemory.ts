import crypto from 'node:crypto';
import type { Pool } from 'pg';

export type OrgMemoryCategory =
  | 'intent'
  | 'decision'
  | 'lesson'
  | 'knowledge'
  | 'artifact'
  | 'feedback';

export type OrgMemorySourceType =
  | 'workflow_execution'
  | 'approval'
  | 'conversation'
  | 'agent_decision'
  | 'manual';

export interface OrgMemoryEntry {
  id: string;
  organizationId: string;
  category: OrgMemoryCategory;
  title: string;
  content: string;
  embedding?: number[];
  tags: string[];
  confidence: number;
  sourceType: OrgMemorySourceType;
  sourceId: string;
  correlationId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  version: number;
}

interface OrgMemoryRow {
  id: string;
  organization_id: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
  confidence: string;
  source_type: string;
  source_id: string;
  correlation_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  version: number;
}

function rowToEntry(row: OrgMemoryRow): OrgMemoryEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    category: row.category as OrgMemoryCategory,
    title: row.title,
    content: row.content,
    tags: row.tags,
    confidence: parseFloat(row.confidence),
    sourceType: row.source_type as OrgMemorySourceType,
    sourceId: row.source_id,
    correlationId: row.correlation_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    ...(row.expires_at !== null ? { expiresAt: row.expires_at } : {}),
  };
}

export type StoreInput = Omit<OrgMemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'version'>;

export interface RecordLessonInput {
  title: string;
  content: string;
  confidence: number;
  sourceType: OrgMemorySourceType;
  sourceId: string;
  correlationId: string;
  createdBy: string;
  tags?: string[];
}

export class SharedOrgMemory {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  /**
   * Store a memory entry. Append-only: always INSERTs a new row.
   * If updating an existing logical entry, pass the same id with a higher version;
   * this method always generates a fresh UUID so each call produces a new row.
   */
  async store(input: StoreInput): Promise<OrgMemoryEntry> {
    await this.setTenantContext(input.organizationId);

    const id = crypto.randomUUID();

    const result = await this.pool.query<OrgMemoryRow>(
      `INSERT INTO org_memory_entries
         (id, organization_id, category, title, content, tags, confidence,
          source_type, source_id, correlation_id, created_by, expires_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        id,
        input.organizationId,
        input.category,
        input.title,
        input.content,
        input.tags,
        input.confidence,
        input.sourceType,
        input.sourceId,
        input.correlationId,
        input.createdBy,
        input.expiresAt ?? null,
        1,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT into org_memory_entries returned no row');
    return rowToEntry(row);
  }

  /**
   * Retrieve relevant memory by keyword search (ILIKE on title, content, and tags).
   * No embeddings required.
   */
  async retrieve(
    organizationId: string,
    query: string,
    category?: string,
    limit = 20,
  ): Promise<OrgMemoryEntry[]> {
    await this.setTenantContext(organizationId);

    const pattern = `%${query}%`;
    const params: unknown[] = [organizationId, pattern, pattern, pattern];
    let categoryClause = '';
    if (category !== undefined) {
      params.push(category);
      categoryClause = `AND category = $${String(params.length)}`;
    }
    params.push(limit);

    const result = await this.pool.query<OrgMemoryRow>(
      `SELECT * FROM org_memory_entries
       WHERE organization_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (title ILIKE $2 OR content ILIKE $3 OR EXISTS (
               SELECT 1 FROM unnest(tags) AS t WHERE t ILIKE $4
             ))
         ${categoryClause}
       ORDER BY confidence DESC, created_at DESC
       LIMIT $${String(params.length)}`,
      params,
    );

    return result.rows.map(rowToEntry);
  }

  /**
   * Get the latest version of a specific memory entry by its logical id.
   * The logical id is the id column of the first stored version; subsequent
   * versions store the same value in source_id with source_type = 'agent_decision'.
   * For simplicity, "latest" means the row with the highest version among rows
   * sharing the same id value.
   */
  async getLatest(organizationId: string, entryId: string): Promise<OrgMemoryEntry | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<OrgMemoryRow>(
      `SELECT * FROM org_memory_entries
       WHERE organization_id = $1 AND id = $2
       ORDER BY version DESC
       LIMIT 1`,
      [organizationId, entryId],
    );

    const row = result.rows[0];
    return row ? rowToEntry(row) : null;
  }

  /**
   * Get full version history of a memory entry ordered oldest-first.
   * All versions share the same logical id stored in the source_id field
   * when source_type is set to reflect a versioned update chain.
   *
   * The simplest approach: history is all rows whose id equals entryId OR
   * whose (source_type = 'agent_decision' AND source_id = entryId) — but per the
   * spec, the schema stores version as an integer column on each row. We surface
   * all rows with the given id (the original row plus any that were inserted as
   * new versions with the same id, which requires the caller to pass the same id
   * on updates).
   */
  async getHistory(organizationId: string, entryId: string): Promise<OrgMemoryEntry[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<OrgMemoryRow>(
      `SELECT * FROM org_memory_entries
       WHERE organization_id = $1 AND id = $2
       ORDER BY version ASC`,
      [organizationId, entryId],
    );

    return result.rows.map(rowToEntry);
  }

  /** List the most recent entries for a given category. */
  async listRecent(
    organizationId: string,
    category: string,
    limit: number,
  ): Promise<OrgMemoryEntry[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<OrgMemoryRow>(
      `SELECT * FROM org_memory_entries
       WHERE organization_id = $1
         AND category = $2
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT $3`,
      [organizationId, category, limit],
    );

    return result.rows.map(rowToEntry);
  }

  /** Convenience method: record a lesson learned after a workflow execution. */
  async recordLesson(organizationId: string, lesson: RecordLessonInput): Promise<OrgMemoryEntry> {
    return this.store({
      organizationId,
      category: 'lesson',
      title: lesson.title,
      content: lesson.content,
      tags: lesson.tags ?? [],
      confidence: lesson.confidence,
      sourceType: lesson.sourceType,
      sourceId: lesson.sourceId,
      correlationId: lesson.correlationId,
      createdBy: lesson.createdBy,
    });
  }
}
