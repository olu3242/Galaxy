import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';

type WorkflowJobName = 'start-workflow' | 'advance-step' | 'complete-workflow' | 'fail-workflow';

interface WorkflowJobData {
  jobName: WorkflowJobName;
  organizationId: string;
  runId: string;
  data?: Record<string, unknown>;
}

export function createWorkflowProcessor(pool: Pool): (job: Job) => Promise<void> {
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
