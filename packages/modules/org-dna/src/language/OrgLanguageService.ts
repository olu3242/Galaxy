import type { Pool } from 'pg';
import type { OrgLanguageEntry } from '../types.js';

interface LanguageRow {
  id: string;
  organization_id: string;
  term: string;
  definition: string;
  aliases: string[];
  category: string;
  created_at: Date;
  updated_at: Date;
}

function rowToEntry(row: LanguageRow): OrgLanguageEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    term: row.term,
    definition: row.definition,
    aliases: row.aliases,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class OrgLanguageService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async addTerm(
    orgId: string,
    term: string,
    definition: string,
    aliases: string[],
    category: string,
  ): Promise<OrgLanguageEntry> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<LanguageRow>(
      `INSERT INTO org_language_entries (organization_id, term, definition, aliases, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [orgId, term, definition, JSON.stringify(aliases), category],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to add language term');
    return rowToEntry(row);
  }

  async getTerms(orgId: string): Promise<OrgLanguageEntry[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<LanguageRow>(
      'SELECT * FROM org_language_entries WHERE organization_id = $1 ORDER BY term ASC',
      [orgId],
    );
    return result.rows.map(rowToEntry);
  }

  async lookupTerm(orgId: string, term: string): Promise<OrgLanguageEntry | null> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<LanguageRow>(
      'SELECT * FROM org_language_entries WHERE organization_id = $1 AND term = $2',
      [orgId, term],
    );
    const row = result.rows[0];
    return row ? rowToEntry(row) : null;
  }

  async deleteTerm(orgId: string, termId: string): Promise<void> {
    await this.setTenantContext(orgId);
    await this.pool.query(
      'DELETE FROM org_language_entries WHERE organization_id = $1 AND id = $2',
      [orgId, termId],
    );
  }
}
