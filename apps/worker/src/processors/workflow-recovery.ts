import type { Pool } from 'pg';
import type { Job, Queue } from 'bullmq';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';

interface CompletionRow {
  organization_id: string;
  workflow_run_id: string;
  step_id: string;
  source_id: string;
  correlation_id: string | null;
  actor_id: string | null;
  engine: 'task' | 'approval';
}

export function createWorkflowRecoveryProcessor(
  pool: Pool,
  workflowQueue: Queue,
): (job: Job) => Promise<void> {
  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const taskRows = await pool.query<CompletionRow>(`
        SELECT t.organization_id,
               t.workflow_run_id,
               t.data->>'workflowStepId' AS step_id,
               t.id AS source_id,
               t.correlation_id,
               t.created_by AS actor_id,
               'task'::text AS engine
          FROM tasks t
          JOIN workflow_runs wr
            ON wr.id = t.workflow_run_id
           AND wr.organization_id = t.organization_id
         WHERE t.status = 'completed'
           AND t.workflow_run_id IS NOT NULL
           AND t.data->>'workflowStepId' IS NOT NULL
           AND wr.status IN ('waiting', 'running')
           AND wr.current_step_id::text = t.data->>'workflowStepId'
           AND NOT EXISTS (
             SELECT 1 FROM workflow_execution_receipts r
              WHERE r.organization_id = t.organization_id
                AND r.idempotency_key = 'workflow:' || t.workflow_run_id::text || ':' || (t.data->>'workflowStepId') || ':task:' || t.id::text
           )
         ORDER BY t.completed_at ASC
         LIMIT 200
      `);

      const approvalRows = await pool.query<CompletionRow>(`
        SELECT a.organization_id,
               a.workflow_run_id,
               a.step_id,
               a.id AS source_id,
               a.correlation_id,
               a.decided_by AS actor_id,
               'approval'::text AS engine
          FROM approval_requests a
          JOIN workflow_runs wr
            ON wr.id = a.workflow_run_id
           AND wr.organization_id = a.organization_id
         WHERE a.status = 'approved'
           AND wr.status IN ('waiting', 'running')
           AND wr.current_step_id = a.step_id
           AND NOT EXISTS (
             SELECT 1 FROM workflow_execution_receipts r
              WHERE r.organization_id = a.organization_id
                AND r.idempotency_key = 'workflow:' || a.workflow_run_id::text || ':' || a.step_id::text || ':approval:' || a.id::text
           )
         ORDER BY a.decided_at ASC
         LIMIT 200
      `);

      const rows = [...taskRows.rows, ...approvalRows.rows];
      for (const row of rows) {
        const idempotencyKey = `workflow:${row.workflow_run_id}:${row.step_id}:${row.engine}:${row.source_id}`;
        await workflowQueue.add(
          'resume-step',
          {
            jobName: 'resume-step',
            organizationId: row.organization_id,
            runId: row.workflow_run_id,
            completedStepId: row.step_id,
            ...(row.actor_id ? { actorId: row.actor_id } : {}),
            correlationId: row.correlation_id ?? idempotencyKey,
            idempotencyKey,
            outcome: {
              engine: row.engine,
              status: 'completed',
              sourceId: row.source_id,
              recoveredBy: 'workflow-recovery',
            },
          },
          {
            jobId: idempotencyKey,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        );
      }
    });
}
