import type { Pool } from 'pg';
import type {
  SolutionPack,
  SolutionPackRow,
  PackInstallation,
  PackInstallationRow,
  Industry,
} from './types.js';

function rowToPack(row: SolutionPackRow): SolutionPack {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry as Industry,
    description: row.description,
    version: row.version,
    isPublished: row.is_published,
    packData: row.pack_data,
    createdAt: row.created_at,
  };
}

function rowToInstallation(row: PackInstallationRow): PackInstallation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    packId: row.pack_id,
    installedBy: row.installed_by,
    installedAt: row.installed_at,
    status: row.status as PackInstallation['status'],
  };
}

export interface CreateSolutionPackInput {
  name: string;
  industry: Industry;
  description: string;
  version: string;
  packData: {
    includedWorkflows: string[];
    includedKnowledgeTemplates: string[];
    recommendedAgents: string[];
  };
}

export class SolutionPackService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createPack(input: CreateSolutionPackInput): Promise<SolutionPack> {
    const result = await this.pool.query<SolutionPackRow>(
      `INSERT INTO solution_packs (name, industry, description, version, is_published, pack_data)
       VALUES ($1, $2, $3, $4, false, $5)
       RETURNING *`,
      [
        input.name,
        input.industry,
        input.description,
        input.version,
        JSON.stringify(input.packData),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create solution pack');
    return rowToPack(row);
  }

  async listAvailablePacks(filter?: { industry?: Industry }): Promise<SolutionPack[]> {
    if (filter?.industry !== undefined) {
      const result = await this.pool.query<SolutionPackRow>(
        `SELECT * FROM solution_packs WHERE is_published = true AND industry = $1
         ORDER BY name ASC`,
        [filter.industry],
      );
      return result.rows.map(rowToPack);
    }
    const result = await this.pool.query<SolutionPackRow>(
      `SELECT * FROM solution_packs WHERE is_published = true ORDER BY name ASC`,
    );
    return result.rows.map(rowToPack);
  }

  async getPack(packId: string): Promise<SolutionPack | undefined> {
    const result = await this.pool.query<SolutionPackRow>(
      `SELECT * FROM solution_packs WHERE id = $1`,
      [packId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return rowToPack(row);
  }

  async installPack(orgId: string, packId: string, installedBy: string): Promise<PackInstallation> {
    await this.setTenantContext(orgId);

    // Check pack exists
    const pack = await this.getPack(packId);
    if (!pack) throw new Error('Solution pack not found');

    const result = await this.pool.query<PackInstallationRow>(
      `INSERT INTO solution_pack_installations
        (organization_id, pack_id, installed_by, status)
       VALUES ($1, $2, $3, 'installed')
       RETURNING *`,
      [orgId, packId, installedBy],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to install solution pack');
    return rowToInstallation(row);
  }

  async listInstallations(orgId: string): Promise<PackInstallation[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<PackInstallationRow>(
      `SELECT * FROM solution_pack_installations
       WHERE organization_id = $1
       ORDER BY installed_at DESC`,
      [orgId],
    );
    return result.rows.map(rowToInstallation);
  }
}
