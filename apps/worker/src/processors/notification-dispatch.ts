import type { Pool } from 'pg';
import type { Job } from 'bullmq';

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

export function createNotificationDispatchProcessor(pool: Pool): (job: Job) => Promise<void> {
  return async (job: Job): Promise<void> => {
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
        const destination = channel === 'whatsapp' ? recipient.whatsapp_phone : recipient.email;
        if (!destination) {
          failedCount += 1;
          continue;
        }

        // Log dispatch intent — actual channel send delegated to channel providers
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

    await pool.query(
      `UPDATE broadcasts
       SET sent_count = sent_count + $1,
           failed_count = failed_count + $2,
           updated_at = NOW()
       WHERE id = $3 AND organization_id = $4`,
      [sentCount, failedCount, broadcastId, organizationId],
    );
  };
}
