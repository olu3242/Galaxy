import crypto from 'crypto';
import type { Pool, PoolClient } from 'pg';
import type { Job } from 'bullmq';
import { WhatsAppProvider } from '@galaxy/communication';
import { WorkflowStateMachine } from '@galaxy/workflow';
import type { WorkflowRunStatus } from '@galaxy/workflow';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';
import { withTenantClient } from '../lib/withTenantClient.js';

async function writeAuditLog(
  client: PoolClient,
  opts: {
    organizationId: string;
    actorType: 'member' | 'agent' | 'system';
    actorId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    correlationId: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs
       (organization_id, actor_type, actor_id, action, resource_type, resource_id, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.organizationId,
      opts.actorType,
      opts.actorId,
      opts.action,
      opts.resourceType,
      opts.resourceId,
      opts.correlationId,
    ],
  );
}

type WorkflowJobName = 'start-workflow' | 'advance-step' | 'complete-workflow' | 'fail-workflow';

interface WorkflowJobData {
  jobName: WorkflowJobName;
  organizationId: string;
  runId: string;
  data?: Record<string, unknown>;
  correlationId?: string;
}

interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  status: WorkflowRunStatus;
  current_step_id: string | null;
  trigger_data: {
    senderPhone?: string;
    rawInput?: string;
  };
}

interface WorkflowStepRow {
  id: string;
  step_type: string;
  step_order: number;
  next_step_id: string | null;
}

interface ManagerRow {
  whatsapp_phone: string;
}

const stateMachine = new WorkflowStateMachine();

async function getRun(
  client: PoolClient,
  organizationId: string,
  runId: string,
): Promise<WorkflowRunRow> {
  const result = await client.query<WorkflowRunRow>(
    `SELECT id, workflow_id, status, current_step_id, trigger_data
     FROM workflow_runs
     WHERE id = $1 AND organization_id = $2`,
    [runId, organizationId],
  );
  const run = result.rows[0];
  if (!run) throw new Error(`Workflow run not found: ${runId}`);
  return run;
}

