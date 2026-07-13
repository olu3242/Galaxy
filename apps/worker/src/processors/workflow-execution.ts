import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { WhatsAppProvider } from '@galaxy/communication';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';

type WorkflowJobName = 'start-workflow' | 'advance-step' | 'complete-workflow' | 'fail-workflow';

interface WorkflowJobData {
  jobName: WorkflowJobName;
  organizationId: string;
  runId: string;
  data?: Record<string, unknown>;
}

interface WorkflowRunRow {
  id: string;
  trigger_data: {
    senderPhone?: string;
    rawInput?: string;
  };
}

interface ManagerRow {
  whatsapp_phone: string;
}

export function createWorkflowProcessor(pool: Pool): (job: Job) => Promise<void> {
  const whatsapp = new WhatsAppProvider();

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const payload = job.data as WorkflowJobData;
      const { jobName, organizationId, runId } = payload;

      // Always set tenant context first
      await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);

      switch (jobName) {
        case 'start-workflow': {
          await pool.query(
            `UPDATE workflow_runs
           SET status = 'running', started_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND organization_id = $2`,
            [runId, organizationId],
          );
          await pool.query(
            `INSERT INTO workflow_history
             (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
           VALUES ($1, $2, 'pending', 'running', 'system', 'worker', 'Workflow started')`,
            [organizationId, runId],
          );

          // Notify the manager via WhatsApp with an approve/reject interactive message
          const runRow = await pool.query<WorkflowRunRow>(
            `SELECT id, trigger_data FROM workflow_runs WHERE id = $1 AND organization_id = $2`,
            [runId, organizationId],
          );
          const run = runRow.rows[0];
          const senderPhone = run?.trigger_data?.senderPhone;
          const rawInput = run?.trigger_data?.rawInput ?? '(no message)';

          const managerRow = await pool.query<ManagerRow>(
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
                } as Record<string, unknown>,
              })
              .catch(() => {
                // Non-fatal — manager notification failure does not fail the job
              });
          }
          break;
        }

        case 'complete-workflow': {
          await pool.query(
            `UPDATE workflow_runs
           SET status = 'completed', completed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND organization_id = $2`,
            [runId, organizationId],
          );
          await pool.query(
            `INSERT INTO workflow_history
             (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
           VALUES ($1, $2, 'running', 'completed', 'system', 'worker', 'Workflow completed')`,
            [organizationId, runId],
          );
          break;
        }

        case 'fail-workflow': {
          await pool.query(
            `UPDATE workflow_runs
           SET status = 'failed', updated_at = NOW()
           WHERE id = $1 AND organization_id = $2`,
            [runId, organizationId],
          );
          await pool.query(
            `INSERT INTO workflow_history
             (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
           VALUES ($1, $2, 'running', 'failed', 'system', 'worker', 'Workflow failed')`,
            [organizationId, runId],
          );
          break;
        }

        case 'advance-step': {
          // Full step engine not yet implemented — log advance
          // step engine not yet implemented — advance recorded in workflow_history
          await pool.query(
            `INSERT INTO workflow_history
             (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
           VALUES ($1, $2, 'running', 'running', 'system', 'worker', 'Step advanced')`,
            [organizationId, runId],
          );
          break;
        }

        default: {
          // Exhaustive narrowing guard
          const _never: never = jobName;
          throw new Error(`Unknown job name: ${String(_never)}`);
        }
      }
    });
}
