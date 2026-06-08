import type { Pool } from 'pg';
import { z } from 'zod';
import type {
  DashboardCategory,
  DashboardWidget,
  DashboardWidgetRow,
  WidgetType,
} from '../types.js';

const CreateWidgetSchema = z.object({
  category: z.enum([
    'executive',
    'operations',
    'department',
    'workflow',
    'communication',
    'compliance',
    'platform',
  ]),
  name: z.string().min(1).max(200),
  type: z.enum(['chart', 'metric', 'table', 'gauge', 'heatmap']),
  config: z.record(z.unknown()).optional().default({}),
  position: z.number().int().min(0).optional().default(0),
});

export type CreateWidgetInput = z.input<typeof CreateWidgetSchema> & { organizationId: string };

function rowToWidget(row: DashboardWidgetRow): DashboardWidget {
  return {
    id: row.id,
    organizationId: row.organization_id,
    category: row.category as DashboardCategory,
    name: row.name,
    type: row.type as WidgetType,
    config: row.config,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface Dashboard {
  category: DashboardCategory;
  organizationId: string;
  widgets: DashboardWidget[];
}

export class DashboardService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async createWidget(input: CreateWidgetInput): Promise<DashboardWidget> {
    const parsed = CreateWidgetSchema.parse(input);
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<DashboardWidgetRow>(
      `INSERT INTO dashboard_widgets
         (organization_id, category, name, type, config, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        parsed.category,
        parsed.name,
        parsed.type,
        JSON.stringify(parsed.config),
        parsed.position,
      ],
    );

    return rowToWidget(result.rows[0]!);
  }

  async getWidgets(
    organizationId: string,
    category?: DashboardCategory,
  ): Promise<DashboardWidget[]> {
    await this.setTenantContext(organizationId);

    const conditions = ['organization_id = $1'];
    const params: unknown[] = [organizationId];

    if (category) {
      conditions.push('category = $2');
      params.push(category);
    }

    const result = await this.pool.query<DashboardWidgetRow>(
      `SELECT * FROM dashboard_widgets WHERE ${conditions.join(' AND ')} ORDER BY position ASC`,
      params,
    );

    return result.rows.map(rowToWidget);
  }

  async getDashboard(organizationId: string, category: DashboardCategory): Promise<Dashboard> {
    const widgets = await this.getWidgets(organizationId, category);
    return { category, organizationId, widgets };
  }
}
