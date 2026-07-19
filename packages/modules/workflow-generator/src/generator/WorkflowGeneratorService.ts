import type { Pool } from 'pg';
import type {
  WorkflowGenerationRequest,
  WorkflowGenerationStatus,
  WorkflowStep,
} from '../types.js';

interface RequestRow {
  id: string;
  organization_id: string;
  natural_language_description: string;
  industry_hint: string | null;
  status: string;
  generated_workflow: Record<string, unknown> | null;
  steps: WorkflowStep[] | null;
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
}

function rowToRequest(row: RequestRow): WorkflowGenerationRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    naturalLanguageDescription: row.natural_language_description,
    status: row.status as WorkflowGenerationStatus,
    createdAt: row.created_at,
    ...(row.industry_hint !== null ? { industryHint: row.industry_hint } : {}),
    ...(row.generated_workflow !== null ? { generatedWorkflow: row.generated_workflow } : {}),
    ...(row.steps !== null ? { steps: row.steps } : {}),
    ...(row.error_message !== null ? { errorMessage: row.error_message } : {}),
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
  };
}

function parseSteps(description: string): WorkflowStep[] {
  const parts = description.split(/,?\s+then\s+|,?\s+after that\s+|;\s*/i).filter(Boolean);
  return parts.map((part, idx) => ({
    order: idx + 1,
    name: part.trim().slice(0, 80),
    description: part.trim(),
    actionType: 'task',
    conditions: {},
  }));
}

export class WorkflowGeneratorService {
  constructor(private readonly pool: Pool) {}

  async createRequest(
    orgId: string,
    description: string,
    industryHint?: string,
  ): Promise<WorkflowGenerationRequest> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<RequestRow>(
      `INSERT INTO workflow_generation_requests (organization_id, natural_language_description, industry_hint)
       VALUES ($1, $2, $3) RETURNING *`,
      [orgId, description, industryHint ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create generation request');
    return rowToRequest(row);
  }

  async getRequest(orgId: string, requestId: string): Promise<WorkflowGenerationRequest> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<RequestRow>(
      'SELECT * FROM workflow_generation_requests WHERE organization_id = $1 AND id = $2',
      [orgId, requestId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Request not found');
    return rowToRequest(row);
  }

  async listRequests(orgId: string, limit = 50): Promise<WorkflowGenerationRequest[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<RequestRow>(
      'SELECT * FROM workflow_generation_requests WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2',
      [orgId, limit],
    );
    return result.rows.map(rowToRequest);
  }

  async generateWorkflow(orgId: string, requestId: string): Promise<WorkflowGenerationRequest> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    await this.pool.query(
      `UPDATE workflow_generation_requests SET status = 'generating' WHERE organization_id = $1 AND id = $2`,
      [orgId, requestId],
    );
    const req = await this.getRequest(orgId, requestId);
    const steps = parseSteps(req.naturalLanguageDescription);
    const generatedWorkflow: Record<string, unknown> = {
      name: req.naturalLanguageDescription.slice(0, 100),
      stepCount: steps.length,
      ...(req.industryHint !== undefined ? { industryHint: req.industryHint } : {}),
      steps,
    };
    const result = await this.pool.query<RequestRow>(
      `UPDATE workflow_generation_requests
       SET status = 'complete', generated_workflow = $3, steps = $4, completed_at = NOW()
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [orgId, requestId, JSON.stringify(generatedWorkflow), JSON.stringify(steps)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to update request');
    return rowToRequest(row);
  }
}
