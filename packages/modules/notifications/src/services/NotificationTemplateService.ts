import type { Pool } from 'pg';
import { z } from 'zod';
import type { NotificationTemplateRow } from '../types.js';

export interface NotificationTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  channel: string;
  subject: string | null;
  body: string;
  variables: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  organizationId: string;
  name: string;
  description?: string;
  channel: string;
  subject?: string;
  body: string;
  variables?: string[];
  createdBy: string;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  subject?: string;
  body?: string;
  variables?: string[];
  isActive?: boolean;
}

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  channel: z.enum(['in_app', 'email', 'whatsapp', 'sms']),
  body: z.string().min(1),
  subject: z.string().optional(),
  description: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

function rowToTemplate(row: NotificationTemplateRow): NotificationTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    variables: row.variables,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Renders a template body by substituting {{variable}} placeholders.
 */
export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? `{{${key}}}`);
}

export class NotificationTemplateService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async create(input: CreateTemplateInput): Promise<NotificationTemplate> {
    const parsed = CreateTemplateSchema.parse({
      name: input.name,
      channel: input.channel,
      body: input.body,
      subject: input.subject,
      description: input.description,
      variables: input.variables,
    });

    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<NotificationTemplateRow>(
      `INSERT INTO notification_templates
         (organization_id, name, description, channel, subject, body, variables, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.organizationId,
        parsed.name,
        parsed.description ?? null,
        parsed.channel,
        parsed.subject ?? null,
        parsed.body,
        JSON.stringify(parsed.variables ?? []),
        input.createdBy,
      ],
    );

    const created = result.rows[0];
    if (!created) throw new Error('INSERT RETURNING returned no row');
    return rowToTemplate(created);
  }

  async getById(organizationId: string, templateId: string): Promise<NotificationTemplate | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<NotificationTemplateRow>(
      'SELECT * FROM notification_templates WHERE id = $1 AND organization_id = $2',
      [templateId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToTemplate(row) : null;
  }

  async update(
    organizationId: string,
    templateId: string,
    input: UpdateTemplateInput,
  ): Promise<NotificationTemplate> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<NotificationTemplateRow>(
      `UPDATE notification_templates
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           subject = COALESCE($3, subject),
           body = COALESCE($4, body),
           variables = COALESCE($5, variables),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7 AND organization_id = $8
       RETURNING *`,
      [
        input.name ?? null,
        input.description ?? null,
        input.subject ?? null,
        input.body ?? null,
        input.variables ? JSON.stringify(input.variables) : null,
        input.isActive ?? null,
        templateId,
        organizationId,
      ],
    );
    const updated = result.rows[0];
    if (!updated) throw new Error('UPDATE RETURNING returned no row');
    return rowToTemplate(updated);
  }

  async delete(organizationId: string, templateId: string): Promise<void> {
    await this.setTenantContext(organizationId);
    await this.pool.query(
      'DELETE FROM notification_templates WHERE id = $1 AND organization_id = $2',
      [templateId, organizationId],
    );
  }

  async list(organizationId: string): Promise<NotificationTemplate[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<NotificationTemplateRow>(
      'SELECT * FROM notification_templates WHERE organization_id = $1 ORDER BY name ASC',
      [organizationId],
    );
    return result.rows.map(rowToTemplate);
  }
}
