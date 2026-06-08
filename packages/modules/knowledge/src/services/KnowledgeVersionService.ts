import type { Pool } from 'pg';
import { z } from 'zod';
import type { KnowledgeVersion } from '../types.js';

const CreateVersionSchema = z.object({
  documentId: z.string().uuid(),
  content: z.string().min(1),
  changedBy: z.string().uuid(),
  changeNote: z.string().max(500).optional().default(''),
});

export type CreateVersionInput = z.input<typeof CreateVersionSchema> & {
  organizationId: string;
};

interface VersionRow {
  id: string;
  organization_id: string;
  document_id: string;
  version: number;
  content: string;
  changed_by: string;
  change_note: string;
  created_at: string;
}

function rowToVersion(row: VersionRow): KnowledgeVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    documentId: row.document_id,
    version: row.version,
    content: row.content,
    changedBy: row.changed_by,
    changeNote: row.change_note,
    createdAt: row.created_at,
  };
}

export class KnowledgeVersionService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async createVersion(input: CreateVersionInput): Promise<KnowledgeVersion> {
    const parsed = CreateVersionSchema.parse(input);
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<VersionRow>(
      `INSERT INTO knowledge_versions
         (organization_id, document_id, content, changed_by, change_note,
          version)
       SELECT $1, $2, $3, $4, $5,
              COALESCE(MAX(version), 0) + 1
       FROM knowledge_versions
       WHERE organization_id = $1 AND document_id = $2
       RETURNING *`,
      [
        input.organizationId,
        parsed.documentId,
        parsed.content,
        parsed.changedBy,
        parsed.changeNote,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT RETURNING returned no row');
    return rowToVersion(row);
  }

  async getVersions(organizationId: string, documentId: string): Promise<KnowledgeVersion[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<VersionRow>(
      `SELECT * FROM knowledge_versions
       WHERE organization_id = $1 AND document_id = $2
       ORDER BY version DESC`,
      [organizationId, documentId],
    );

    return result.rows.map(rowToVersion);
  }

  async restoreVersion(
    organizationId: string,
    documentId: string,
    version: number,
    restoredBy: string,
  ): Promise<KnowledgeVersion> {
    await this.setTenantContext(organizationId);

    const versionResult = await this.pool.query<VersionRow>(
      'SELECT * FROM knowledge_versions WHERE organization_id = $1 AND document_id = $2 AND version = $3',
      [organizationId, documentId, version],
    );

    const versionRow = versionResult.rows[0];
    if (!versionRow) {
      throw new Error(`Version ${String(version)} of document ${documentId} not found`);
    }

    await this.pool.query(
      `UPDATE knowledge_documents
       SET content = $1, version = version + 1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [versionRow.content, documentId, organizationId],
    );

    return this.createVersion({
      organizationId,
      documentId,
      content: versionRow.content,
      changedBy: restoredBy,
      changeNote: `Restored from version ${String(version)}`,
    });
  }
}
