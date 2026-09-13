import crypto from 'crypto';
import type { Pool, PoolClient } from 'pg';
import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { WhatsAppProvider } from '@galaxy/communication';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';
import { withTenantClient } from '../lib/withTenantClient.js';

interface QueueLike {
  add(name: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown>;
}

function makeWorkflowQueue(): Queue {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return new Queue('workflow-execution', { connection: redis });
}

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
    [opts.organizationId, opts.actorType, opts.actorId, opts.action, opts.resourceType, opts.resourceId, opts.correlationId],
  );
}

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
  current_step_id: string | null;
  trigger_data: { senderPhone?: string };
}

export function createApprovalProcessor(pool: Pool, injectedWorkflowQueue?: QueueLike): (job: Job) => Promise<void> {
  const whatsapp = new WhatsAppProvider();
  let workflowQueue = injectedWorkflowQueue;
  const getWorkflowQueue = (): QueueLike => {
    workflowQueue ??= makeWorkflowQueue();
    return workflowQueue;
  };

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const payload = job.data as ApprovalJobData;
      const { jobName, approvalId, workflowRunId, approverId } = payload;
      let { organizationId } = payload;

      if (payload._resolveOrgFromRun && workflowRunId && !organizationId) {
        const orgRow = await pool.query<{ organization_id: string }>(
          'SELECT organization_id FROM workflow_runs WHERE id = $1 LIMIT 1',
          [workflowRunId],
        );
        const resolved = orgRow.rows[0]?.organization_id;
        if (!resolved) return;
        organizationId = resolved;
      }

      await withTenantClient(pool, organizationId, async (client) => {
        if (!workflowRunId) return;
        const runResult = await client.query<WorkflowRunRow>(
          `SELECT id, organization_id, workflow_id, status, current_step_id, trigger_data
             FROM workflow_runs WHERE organization_id = $1 AND id = $2`,
          [organizationId, workflowRunId],
        );
        const run = runResult.rows[0];
        if (!run || run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') return;

        const correlationId = payload.correlationId ?? crypto.randomUUID();
        if (jobName === 'post-approval-advance') {
          if (!run.current_step_id) return;
          const idempotencyKey = `workflow:${workflowRunId}:${run.current_step_id}:legacy-approval:${approvalId}`;
          await getWorkflowQueue().add(
            'resume-step',
            {
              jobName: 'resume-step',
              organizationId,
              runId: workflowRunId,
              completedStepId: run.current_step_id,
              actorId: approverId,
              correlationId,
              idempotencyKey,
              outcome: { engine: 'approval', status: 'approved', approvalId, compatibilityPath: 'legacy' },
            },
            { jobId: idempotencyKey, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
          );
          await writeAuditLog(client, {
            organizationId,
            actorType: 'member',
            actorId: approverId,
            action: 'workflow.approval_completed',
            resourceType: 'workflow_run',
            resourceId: workflowRunId,
            correlationId,
          }).catch(() => null);

          const senderPhone = run.trigger_data.senderPhone;
          if (senderPhone) {
            await whatsapp.send(senderPhone, { type: 'text', text: 'Your approval was recorded and the workflow is continuing.' }).catch(() => undefined);
          }
          return;
        }

        if (jobName === 'post-rejection-notify') {
          const idempotencyKey = `workflow:${workflowRunId}:legacy-approval:${approvalId}:rejected`;
          await getWorkflowQueue().add(
            'fail-workflow',
            {
              jobName: 'fail-workflow',
              organizationId,
              runId: workflowRunId,
              actorId: approverId,
              correlationId,
              idempotencyKey,
              outcome: { engine: 'approval', status: 'rejected', approvalId, compatibilityPath: 'legacy' },
            },
            { jobId: idempotencyKey, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
          );
          await writeAuditLog(client, {
            organizationId,
            actorType: 'member',
            actorId: approverId,
            action: 'workflow.rejected',
            resourceType: 'workflow_run',
            resourceId: workflowRunId,
            correlationId,
          }).catch(() => null);
          const senderPhone = run.trigger_data.senderPhone;
          if (senderPhone) {
            await whatsapp.send(senderPhone, { type: 'text', text: 'Your request has been rejected.' }).catch(() => undefined);
          }
          return;
        }

        const _never: never = jobName;
        throw new Error(`Unknown approval job: ${String(_never)}`);
      });
    });
}
