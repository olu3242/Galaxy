import crypto from 'crypto';
import type { Pool, PoolClient } from 'pg';
import type { Job } from 'bullmq';
import { WorkflowStateMachine } from '@galaxy/workflow';
import type { WorkflowRunStatus } from '@galaxy/workflow';
import { createStepExecutor, type ExecutableWorkflowStep } from '../lib/step-execution.js';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';
import { withTenantClient } from '../lib/withTenantClient.js';

type WorkflowJobName = 'start-workflow' | 'advance-step' | 'resume-step' | 'complete-workflow' | 'fail-workflow';

interface WorkflowJobData {
  jobName: WorkflowJobName;
  organizationId: string;
  runId: string;
  actorId?: string;
  completedStepId?: string;
  outcome?: Record<string, unknown>;
  data?: Record<string, unknown>;
  correlationId?: string;
}

interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  status: WorkflowRunStatus;
  current_step_id: string | null;
  triggered_by: string;
  trigger_data: Record<string, unknown>;
}

const stateMachine = new WorkflowStateMachine();

async function getRun(client: PoolClient, organizationId: string, runId: string): Promise<WorkflowRunRow> {
  const result = await client.query<WorkflowRunRow>(
    `SELECT id, workflow_id, status, current_step_id, triggered_by, trigger_data
       FROM workflow_runs
      WHERE id = $1 AND organization_id = $2`,
    [runId, organizationId],
  );
  const run = result.rows[0];
  if (!run) throw new Error(`Workflow run not found: ${runId}`);
  return run;
}

async function getStep(client: PoolClient, organizationId: string, workflowId: string, stepId: string): Promise<ExecutableWorkflowStep> {
  const result = await client.query<ExecutableWorkflowStep>(
    `SELECT id, name, step_type, step_order, next_step_id, config
       FROM workflow_steps
      WHERE organization_id = $1 AND workflow_id = $2 AND id = $3`,
    [organizationId, workflowId, stepId],
  );
  const step = result.rows[0];
  if (!step) throw new Error(`Workflow step not found: ${stepId}`);
  return step;
}

async function getFirstStep(client: PoolClient, organizationId: string, workflowId: string): Promise<ExecutableWorkflowStep | null> {
  const result = await client.query<ExecutableWorkflowStep>(
    `SELECT id, name, step_type, step_order, next_step_id, config
       FROM workflow_steps
      WHERE organization_id = $1 AND workflow_id = $2
      ORDER BY step_order ASC
      LIMIT 1`,
    [organizationId, workflowId],
  );
  return result.rows[0] ?? null;
}

async function getNextStep(
  client: PoolClient,
  organizationId: string,
  workflowId: string,
  current: ExecutableWorkflowStep,
  explicitNextStepId?: string,
): Promise<ExecutableWorkflowStep | null> {
  const nextId = explicitNextStepId ?? current.next_step_id ?? undefined;
  if (nextId) return getStep(client, organizationId, workflowId, nextId);

  const result = await client.query<ExecutableWorkflowStep>(
    `SELECT id, name, step_type, step_order, next_step_id, config
       FROM workflow_steps
      WHERE organization_id = $1 AND workflow_id = $2 AND step_order > $3
      ORDER BY step_order ASC
      LIMIT 1`,
    [organizationId, workflowId, current.step_order],
  );
  return result.rows[0] ?? null;
}

async function startStep(client: PoolClient, organizationId: string, runId: string, stepId: string): Promise<void> {
  await client.query(
    `INSERT INTO workflow_run_steps
       (organization_id, run_id, step_id, status, started_at)
     SELECT $1, $2, $3, 'running', NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM workflow_run_steps
         WHERE organization_id = $1 AND run_id = $2 AND step_id = $3
      )`,
    [organizationId, runId, stepId],
  );
  await client.query(
    `UPDATE workflow_runs
        SET current_step_id = $3, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
    [runId, organizationId, stepId],
  );
}

async function completeStep(client: PoolClient, organizationId: string, runId: string, stepId: string): Promise<void> {
  await client.query(
    `UPDATE workflow_run_steps
        SET status = 'completed', completed_at = NOW()
      WHERE organization_id = $1 AND run_id = $2 AND step_id = $3 AND status = 'running'`,
    [organizationId, runId, stepId],
  );
}

async function writeAuditLog(
  client: PoolClient,
  opts: { organizationId: string; action: string; runId: string; correlationId: string },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs
       (organization_id, actor_type, actor_id, action, resource_type, resource_id, correlation_id)
     VALUES ($1, 'system', NULL, $2, 'workflow_run', $3, $4)`,
    [opts.organizationId, opts.action, opts.runId, opts.correlationId],
  );
}

