import type { Pool } from 'pg';
import type { Job } from 'bullmq';
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
}

interface WorkflowRunRow {
  id: string;
  organization_id: string;
  workflow_id: string;
  status: string;
}

export function createApprovalProcessor(pool: Pool): (job: Job) => Promise<void> {
  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const payload = job.data as ApprovalJobData;
      const { jobName, organizationId, approvalId, workflowRunId, approverId } = payload;

      await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);

      switch (jobName) {
        case 'post-approval-advance': {
          if (!workflowRunId) break;

          const { rows } = await pool.query<WorkflowRunRow>(
            `SELECT id, organization_id, workflow_id, status
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
          break;
        }

        case 'post-rejection-notify': {
          if (!workflowRunId) break;

          await pool.query(
            `UPDATE workflow_runs
             SET status = 'failed', updated_at = NOW()
             WHERE organization_id = $1 AND id = $2 AND status NOT IN ('completed', 'failed')`,
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
          break;
        }

        default: {
          const _never: never = jobName;
          throw new Error(`Unknown approval job: ${String(_never)}`);
        }
      }
    });
}
