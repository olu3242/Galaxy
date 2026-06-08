import type { Pool } from 'pg';
import { z } from 'zod';
import type { DashboardCategory, Report, ReportRow, ReportTemplate } from '../types.js';

const GenerateReportSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum([
    'executive',
    'operations',
    'department',
    'workflow',
    'communication',
    'compliance',
    'platform',
  ]),
  templateId: z.string().uuid().optional(),
  generatedBy: z.string().uuid(),
});

export type GenerateReportInput = z.input<typeof GenerateReportSchema> & {
  organizationId: string;
  data?: Record<string, unknown>;
};

function rowToReport(row: ReportRow): Report {
  return {
    id: row.id,
    organizationId: row.organization_id,
    templateId: row.template_id,
    name: row.name,
    category: row.category as DashboardCategory,
    status: row.status as Report['status'],
    data: row.data,
    generatedBy: row.generated_by,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  };
}

export class ReportingService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async generateReport(input: GenerateReportInput): Promise<Report> {
    const parsed = GenerateReportSchema.parse(input);
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<ReportRow>(
      `INSERT INTO reports
         (organization_id, template_id, name, category, status, data, generated_by, generated_at)
       VALUES ($1, $2, $3, $4, 'ready', $5, $6, NOW())
       RETURNING *`,
      [
        input.organizationId,
        parsed.templateId ?? null,
        parsed.name,
        parsed.category,
        JSON.stringify(input.data ?? {}),
        parsed.generatedBy,
      ],
    );

    return rowToReport(result.rows[0]!);
  }

  async getReports(
    organizationId: string,
    category?: DashboardCategory,
  ): Promise<Report[]> {
    await this.setTenantContext(organizationId);

    const conditions = ['organization_id = $1'];
    const params: unknown[] = [organizationId];

    if (category) {
      conditions.push('category = $2');
      params.push(category);
    }

    const result = await this.pool.query<ReportRow>(
      `SELECT * FROM reports WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 100`,
      params,
    );

    return result.rows.map(rowToReport);
  }

  async getReportTemplates(organizationId: string): Promise<ReportTemplate[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      name: string;
      description: string;
      category: string;
      config: Record<string, unknown>;
      created_at: string;
    }>(
      'SELECT * FROM report_templates WHERE organization_id = $1 ORDER BY name ASC',
      [organizationId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      category: row.category as DashboardCategory,
      config: row.config,
      createdAt: row.created_at,
    }));
  }
}