async function completeRun(
  client: PoolClient,
  organizationId: string,
  runId: string,
  fromStatus: WorkflowRunStatus,
  correlationId: string,
): Promise<void> {
  stateMachine.assertTransition(fromStatus, 'completed');
  await client.query(
    `UPDATE workflow_runs
        SET status = 'completed', current_step_id = NULL, completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
    [runId, organizationId],
  );
  await client.query(
    `INSERT INTO workflow_history
       (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
     VALUES ($1, $2, $3, 'completed', 'system', 'worker', 'Workflow completed')`,
    [organizationId, runId, fromStatus],
  );
  await writeAuditLog(client, { organizationId, action: 'workflow.completed', runId, correlationId }).catch(() => null);
}

export function createWorkflowProcessor(pool: Pool): (job: Job) => Promise<void> {
  const executeStep = createStepExecutor();

  async function executeCurrentStep(
    client: PoolClient,
    run: WorkflowRunRow,
    step: ExecutableWorkflowStep,
    organizationId: string,
    correlationId: string,
    actorId: string,
  ): Promise<void> {
    const result = await executeStep(client, step, {
      organizationId,
      workflowRunId: run.id,
      correlationId,
      actorId,
      triggerData: run.trigger_data,
    });

    await client.query(
      `INSERT INTO workflow_history
         (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes, data)
       VALUES ($1, $2, $3, $3, 'system', 'worker', 'Workflow step dispatched', $4)`,
      [
        organizationId,
        run.id,
        run.status === 'waiting' ? 'waiting' : 'running',
        JSON.stringify({ stepId: step.id, stepType: step.step_type, disposition: result.disposition, engine: result.engine }),
      ],
    );

    if (result.disposition === 'wait' || result.disposition === 'scheduled') {
      if (run.status !== 'waiting') {
        stateMachine.assertTransition(run.status, 'waiting');
        await client.query(
          `UPDATE workflow_runs SET status = 'waiting', updated_at = NOW()
            WHERE id = $1 AND organization_id = $2`,
          [run.id, organizationId],
        );
      }
      return;
    }

    await completeStep(client, organizationId, run.id, step.id);
    const nextStep = await getNextStep(client, organizationId, run.workflow_id, step, result.nextStepId);
    if (!nextStep) {
      await completeRun(client, organizationId, run.id, 'running', correlationId);
      return;
    }

    await startStep(client, organizationId, run.id, nextStep.id);
    await executeCurrentStep(
      client,
      { ...run, status: 'running', current_step_id: nextStep.id },
      nextStep,
      organizationId,
      correlationId,
      actorId,
    );
  }

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const payload = job.data as WorkflowJobData;
      const { jobName, organizationId, runId } = payload;
      const correlationId = payload.correlationId ?? crypto.randomUUID();

      await withTenantClient(pool, organizationId, async (client) => {
        switch (jobName) {
          case 'start-workflow': {
            const run = await getRun(client, organizationId, runId);
            stateMachine.assertTransition(run.status, 'running');
            const firstStep = await getFirstStep(client, organizationId, run.workflow_id);
            await client.query(
              `UPDATE workflow_runs
                  SET status = 'running', current_step_id = $3,
                      started_at = COALESCE(started_at, NOW()), updated_at = NOW()
                WHERE id = $1 AND organization_id = $2`,
              [runId, organizationId, firstStep?.id ?? null],
            );
            await client.query(
              `INSERT INTO workflow_history
                 (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
               VALUES ($1, $2, $3, 'running', 'system', 'worker', 'Workflow started')`,
              [organizationId, runId, run.status],
            );

            if (!firstStep) {
              await completeRun(client, organizationId, runId, 'running', correlationId);
              return;
            }

            await startStep(client, organizationId, runId, firstStep.id);
            await executeCurrentStep(
              client,
              { ...run, status: 'running', current_step_id: firstStep.id },
              firstStep,
              organizationId,
              correlationId,
              payload.actorId ?? run.triggered_by,
            );
            break;
          }

          case 'resume-step': {
            const run = await getRun(client, organizationId, runId);
            if (run.status !== 'waiting' && run.status !== 'running') {
              throw new Error(`Cannot resume workflow ${runId} from status ${run.status}`);
            }
            const completedStepId = payload.completedStepId ?? run.current_step_id;
            if (!completedStepId) {
              throw new Error(`Cannot resume workflow ${runId} without a current step`);
            }
            if (run.current_step_id && completedStepId !== run.current_step_id) {
              throw new Error(`Cannot resume workflow ${runId}: completed step ${completedStepId} is not current step ${run.current_step_id}`);
            }
            const current = await getStep(client, organizationId, run.workflow_id, completedStepId);
            await completeStep(client, organizationId, runId, current.id);
            if (run.status === 'waiting') {
              stateMachine.assertTransition('waiting', 'running');
              await client.query(
                `UPDATE workflow_runs SET status = 'running', updated_at = NOW()
                  WHERE id = $1 AND organization_id = $2`,
                [runId, organizationId],
              );
            }
            await client.query(
              `INSERT INTO workflow_history
                 (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes, data)
               VALUES ($1, $2, $3, 'running', 'system', 'worker', 'Workflow engine step completed', $4)`,
              [organizationId, runId, run.status, JSON.stringify({ stepId: current.id, outcome: payload.outcome ?? null })],
            );
            const nextStep = await getNextStep(client, organizationId, run.workflow_id, current);
            if (!nextStep) {
              await completeRun(client, organizationId, runId, 'running', correlationId);
              break;
            }
            await startStep(client, organizationId, runId, nextStep.id);
            await executeCurrentStep(
              client,
              { ...run, status: 'running', current_step_id: nextStep.id },
              nextStep,
              organizationId,
              correlationId,
              payload.actorId ?? run.triggered_by,
            );
            break;
          }

          case 'advance-step': {
            const run = await getRun(client, organizationId, runId);
            if (run.status !== 'running' && run.status !== 'waiting') {
              throw new Error(`Cannot advance workflow ${runId} from status ${run.status}`);
            }
            if (!run.current_step_id) {
              await completeRun(client, organizationId, runId, run.status, correlationId);
              break;
            }

            if (run.status === 'waiting') {
              stateMachine.assertTransition('waiting', 'running');
              await client.query(
                `UPDATE workflow_runs SET status = 'running', updated_at = NOW()
                  WHERE id = $1 AND organization_id = $2`,
                [runId, organizationId],
              );
            }

            const current = await getStep(client, organizationId, run.workflow_id, run.current_step_id);
            await completeStep(client, organizationId, runId, current.id);
            const nextStep = await getNextStep(client, organizationId, run.workflow_id, current);
            if (!nextStep) {
              await completeRun(client, organizationId, runId, 'running', correlationId);
              break;
            }

            await startStep(client, organizationId, runId, nextStep.id);
            await writeAuditLog(client, {
              organizationId,
              action: 'workflow.step_advanced',
              runId,
              correlationId,
            }).catch(() => null);
            await executeCurrentStep(
              client,
              { ...run, status: 'running', current_step_id: nextStep.id },
              nextStep,
              organizationId,
              correlationId,
              payload.actorId ?? run.triggered_by,
            );
            break;
          }

          case 'complete-workflow': {
            const run = await getRun(client, organizationId, runId);
            await completeRun(client, organizationId, runId, run.status, correlationId);
            break;
          }

          case 'fail-workflow': {
            const run = await getRun(client, organizationId, runId);
            stateMachine.assertTransition(run.status, 'failed');
            await client.query(
              `UPDATE workflow_runs SET status = 'failed', updated_at = NOW()
                WHERE id = $1 AND organization_id = $2`,
              [runId, organizationId],
            );
            await client.query(
              `INSERT INTO workflow_history
                 (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
               VALUES ($1, $2, $3, 'failed', 'system', 'worker', 'Workflow failed')`,
              [organizationId, runId, run.status],
            );
            await writeAuditLog(client, { organizationId, action: 'workflow.failed', runId, correlationId }).catch(() => null);
            break;
          }

          default: {
            const _never: never = jobName;
            throw new Error(`Unknown job name: ${String(_never)}`);
          }
        }
      });
    });
}
