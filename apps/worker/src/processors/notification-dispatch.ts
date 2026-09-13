import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';
import { SendGridProvider } from '@galaxy/communication';

interface QueueLike {
  add(name: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown>;
}

interface NotificationDispatchJobData {
  organizationId: string;
  broadcastId: string;
  recipientIds: string[];
  content: string;
  channel: 'whatsapp' | 'email' | 'sms';
  correlationId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
}

interface RecipientRow {
  id: string;
  whatsapp_phone: string | null;
  email: string | null;
}

function makeWorkflowQueue(): Queue {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return new Queue('workflow-execution', { connection: redis });
}

export function createNotificationDispatchProcessor(
  pool: Pool,
  sendGridApiKey: string | undefined,
  injectedWorkflowQueue?: QueueLike,
): (job: Job) => Promise<void> {
  const sendGridFromEmail = process.env.SENDGRID_FROM_EMAIL;
  const sendGridFromName = process.env.SENDGRID_FROM_NAME;
  const emailProvider = sendGridApiKey && sendGridFromEmail
    ? new SendGridProvider({ apiKey: sendGridApiKey, fromEmail: sendGridFromEmail, ...(sendGridFromName !== undefined ? { fromName: sendGridFromName } : {}) })
    : null;
  let workflowQueue = injectedWorkflowQueue;
  const getWorkflowQueue = (): QueueLike => {
    workflowQueue ??= makeWorkflowQueue();
    return workflowQueue;
  };

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const data = job.data as NotificationDispatchJobData;
      const { organizationId, broadcastId, recipientIds, content, channel } = data;
      await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);

      let sentCount = 0;
      let failedCount = 0;
      if (recipientIds.length > 0) {
        const placeholders = recipientIds.map((_, i) => `$${String(i + 2)}`).join(', ');
        const { rows } = await pool.query<RecipientRow>(
          `SELECT id, whatsapp_phone, email FROM members WHERE organization_id = $1 AND id IN (${placeholders})`,
          [organizationId, ...recipientIds],
        );

        for (const recipient of rows) {
          if (channel === 'email') {
            const emailAddress = recipient.email;
            if (!emailAddress || !emailProvider) {
              failedCount += 1;
              continue;
            }
            const result = await emailProvider.send(emailAddress, { type: 'text', text: content });
            if (result.success) sentCount += 1;
            else failedCount += 1;
          } else {
            const destination = channel === 'whatsapp' ? recipient.whatsapp_phone : recipient.email;
            if (!destination) {
              failedCount += 1;
              continue;
            }
            console.warn(JSON.stringify({ level: 'info', event: 'notification.dispatched', broadcastId, organizationId, recipientId: recipient.id, channel, contentLength: content.length }));
            sentCount += 1;
          }
        }
      }

      await pool.query(
        `UPDATE broadcasts SET sent_count = sent_count + $1, failed_count = failed_count + $2, updated_at = NOW()
         WHERE id = $3 AND organization_id = $4`,
        [sentCount, failedCount, broadcastId, organizationId],
      );

      if (data.workflowRunId && data.workflowStepId) {
        const correlationId = data.correlationId ?? `notification:${broadcastId}`;
        const idempotencyKey = `workflow:${data.workflowRunId}:${data.workflowStepId}:notification:${broadcastId}`;
        await pool.query(
          `INSERT INTO workflow_history
             (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes, data)
           VALUES ($1, $2, 'waiting', 'waiting', 'system', 'notification', 'Notification engine completed', $3)`,
          [organizationId, data.workflowRunId, JSON.stringify({ stepId: data.workflowStepId, sentCount, failedCount, correlationId })],
        );
        await getWorkflowQueue().add(
          'resume-step',
          {
            jobName: 'resume-step',
            organizationId,
            runId: data.workflowRunId,
            completedStepId: data.workflowStepId,
            correlationId,
            idempotencyKey,
            outcome: { engine: 'notification', status: 'completed', broadcastId, sentCount, failedCount },
          },
          { jobId: idempotencyKey, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
        );
      }
    });
}
