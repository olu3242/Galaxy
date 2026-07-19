import type { Pool } from 'pg';
import type { AutomationDomain, FlowType, IntentDetection, WorkflowDefinition } from '../types.js';
import { WorkflowDefinitionService } from './WorkflowDefinitionService.js';

interface IntentDetectionRow {
  id: string;
  organization_id: string;
  source_type: string;
  source_id: string | null;
  raw_input: string;
  detected_intent: string;
  automation_domain: string | null;
  flow_type: string | null;
  matched_workflow_id: string | null;
  workflow_run_id: string | null;
  confidence_score: string | null;
  requires_human_review: boolean;
  created_at: string;
}

function rowToIntentDetection(row: IntentDetectionRow): IntentDetection {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceType: row.source_type as IntentDetection['sourceType'],
    rawInput: row.raw_input,
    detectedIntent: row.detected_intent,
    requiresHumanReview: row.requires_human_review,
    createdAt: row.created_at,
    ...(row.source_id !== null ? { sourceId: row.source_id } : {}),
    ...(row.automation_domain !== null
      ? { automationDomain: row.automation_domain as AutomationDomain }
      : {}),
    ...(row.flow_type !== null ? { flowType: row.flow_type as FlowType } : {}),
    ...(row.matched_workflow_id !== null ? { matchedWorkflowId: row.matched_workflow_id } : {}),
    ...(row.workflow_run_id !== null ? { workflowRunId: row.workflow_run_id } : {}),
    ...(row.confidence_score !== null ? { confidenceScore: parseFloat(row.confidence_score) } : {}),
  };
}

export class WorkflowDiscoveryService {
  private readonly definitionService: WorkflowDefinitionService;

  constructor(private readonly pool: Pool) {
    this.definitionService = new WorkflowDefinitionService(pool);
  }

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async discoverWorkflow(
    organizationId: string,
    intent: string,
    domain?: AutomationDomain,
  ): Promise<WorkflowDefinition | null> {
    await this.setTenantContext(organizationId);

    const conditions: string[] = ['organization_id = $1', 'is_active = true', 'name ILIKE $2'];
    const params: unknown[] = [organizationId, `%${intent}%`];

    if (domain !== undefined) {
      conditions.push('automation_domain = $3');
      params.push(domain);
    }

    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM workflows
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT 1`,
      params,
    );

    const row = result.rows[0];
    if (!row) return null;

    return this.definitionService.getWorkflow(organizationId, row.id);
  }

  async recordIntentDetection(input: {
    organizationId: string;
    sourceType: 'whatsapp' | 'api' | 'web' | 'scheduled';
    sourceId?: string;
    rawInput: string;
    detectedIntent: string;
    automationDomain?: AutomationDomain;
    flowType?: FlowType;
    matchedWorkflowId?: string;
    workflowRunId?: string;
    confidenceScore?: number;
    requiresHumanReview: boolean;
  }): Promise<IntentDetection> {
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<IntentDetectionRow>(
      `INSERT INTO intent_detections
         (organization_id, source_type, source_id, raw_input, detected_intent,
          automation_domain, flow_type, matched_workflow_id, workflow_run_id,
          confidence_score, requires_human_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        input.organizationId,
        input.sourceType,
        input.sourceId ?? null,
        input.rawInput,
        input.detectedIntent,
        input.automationDomain ?? null,
        input.flowType ?? null,
        input.matchedWorkflowId ?? null,
        input.workflowRunId ?? null,
        input.confidenceScore ?? null,
        input.requiresHumanReview,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO intent_detections RETURNING returned no row');
    return rowToIntentDetection(row);
  }
}
