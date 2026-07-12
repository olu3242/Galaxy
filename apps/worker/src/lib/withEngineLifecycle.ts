import crypto from 'node:crypto';
import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import { EventPublisher } from '@galaxy/events';
import { AuditRepository } from '@galaxy/identity';

export interface LifecycleJobData {
  organizationId: string;
  correlationId?: string;
  actorId?: string;
  actorType?: 'member' | 'agent' | 'system';
}

/**
 * withEngineLifecycle
 *
 * Wraps a BullMQ job handler with the Galaxy Runtime Engine lifecycle:
 *
 *   1. Executes the job handler
 *   2. On success: publishes a GalaxyEvent + writes an audit_log entry
 *   3. On failure: publishes a failure event + writes an audit_log entry
 *
 * This closes the gap identified in the Engine Compliance Report for all
 * 8 BullMQ processors that were missing event emission and audit logging.
 *
 * Usage:
 *   return withEngineLifecycle(job, pool, async () => {
 *     // your existing processor logic here
 *   });
 */
export async function withEngineLifecycle<T>(
  job: Job,
  pool: Pool,
  fn: () => Promise<T>,
): Promise<T> {
  const data = job.data as LifecycleJobData;
  const organizationId = data.organizationId;
  const correlationId = data.correlationId ?? crypto.randomUUID();
  const actorId = data.actorId ?? 'system';
  const actorType = data.actorType ?? 'system';

  const publisher = new EventPublisher(pool);
  const auditRepo = new AuditRepository(pool);

  const startedAt = Date.now();
  let success = false;

  try {
    const result = await fn();
    success = true;
    return result;
  } finally {
    const durationMs = Date.now() - startedAt;
    const eventId = crypto.randomUUID();
    const eventType = success ? `worker.${job.name}.completed` : `worker.${job.name}.failed`;

    // Emit GalaxyEvent — non-fatal
    if (organizationId) {
      try {
        await publisher.publish({
          id: eventId,
          version: '1.0',
          type: eventType,
          tenantId: organizationId,
          correlationId,
          causationId: correlationId,
          timestamp: new Date().toISOString(),
          actor: { type: actorType, id: actorId },
          payload: {
            jobName: job.name,
            jobId: job.id,
            durationMs,
            success,
          },
          metadata: {
            idempotencyKey: eventId,
            schemaVersion: '1.0',
            source: 'galaxy.worker',
          },
        });
      } catch {
        // Non-fatal — PostgreSQL is source of truth; Kafka failures are logged by KafkaEventBus
      }

      // Write audit log — non-fatal
      try {
        await auditRepo.insert({
          organizationId,
          actorType,
          actorId,
          action: eventType,
          resourceType: 'worker_job',
          newValue: { jobName: job.name, jobId: job.id, durationMs, success },
          correlationId,
        });
      } catch {
        // Non-fatal — best-effort audit
      }
    }
  }
}
