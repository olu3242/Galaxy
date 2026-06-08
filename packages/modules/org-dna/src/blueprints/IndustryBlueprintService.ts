import type { Pool } from 'pg';
import type { IndustryBlueprint, OrgDNA } from '../types.js';
import { OrgDNAService } from '../dna/OrgDNAService.js';

interface BlueprintRow {
  id: string;
  industry: string;
  name: string;
  description: string;
  default_workflows: Record<string, unknown>;
  default_roles: Record<string, unknown>;
  default_policies: Record<string, unknown>;
  created_at: Date;
}

function rowToBlueprint(row: BlueprintRow): IndustryBlueprint {
  return {
    id: row.id,
    industry: row.industry,
    name: row.name,
    description: row.description,
    defaultWorkflows: row.default_workflows,
    defaultRoles: row.default_roles,
    defaultPolicies: row.default_policies,
    createdAt: row.created_at,
  };
}

export class IndustryBlueprintService {
  private readonly dnaService: OrgDNAService;

  constructor(private readonly pool: Pool) {
    this.dnaService = new OrgDNAService(pool);
  }

  async getBlueprint(industry: string): Promise<IndustryBlueprint | null> {
    const result = await this.pool.query<BlueprintRow>(
      'SELECT * FROM industry_blueprints WHERE industry = $1',
      [industry],
    );
    const row = result.rows[0];
    return row ? rowToBlueprint(row) : null;
  }

  async listBlueprints(): Promise<IndustryBlueprint[]> {
    const result = await this.pool.query<BlueprintRow>(
      'SELECT * FROM industry_blueprints ORDER BY industry ASC',
    );
    return result.rows.map(rowToBlueprint);
  }

  async applyBlueprint(orgId: string, industry: string): Promise<OrgDNA> {
    const blueprint = await this.getBlueprint(industry);
    if (!blueprint) throw new Error('Industry blueprint not found');

    const existing = await this.dnaService.getDNA(orgId);

    const workflowProfile = {
      ...(existing?.workflowProfile ?? {}),
      ...blueprint.defaultWorkflows,
    };
    const identityProfile = {
      ...(existing?.identityProfile ?? {}),
      industry,
    };
    const operatingProfile = {
      ...(existing?.operatingProfile ?? {}),
      defaultRoles: blueprint.defaultRoles,
    };
    const languageProfile = existing?.languageProfile ?? {};

    return this.dnaService.upsertDNA(
      orgId,
      identityProfile,
      operatingProfile,
      workflowProfile,
      languageProfile,
      industry,
    );
  }
}
