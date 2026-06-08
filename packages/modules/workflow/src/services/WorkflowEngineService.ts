import type { Pool } from 'pg';
import type { AutomationDomain, FlowType, StartWorkflowInput, WorkflowRun } from '../types.js';
import { WorkflowDefinitionService } from './WorkflowDefinitionService.js';

interface WorkflowRunRow {
  id: string;
  organization_id: string;
  workflow_id: string;
  status: string;
  current_step_id: string | null;
  triggered_by: string;
  trigger_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  correlation_id: string;
  sla_due_at: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
  automation_domain: string | null;
  flow_type: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRun(row: WorkflowRunRow): WorkflowRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workflowId: row.workflow_id,
    status: row.status as WorkflowRun['status'],
    triggeredBy: row.triggered_by,
    triggerData: row.trigger_data,
    outputData: row.output_data,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.current_step_id !== null ? { currentStepId: row.current_step_id } : {}),
    ...(row.sla_due_at !== null ? { slaDueAt: row.sla_due_at } : {}),
    ...(row.escalated_at !== null ? { escalatedAt: row.escalated_at } : {}),
    ...(row.automation_domain !== null
      ? { automationDomain: row.automation_domain as AutomationDomain }
      : {}),
    ...(row.flow_type !== null ? { flowType: row.flow_type as FlowType } : {}),
    ...(row.started_at !== null ? { startedAt: row.started_at } : {}),
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
  };
}

export class WorkflowEngineService {
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

