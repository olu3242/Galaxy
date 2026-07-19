import type { Pool } from 'pg';
import type { OrgDNA } from '../types.js';

type DNAField = 'identityProfile' | 'operatingProfile' | 'workflowProfile' | 'languageProfile';

const fieldToColumn: Record<DNAField, string> = {
  identityProfile: 'identity_profile',
  operatingProfile: 'operating_profile',
  workflowProfile: 'workflow_profile',
  languageProfile: 'language_profile',
};

interface DNARow {
  id: string;
  organization_id: string;
  identity_profile: Record<string, unknown>;
  operating_profile: Record<string, unknown>;
  workflow_profile: Record<string, unknown>;
  language_profile: Record<string, unknown>;
  industry_blueprint: string | null;
  completeness_score: number;
  version: number;
  created_at: Date;
  updated_at: Date;
}

function rowToDNA(row: DNARow): OrgDNA {
  return {
    id: row.id,
    organizationId: row.organization_id,
    identityProfile: row.identity_profile,
    operatingProfile: row.operating_profile,
    workflowProfile: row.workflow_profile,
    languageProfile: row.language_profile,
    completenessScore: row.completeness_score,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.industry_blueprint !== null ? { industryBlueprint: row.industry_blueprint } : {}),
  };
}

export class OrgDNAService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async upsertDNA(
    orgId: string,
    identityProfile: Record<string, unknown>,
    operatingProfile: Record<string, unknown>,
    workflowProfile: Record<string, unknown>,
    languageProfile: Record<string, unknown>,
    industryBlueprint?: string,
  ): Promise<OrgDNA> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<DNARow>(
      `INSERT INTO org_dna
         (organization_id, identity_profile, operating_profile, workflow_profile, language_profile, industry_blueprint)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id)
       DO UPDATE SET
         identity_profile = EXCLUDED.identity_profile,
         operating_profile = EXCLUDED.operating_profile,
         workflow_profile = EXCLUDED.workflow_profile,
         language_profile = EXCLUDED.language_profile,
         industry_blueprint = EXCLUDED.industry_blueprint,
         version = org_dna.version + 1,
         updated_at = NOW()
       RETURNING *`,
      [
        orgId,
        JSON.stringify(identityProfile),
        JSON.stringify(operatingProfile),
        JSON.stringify(workflowProfile),
        JSON.stringify(languageProfile),
        industryBlueprint ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to upsert org DNA');
    return rowToDNA(row);
  }

  async getDNA(orgId: string): Promise<OrgDNA | null> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<DNARow>(
      'SELECT * FROM org_dna WHERE organization_id = $1',
      [orgId],
    );
    const row = result.rows[0];
    return row ? rowToDNA(row) : null;
  }

  async updateDNAField(
    orgId: string,
    field: DNAField,
    value: Record<string, unknown>,
  ): Promise<OrgDNA> {
    await this.setTenantContext(orgId);
    const column = fieldToColumn[field];
    const result = await this.pool.query<DNARow>(
      `UPDATE org_dna
       SET ${column} = $3, version = version + 1, updated_at = NOW()
       WHERE organization_id = $1 AND id = (SELECT id FROM org_dna WHERE organization_id = $2)
       RETURNING *`,
      [orgId, orgId, JSON.stringify(value)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Org DNA not found');
    return rowToDNA(row);
  }

  async computeCompleteness(orgId: string): Promise<number> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<DNARow>(
      'SELECT * FROM org_dna WHERE organization_id = $1',
      [orgId],
    );
    const row = result.rows[0];
    if (!row) return 0;

    let filled = 0;
    const total = 5;

    if (Object.keys(row.identity_profile).length > 0) filled++;
    if (Object.keys(row.operating_profile).length > 0) filled++;
    if (Object.keys(row.workflow_profile).length > 0) filled++;
    if (Object.keys(row.language_profile).length > 0) filled++;
    if (row.industry_blueprint !== null) filled++;

    const score = Math.round((filled / total) * 100);

    await this.pool.query(
      'UPDATE org_dna SET completeness_score = $2, updated_at = NOW() WHERE organization_id = $1',
      [orgId, score],
    );

    return score;
  }
}
