import crypto from 'crypto';
import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { WhatsAppProvider } from '@galaxy/communication';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';

function makeLoopQueue(): Queue {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return new Queue('loop-processing', { connection: redis });
}

async function writeAuditLog(
  pool: Pool,
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
  await pool.query(
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
  const loopQueue = makeLoopQueue();

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
          const correlationId = payload.correlationId ?? crypto.randomUUID();

          // Audit log — workflow.completed
          await writeAuditLog(pool, {
            organizationId,
            actorType: 'member',
            actorId: approverId,
            action: 'workflow.completed',
            resourceType: 'workflow_run',
            resourceId: workflowRunId,
            correlationId,
          }).catch(() => null);

          if (senderPhone) {
            await whatsapp
              .send(senderPhone, {
                type: 'text',
                text: 'Your leave request has been approved.',
              })
              .catch(() => {
                // Non-fatal
              });

            // Trigger loop verification (non-blocking)
            await loopQueue
              .add('create-loop', {
                jobName: 'create-loop',
                organizationId,
                workflowRunId,
                senderPhone,
                correlationId,
              })
              .catch(() => null);
          }

          // Compliance check (non-blocking)
          await loopQueue
            .add('run-compliance', {
              jobName: 'run-compliance',
              organizationId,
              workflowRunId,
              correlationId,
            })
            .catch(() => null);

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
          const rejCorrelationId = payload.correlationId ?? crypto.randomUUID();

          // Audit log — workflow.rejected
          await writeAuditLog(pool, {
            organizationId,
            actorType: 'member',
            actorId: approverId,
            action: 'workflow.rejected',
            resourceType: 'workflow_run',
            resourceId: workflowRunId,
            correlationId: rejCorrelationId,
          }).catch(() => null);

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