  async startWorkflow(input: StartWorkflowInput): Promise<WorkflowRun> {
    const workflow = await this.definitionService.getWorkflow(
      input.organizationId,
      input.workflowId,
    );

    if (!workflow) {
      throw new Error(`Workflow not found: ${input.workflowId}`);
    }
    if (!workflow.isActive) {
      throw new Error(`Workflow is not active: ${input.workflowId}`);
    }

    await this.setTenantContext(input.organizationId);

    // Calculate SLA due date if configured
    const slaDueAt =
      workflow.slaDurationHours !== undefined
        ? new Date(Date.now() + workflow.slaDurationHours * 3_600_000).toISOString()
        : null;

    // INSERT workflow run with status 'pending'
    const insertResult = await this.pool.query<WorkflowRunRow>(
      `INSERT INTO workflow_runs
         (organization_id, workflow_id, status, triggered_by, trigger_data,
          output_data, correlation_id, sla_due_at, automation_domain, flow_type,
          started_at)
       VALUES ($1, $2, 'pending', $3, $4, '{}', $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        input.organizationId,
        input.workflowId,
        input.triggeredBy,
        JSON.stringify(input.triggerData),
        input.correlationId,
        slaDueAt,
        workflow.automationDomain,
        workflow.flowType,
      ],
    );

    const insertedRow = insertResult.rows[0];
    if (!insertedRow) throw new Error('INSERT INTO workflow_runs RETURNING returned no row');

    const runId = insertedRow.id;

    // UPDATE to 'running'
    const updateResult = await this.pool.query<WorkflowRunRow>(
      `UPDATE workflow_runs
       SET status = 'running', updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [input.organizationId, runId],
    );

    const runRow = updateResult.rows[0];
    if (!runRow) throw new Error(`Failed to update workflow run ${runId} to running`);

    // Get first step of the workflow to record in run steps
    const stepResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM workflow_steps
       WHERE organization_id = $1 AND workflow_id = $2
       ORDER BY step_order ASC
       LIMIT 1`,
      [input.organizationId, input.workflowId],
    );

    const firstStep = stepResult.rows[0];

    if (firstStep !== undefined) {
      await this.pool.query(
        `INSERT INTO workflow_run_steps
           (organization_id, run_id, step_id, status, started_at)
         VALUES ($1, $2, $3, 'running', NOW())`,
        [input.organizationId, runId, firstStep.id],
      );
    }

    // Record history
    await this.pool.query(
      `INSERT INTO workflow_history
         (organization_id, run_id, from_status, to_status, actor_type, actor_id)
       VALUES ($1, $2, 'pending', 'running', 'system', 'engine')`,
      [input.organizationId, runId],
    );

    return rowToRun(runRow);
  }

  async getWorkflowRun(organizationId: string, runId: string): Promise<WorkflowRun | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<WorkflowRunRow>(
      `SELECT * FROM workflow_runs WHERE organization_id = $1 AND id = $2`,
      [organizationId, runId],
    );

    const row = result.rows[0];
    return row !== undefined ? rowToRun(row) : null;
  }

  async completeWorkflowRun(
    organizationId: string,
    runId: string,
    outputData: Record<string, unknown>,
    actorId: string,
  ): Promise<WorkflowRun> {
    await this.setTenantContext(organizationId);

    const prevResult = await this.pool.query<{ status: string }>(
      `SELECT status FROM workflow_runs WHERE organization_id = $1 AND id = $2`,
      [organizationId, runId],
    );

    const prev = prevResult.rows[0];
    if (!prev) throw new Error(`Workflow run not found: ${runId}`);
    const fromStatus = prev.status;

    const result = await this.pool.query<WorkflowRunRow>(
      `UPDATE workflow_runs
       SET status = 'completed', output_data = $3, completed_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, runId, JSON.stringify(outputData)],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Workflow run not found: ${runId}`);

    await this.pool.query(
      `INSERT INTO workflow_history
         (organization_id, run_id, from_status, to_status, actor_type, actor_id)
       VALUES ($1, $2, $3, 'completed', 'member', $4)`,
      [organizationId, runId, fromStatus, actorId],
    );

    return rowToRun(row);
  }

  async failWorkflowRun(
    organizationId: string,
    runId: string,
    reason: string,
  ): Promise<WorkflowRun> {
    await this.setTenantContext(organizationId);

    const prevResult = await this.pool.query<{ status: string }>(
      `SELECT status FROM workflow_runs WHERE organization_id = $1 AND id = $2`,
      [organizationId, runId],
    );

    const prev = prevResult.rows[0];
    if (!prev) throw new Error(`Workflow run not found: ${runId}`);
    const fromStatus = prev.status;

    const result = await this.pool.query<WorkflowRunRow>(
      `UPDATE workflow_runs
       SET status = 'failed', updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, runId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Workflow run not found: ${runId}`);

    await this.pool.query(
      `INSERT INTO workflow_history
         (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
       VALUES ($1, $2, $3, 'failed', 'system', 'engine', $4)`,
      [organizationId, runId, fromStatus, reason],
    );

    return rowToRun(row);
  }

  async cancelWorkflowRun(
    organizationId: string,
    runId: string,
    actorId: string,
  ): Promise<WorkflowRun> {
    await this.setTenantContext(organizationId);

    const prevResult = await this.pool.query<{ status: string }>(
      `SELECT status FROM workflow_runs WHERE organization_id = $1 AND id = $2`,
      [organizationId, runId],
    );

    const prev = prevResult.rows[0];
    if (!prev) throw new Error(`Workflow run not found: ${runId}`);
    const fromStatus = prev.status;

    const result = await this.pool.query<WorkflowRunRow>(
      `UPDATE workflow_runs
       SET status = 'cancelled', updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, runId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Workflow run not found: ${runId}`);

    await this.pool.query(
      `INSERT INTO workflow_history
         (organization_id, run_id, from_status, to_status, actor_type, actor_id)
       VALUES ($1, $2, $3, 'cancelled', 'member', $4)`,
      [organizationId, runId, fromStatus, actorId],
    );

    return rowToRun(row);
  }

  async escalateWorkflowRun(
    organizationId: string,
    runId: string,
    escalateTo: string,
  ): Promise<WorkflowRun> {
    await this.setTenantContext(organizationId);

    const prevResult = await this.pool.query<{ status: string }>(
      `SELECT status FROM workflow_runs WHERE organization_id = $1 AND id = $2`,
      [organizationId, runId],
    );

    const prev = prevResult.rows[0];
    if (!prev) throw new Error(`Workflow run not found: ${runId}`);
    const fromStatus = prev.status;

    const result = await this.pool.query<WorkflowRunRow>(
      `UPDATE workflow_runs
       SET status = 'escalated', escalated_at = NOW(), escalated_to = $3, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, runId, escalateTo],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Workflow run not found: ${runId}`);

    await this.pool.query(
      `INSERT INTO workflow_history
         (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
       VALUES ($1, $2, $3, 'escalated', 'system', 'engine', $4)`,
      [organizationId, runId, fromStatus, `Escalated to: ${escalateTo}`],
    );

    return rowToRun(row);
  }

  async listOverdueSlaRuns(organizationId: string): Promise<WorkflowRun[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<WorkflowRunRow>(
      `SELECT * FROM workflow_runs
       WHERE organization_id = $1
         AND sla_due_at < NOW()
         AND status IN ('pending', 'running', 'waiting')
       ORDER BY sla_due_at ASC`,
      [organizationId],
    );

    return result.rows.map(rowToRun);
  }
}