async function getFirstStep(
  client: PoolClient,
  organizationId: string,
  workflowId: string,
): Promise<WorkflowStepRow | null> {
  const result = await client.query<WorkflowStepRow>(
    `SELECT id, step_type, step_order, next_step_id
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
  currentStepId: string,
): Promise<WorkflowStepRow | null> {
  const currentResult = await client.query<WorkflowStepRow>(
    `SELECT id, step_type, step_order, next_step_id
     FROM workflow_steps
     WHERE organization_id = $1 AND workflow_id = $2 AND id = $3`,
    [organizationId, workflowId, currentStepId],
  );
  const current = currentResult.rows[0];
  if (!current) throw new Error(`Workflow step not found: ${currentStepId}`);

  if (current.next_step_id) {
    const explicitResult = await client.query<WorkflowStepRow>(
      `SELECT id, step_type, step_order, next_step_id
       FROM workflow_steps
       WHERE organization_id = $1 AND workflow_id = $2 AND id = $3`,
      [organizationId, workflowId, current.next_step_id],
    );
    return explicitResult.rows[0] ?? null;
  }

  const sequentialResult = await client.query<WorkflowStepRow>(
    `SELECT id, step_type, step_order, next_step_id
     FROM workflow_steps
     WHERE organization_id = $1 AND workflow_id = $2 AND step_order > $3
     ORDER BY step_order ASC
     LIMIT 1`,
    [organizationId, workflowId, current.step_order],
  );
  return sequentialResult.rows[0] ?? null;
}

async function startStep(
  client: PoolClient,
  organizationId: string,
  runId: string,
  stepId: string,
): Promise<void> {
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
}

export function createWorkflowProcessor(pool: Pool): (job: Job) => Promise<void> {
  const whatsapp = new WhatsAppProvider();

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
               SET status = 'running', current_step_id = $3, started_at = COALESCE(started_at, NOW()), updated_at = NOW()
               WHERE id = $1 AND organization_id = $2`,
              [runId, organizationId, firstStep?.id ?? null],
            );
            if (firstStep) await startStep(client, organizationId, runId, firstStep.id);

            await client.query(
              `INSERT INTO workflow_history
                 (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
               VALUES ($1, $2, $3, 'running', 'system', 'worker', 'Workflow started')`,
              [organizationId, runId, run.status],
            );

            const senderPhone = run.trigger_data.senderPhone;
            const rawInput = run.trigger_data.rawInput ?? '(no message)';
            const managerRow = await client.query<ManagerRow>(
              `SELECT u.whatsapp_phone
               FROM memberships m
               JOIN users u ON u.id = m.user_id
               JOIN roles r ON r.id = m.role_id
               WHERE m.organization_id = $1
                 AND r.name = 'manager'
                 AND m.status = 'active'
                 AND u.whatsapp_phone IS NOT NULL
               LIMIT 1`,
              [organizationId],
            );
            const manager = managerRow.rows[0];

            if (manager?.whatsapp_phone && senderPhone) {
              await whatsapp
                .send(manager.whatsapp_phone, {
                  type: 'interactive',
                  interactive: {
                    type: 'button',
                    body: {
                      text: `Leave request from ${senderPhone}:\n"${rawInput}"\n\nApprove or reject?`,
                    },
                    action: {
                      buttons: [
                        {
                          type: 'reply',
                          reply: { id: `approve:${runId}`, title: 'Approve' },
                        },
                        {
                          type: 'reply',
                          reply: { id: `reject:${runId}`, title: 'Reject' },
                        },
                      ],
                    },
                  },
                })
                .catch(() => {
                  // Non-fatal — manager notification failure does not fail the job
                });
            }
            break;
          }

          case 'advance-step': {
            const run = await getRun(client, organizationId, runId);
            if (run.status !== 'running') {
              throw new Error(`Cannot advance workflow ${runId} from status ${run.status}`);
            }

            const currentStepId = run.current_step_id;
            if (!currentStepId) {
              const firstStep = await getFirstStep(client, organizationId, run.workflow_id);
              if (!firstStep) {
                stateMachine.assertTransition(run.status, 'completed');
                await client.query(
                  `UPDATE workflow_runs
                   SET status = 'completed', completed_at = NOW(), updated_at = NOW()
                   WHERE id = $1 AND organization_id = $2`,
                  [runId, organizationId],
                );
                break;
              }
              await startStep(client, organizationId, runId, firstStep.id);
              await client.query(
                `UPDATE workflow_runs
                 SET current_step_id = $3, updated_at = NOW()
                 WHERE id = $1 AND organization_id = $2`,
                [runId, organizationId, firstStep.id],
              );
              break;
            }

            await client.query(
              `UPDATE workflow_run_steps
               SET status = 'completed', completed_at = NOW()
               WHERE organization_id = $1 AND run_id = $2 AND step_id = $3 AND status = 'running'`,
              [organizationId, runId, currentStepId],
            );

            const nextStep = await getNextStep(
              client,
              organizationId,
              run.workflow_id,
              currentStepId,
            );

            if (nextStep) {
              await startStep(client, organizationId, runId, nextStep.id);
              await client.query(
                `UPDATE workflow_runs
                 SET current_step_id = $3, updated_at = NOW()
                 WHERE id = $1 AND organization_id = $2`,
                [runId, organizationId, nextStep.id],
              );
              await client.query(
                `INSERT INTO workflow_history
                   (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes, data)
                 VALUES ($1, $2, 'running', 'running', 'system', 'worker', 'Step advanced', $3)`,
                [organizationId, runId, JSON.stringify({ fromStepId: currentStepId, toStepId: nextStep.id })],
              );
              await writeAuditLog(client, {
                organizationId,
                actorType: 'system',
                actorId: null,
                action: 'workflow.step_advanced',
                resourceType: 'workflow_run',
                resourceId: runId,
                correlationId,
              }).catch(() => null);
              break;
            }

            stateMachine.assertTransition(run.status, 'completed');
            await client.query(
              `UPDATE workflow_runs
               SET status = 'completed', current_step_id = NULL, completed_at = NOW(), updated_at = NOW()
               WHERE id = $1 AND organization_id = $2`,
              [runId, organizationId],
            );
            await client.query(
              `INSERT INTO workflow_history
                 (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
               VALUES ($1, $2, 'running', 'completed', 'system', 'worker', 'Final workflow step completed')`,
              [organizationId, runId],
            );
            await writeAuditLog(client, {
              organizationId,
              actorType: 'system',
              actorId: null,
              action: 'workflow.completed',
              resourceType: 'workflow_run',
              resourceId: runId,
              correlationId,
            }).catch(() => null);
            break;
          }

          case 'complete-workflow': {
            const run = await getRun(client, organizationId, runId);
            stateMachine.assertTransition(run.status, 'completed');
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
              [organizationId, runId, run.status],
            );
            await writeAuditLog(client, {
              organizationId,
              actorType: 'system',
              actorId: null,
              action: 'workflow.completed',
              resourceType: 'workflow_run',
              resourceId: runId,
              correlationId,
            }).catch(() => null);
            break;
          }

          case 'fail-workflow': {
            const run = await getRun(client, organizationId, runId);
            stateMachine.assertTransition(run.status, 'failed');
            await client.query(
              `UPDATE workflow_runs
               SET status = 'failed', updated_at = NOW()
               WHERE id = $1 AND organization_id = $2`,
              [runId, organizationId],
            );
            await client.query(
              `INSERT INTO workflow_history
                 (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
               VALUES ($1, $2, $3, 'failed', 'system', 'worker', 'Workflow failed')`,
              [organizationId, runId, run.status],
            );
            await writeAuditLog(client, {
              organizationId,
              actorType: 'system',
              actorId: null,
              action: 'workflow.failed',
              resourceType: 'workflow_run',
              resourceId: runId,
              correlationId,
            }).catch(() => null);
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
