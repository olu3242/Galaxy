import type { Pool } from 'pg';
import type {
  AutomationDomain,
  CreateWorkflowInput,
  FlowType,
  WorkflowDefinition,
} from '../types.js';

interface WorkflowRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  automation_domain: string;
  flow_type: string;
  owner_id: string | null;
  department_id: string | null;
  sla_duration_hours: number | null;
  tags: string[];
  definition: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function rowToDefinition(row: WorkflowRow): WorkflowDefinition {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    version: row.version,
    isActive: row.is_active,
    automationDomain: row.automation_domain as AutomationDomain,
    flowType: row.flow_type as FlowType,
    tags: row.tags,
    definition: row.definition,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.owner_id !== null ? { ownerId: row.owner_id } : {}),
    ...(row.department_id !== null ? { departmentId: row.department_id } : {}),
    ...(row.sla_duration_hours !== null ? { slaDurationHours: row.sla_duration_hours } : {}),
  };
}

export class WorkflowDefinitionService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async createWorkflow(input: CreateWorkflowInput): Promise<WorkflowDefinition> {
    await this.setTenantContext(input.organizationId);

    const tags = input.tags ?? [];
    const definition = input.definition ?? {};

    const result = await this.pool.query<WorkflowRow>(
      `INSERT INTO workflows
         (organization_id, name, description, version, is_active,
          automation_domain, flow_type, owner_id, department_id,
          sla_duration_hours, tags, definition, created_by)
       VALUES ($1, $2, $3, 1, false, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.description ?? null,
        input.automationDomain,
        input.flowType,
        input.ownerId ?? null,
        input.departmentId ?? null,
        input.slaDurationHours ?? null,
        tags,
        JSON.stringify(definition),
        input.createdBy,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO workflows RETURNING returned no row');
    return rowToDefinition(row);
  }

  async getWorkflow(
    organizationId: string,
    workflowId: string,
  ): Promise<WorkflowDefinition | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<WorkflowRow>(
      `SELECT * FROM workflows WHERE organization_id = $1 AND id = $2`,
      [organizationId, workflowId],
    );

    const row = result.rows[0];
    return row !== undefined ? rowToDefinition(row) : null;
  }

  async listWorkflows(
    organizationId: string,
    opts?: {
      domain?: AutomationDomain;
      flowType?: FlowType;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<WorkflowDefinition[]> {
    await this.setTenantContext(organizationId);

    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;

    if (opts?.domain !== undefined) {
      conditions.push(`automation_domain = $${String(idx)}`);
      params.push(opts.domain);
      idx++;
    }

    if (opts?.flowType !== undefined) {
      conditions.push(`flow_type = $${String(idx)}`);
      params.push(opts.flowType);
      idx++;
    }

    if (opts?.isActive !== undefined) {
      conditions.push(`is_active = $${String(idx)}`);
      params.push(opts.isActive);
      idx++;
    }

    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    params.push(limit, offset);
    const limitIdx = idx;
    const offsetIdx = idx + 1;

    const result = await this.pool.query<WorkflowRow>(
      `SELECT * FROM workflows
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${String(limitIdx)} OFFSET $${String(offsetIdx)}`,
      params,
    );

    return result.rows.map(rowToDefinition);
  }

  async activateWorkflow(organizationId: string, workflowId: string): Promise<WorkflowDefinition> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<WorkflowRow>(
      `UPDATE workflows
       SET is_active = true, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, workflowId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Workflow not found: ${workflowId}`);
    return rowToDefinition(row);
  }

  async deactivateWorkflow(
    organizationId: string,
    workflowId: string,
  ): Promise<WorkflowDefinition> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<WorkflowRow>(
      `UPDATE workflows
       SET is_active = false, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, workflowId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Workflow not found: ${workflowId}`);
    return rowToDefinition(row);
  }
}
