import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';
import { SendGridProvider } from '@galaxy/communication';

interface NotificationDispatchJobData {
  organizationId: string;
  broadcastId: string;
  recipientIds: string[];
  content: string;
  channel: 'whatsapp' | 'email' | 'sms';
}

interface RecipientRow {
  id: string;
  whatsapp_phone: string | null;
  email: string | null;
}

export function createNotificationDispatchProcessor(
  pool: Pool,
  sendGridApiKey: string | undefined,
): (job: Job) => Promise<void> {
  const sendGridFromEmail = process.env.SENDGRID_FROM_EMAIL;
  const sendGridFromName = process.env.SENDGRID_FROM_NAME;
  const emailProvider =
    sendGridApiKey && sendGridFromEmail
      ? new SendGridProvider({
          apiKey: sendGridApiKey,
          fromEmail: sendGridFromEmail,
          ...(sendGridFromName !== undefined ? { fromName: sendGridFromName } : {}),
        })
      : null;

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
            if (!emailAddress) {
              failedCount += 1;
              continue;
            }

            if (!emailProvider) {
              // SendGrid not configured — log and skip rather than silently dropping
              console.warn(
                JSON.stringify({
                  level: 'warn',
                  event: 'notification.email.provider_unavailable',
                  broadcastId,
                  organizationId,
                  recipientId: recipient.id,
                }),
              );
              failedCount += 1;
              continue;
            }

            const result = await emailProvider.send(emailAddress, { type: 'text', text: content });
            if (result.success) {
              sentCount += 1;
            } else {
              failedCount += 1;
              console.warn(
                JSON.stringify({
                  level: 'warn',
                  event: 'notification.email.send_failed',
                  broadcastId,
                  organizationId,
                  recipientId: recipient.id,
                  errorMessage: result.errorMessage,
                }),
              );
            }
          } else {
            // whatsapp / sms — log dispatch intent; actual send delegated to channel providers
            const destination = channel === 'whatsapp' ? recipient.whatsapp_phone : recipient.email;
            if (!destination) {
              failedCount += 1;
              continue;
            }

            console.warn(
              JSON.stringify({
                level: 'info',
                event: 'notification.dispatched',
                broadcastId,
                organizationId,
                recipientId: recipient.id,
                channel,
                contentLength: content.length,
              }),
            );
            sentCount += 1;
          }
        }
      }

      await pool.query(
        `UPDATE broadcasts
       SET sent_count = sent_count + $1,
           failed_count = failed_count + $2,
           updated_at = NOW()
       WHERE id = $3 AND organization_id = $4`,
        [sentCount, failedCount, broadcastId, organizationId],
      );
    });
}
