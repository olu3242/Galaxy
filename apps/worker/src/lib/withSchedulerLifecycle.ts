import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { EventPublisher } from '@galaxy/events';
import { AuditRepository } from '@galaxy/identity';

export interface SchedulerJobContext {
  jobName: string;
  organizationId?: string;
  correlationId: string;
  startedAt: number;
}

export async function withSchedulerLifecycle<T>(
  jobName: string,
  pool: Pool,
  fn: (ctx: SchedulerJobContext) => Promise<T>,
): Promise<T> {
  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();
  const ctx: SchedulerJobContext = { jobName, correlationId, startedAt };

  const publisher = new EventPublisher(pool);
  const auditRepo = new AuditRepository(pool);

  let success = false;
  try {
    const result = await fn(ctx);
    success = true;
    return result;
  } finally {
    const durationMs = Date.now() - startedAt;
    const eventId = crypto.randomUUID();
    const eventType = success ? `scheduler.${jobName}.completed` : `scheduler.${jobName}.failed`;

    const systemOrgId = 'system';

    try {
      await publisher.publish({
        id: eventId,
        version: '1.0',
        type: eventType,
        tenantId: systemOrgId,
        correlationId,
        causationId: correlationId,
        timestamp: new Date().toISOString(),
        actor: { type: 'system', id: 'scheduler' },
        payload: { jobName, durationMs, success },
        metadata: { idempotencyKey: eventId, schemaVersion: '1.0', source: 'galaxy.scheduler' },
      });
    } catch {
      // Non-fatal
    }

    if (ctx.organizationId !== undefined) {
      try {
        await auditRepo.insert({
          organizationId: ctx.organizationId,
          actorType: 'system',
          action: eventType,
          resourceType: 'scheduler_job',
          newValue: { jobName, durationMs, success },
          correlationId,
        });
      } catch {
        // Non-fatal
      }
    }
  }
}
