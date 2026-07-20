import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { ApprovalRuntimeService } from '@galaxy/workflow';

/**
 * Processor for the 'approval-timeout' BullMQ job.
 *
 * Scans all pending/delegated approval_requests whose timeout_at has passed,
 * marks them as timed-out, and auto-escalates where configured.
 *
 * Scheduled every 5 minutes via registerScheduledJobs.
 */
export function createApprovalTimeoutProcessor(pool: Pool): (job: Job) => Promise<void> {
  const service = new ApprovalRuntimeService(pool);

  return async (_job: Job): Promise<void> => {
    const timedOut = await service.processTimeouts();

    if (timedOut.length > 0) {
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'approval.timeout.processed',
          count: timedOut.length,
          ids: timedOut.map((a: { id: string }) => a.id),
        }),
      );
    }
  };
}
