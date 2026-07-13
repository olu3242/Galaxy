import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { WhatsAppProvider } from '@galaxy/communication';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';

type ApprovalJobName = 'post-approval-advance' | 'post-rejection-notify';

interface ApprovalJobData {
  jobName: ApprovalJobName;
  organizationId: string;
  approvalId: string;
  workflowRunId?: string;
  approverId: string;
  decision: 'approved' | 'rejected';
  correlationId?: string;
  _resolveOrgFromRun?: boolean;
}

interface WorkflowRunRow {
  id: string;
  organization_id: string;
  workflow_id: string;
  status: string;
  trigger_data: { senderPhone?: string };
}

export function createApprovalProcessor(pool: Pool): (job: Job) => Promise<void> {
  const whatsapp = new WhatsAppProvider();

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const payload = job.data as ApprovalJobData;
      const { jobName, approvalId, workflowRunId, approverId } = payload;

      // When coming from the WhatsApp webhook, organizationId is resolved here from the run
      let { organizationId } = payload;
      if (payload._resolveOrgFromRun && workflowRunId && !organizationId) {
        const orgRow = await pool.query<{ organization_id: string }>(
          'SELECT organization_id FROM workflow_runs WHERE id = $1 LIMIT 1',
          [workflowRunId],
        );
        const resolved = orgRow.rows[0]?.organization_id;
        if (!resolved) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              event: 'approval.org_resolve_failed',
              workflowRunId,
            }),
          );
          return;
        }
        organizationId = resolved;
      }

      await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);

      switch (jobName) {
        case 'post-approval-advance': {
          if (!workflowRunId) break;

          const { rows } = await pool.query<WorkflowRunRow>(
            `SELECT id, organization_id, workflow_id, status, trigger_data
             FROM workflow_runs
             WHERE organization_id = $1 AND id = $2`,
            [organizationId, workflowRunId],
          );
          const run = rows[0];
          if (!run || run.status === 'completed' || run.status === 'failed') break;

          await pool.query(
            `UPDATE workflow_runs
             SET status = 'completed', completed_at = NOW(), updated_at = NOW()
             WHERE organization_id = $1 AND id = $2`,
            [organizationId, workflowRunId],
          );

          await pool.query(
            `INSERT INTO workflow_history
               (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
             VALUES ($1, $2, 'running', 'completed', 'member', $3, $4)`,
            [
              organizationId,
              workflowRunId,
              approverId,
              `Approval ${approvalId} fully approved — workflow completed`,
            ],
          );

          const senderPhone = run.trigger_data.senderPhone;
          if (senderPhone) {
            await whatsapp
              .send(senderPhone, {
                type: 'text',
                text: 'Your leave request has been approved.',
              })
              .catch(() => {
                // Non-fatal
              });
          }
          break;
        }

        case 'post-rejection-notify': {
          if (!workflowRunId) break;

          const rejResult = await pool.query<WorkflowRunRow>(
            `UPDATE workflow_runs
             SET status = 'failed', updated_at = NOW()
             WHERE organization_id = $1 AND id = $2 AND status NOT IN ('completed', 'failed')
             RETURNING id, organization_id, workflow_id, status, trigger_data`,
            [organizationId, workflowRunId],
          );

          await pool.query(
            `INSERT INTO workflow_history
               (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
             VALUES ($1, $2, 'running', 'failed', 'member', $3, $4)`,
            [
              organizationId,
              workflowRunId,
              approverId,
              `Approval ${approvalId} rejected — workflow failed`,
            ],
          );

          const rejRun = rejResult.rows[0];
          const rejSenderPhone = rejRun?.trigger_data.senderPhone;
          if (rejSenderPhone) {
            await whatsapp
              .send(rejSenderPhone, {
                type: 'text',
                text: 'Your leave request has been rejected.',
              })
              .catch(() => {
                // Non-fatal
              });
          }
          break;
        }

        default: {
          const _never: never = jobName;
          throw new Error(`Unknown approval job: ${String(_never)}`);
        }
      }
    });
}
