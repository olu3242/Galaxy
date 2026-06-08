import type { Pool } from 'pg';
import type { SolutionPackTemplate, SolutionPackTemplateRow, Industry } from './types.js';

function rowToTemplate(row: SolutionPackTemplateRow): SolutionPackTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    industry: row.industry !== null ? (row.industry as Industry) : null,
    description: row.description,
    steps: row.steps,
    category: row.category,
    isSystem: row.is_system,
    createdAt: row.created_at,
  };
}

export interface CreateTemplateInput {
  organizationId?: string;
  name: string;
  industry?: Industry;
  description: string;
  steps: Record<string, unknown>;
  category: string;
  isSystem?: boolean;
}

export class SolutionPackTemplateService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createTemplate(input: CreateTemplateInput): Promise<SolutionPackTemplate> {
    if (input.organizationId !== undefined) {
      await this.setTenantContext(input.organizationId);
    }
    const result = await this.pool.query<SolutionPackTemplateRow>(
      `INSERT INTO workflow_templates
        (organization_id, name, industry, description, steps, category, is_system)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.organizationId ?? null,
        input.name,
        input.industry ?? null,
        input.description,
        JSON.stringify(input.steps),
        input.category,
        input.isSystem ?? false,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create template');
    return rowToTemplate(row);
  }

  async listTemplates(orgId: string): Promise<SolutionPackTemplate[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<SolutionPackTemplateRow>(
      `SELECT * FROM workflow_templates
       WHERE organization_id IS NULL OR organization_id = $1
       ORDER BY is_system DESC, name ASC`,
      [orgId],
    );
    return result.rows.map(rowToTemplate);
  }

  async getTemplate(
    orgId: string,
    templateId: string,
  ): Promise<SolutionPackTemplate | undefined> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<SolutionPackTemplateRow>(
      `SELECT * FROM workflow_templates
       WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)`,
      [templateId, orgId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return rowToTemplate(row);
  }

  async applyTemplate(
    orgId: string,
    templateId: string,
    name: string,
  ): Promise<{ templateId: string; workflowName: string; steps: Record<string, unknown> }> {
    const template = await this.getTemplate(orgId, templateId);
    if (!template) throw new Error('Template not found');
    return {
      templateId: template.id,
      workflowName: name,
      steps: template.steps,
    };
  }
}
