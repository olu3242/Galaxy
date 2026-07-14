import crypto from 'crypto';
import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { WhatsAppProvider } from '@galaxy/communication';
import { ComplianceCheckService } from '@galaxy/governance';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';

type LoopJobName = 'create-loop' | 'record-verification' | 'record-feedback' | 'run-compliance';

interface LoopJobData {
  jobName: LoopJobName;
  organizationId: string;
  workflowRunId?: string;
  loopInstanceId?: string;
  senderPhone?: string;
  verified?: boolean;
  score?: number;
  correlationId?: string;
  _resolveOrgFromLoop?: boolean;
}

interface LoopInstanceRow {
  id: string;
  organization_id: string;
  status: string;
}

interface UserRow {
  id: string;
  whatsapp_phone: string | null;
}

// Writes an immutable audit log entry (INSERT-only per RLS policy)
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

export function createLoopProcessor(pool: Pool): (job: Job) => Promise<void> {
  const whatsapp = new WhatsAppProvider();
  const complianceService = new ComplianceCheckService(pool);

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const payload = job.data as LoopJobData;
      const { jobName } = payload;
      const correlationId = payload.correlationId ?? crypto.randomUUID();

      // Resolve organizationId from loop_instance when coming from webhook
      let { organizationId } = payload;
      if (payload._resolveOrgFromLoop && payload.loopInstanceId && !organizationId) {
        const orgRow = await pool.query<{ organization_id: string }>(
          'SELECT organization_id FROM loop_instances WHERE id = $1 LIMIT 1',
          [payload.loopInstanceId],
        );
        const resolved = orgRow.rows[0]?.organization_id;
        if (!resolved) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              event: 'loop.org_resolve_failed',
              loopInstanceId: payload.loopInstanceId,
            }),
          );
          return;
        }
        organizationId = resolved;
      }

      await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);

      switch (jobName) {
        case 'create-loop': {
          const { workflowRunId, senderPhone } = payload;
          if (!workflowRunId || !senderPhone) break;

          // Create loop instance in verifying state with 24h deadline
          const result = await pool.query<LoopInstanceRow>(
            `INSERT INTO loop_instances
               (organization_id, workflow_instance_id, status, verification_deadline)
             VALUES ($1, $2, 'verifying', NOW() + INTERVAL '24 hours')
             RETURNING id, organization_id, status`,
            [organizationId, workflowRunId],
          );
          const loop = result.rows[0];
          if (!loop) break;

          await writeAuditLog(pool, {
            organizationId,
            actorType: 'system',
            actorId: null,
            action: 'loop.created',
            resourceType: 'loop_instance',
            resourceId: loop.id,
            correlationId,
          });

          // Send verification request to requester
          await whatsapp
            .send(senderPhone, {
              type: 'interactive',
              interactive: {
                type: 'button',
                body: {
                  text: 'Your leave request has been completed. Was your request handled satisfactorily?',
                },
                action: {
                  buttons: [
                    {
                      type: 'reply',
                      reply: { id: `loop-yes:${loop.id}`, title: 'Yes ✓' },
                    },
                    {
                      type: 'reply',
                      reply: { id: `loop-no:${loop.id}`, title: 'No ✗' },
                    },
                  ],
                },
              },
            })
            .catch(() => {
              // Non-fatal
            });

          break;
        }

        case 'record-verification': {
          const { loopInstanceId, senderPhone, verified } = payload;
          if (!loopInstanceId || !senderPhone) break;

          if (verified) {
            // Transition to collecting_feedback
            await pool.query(
              `UPDATE loop_instances
               SET status = 'collecting_feedback', feedback_deadline = NOW() + INTERVAL '4 hours',
                   updated_at = NOW()
               WHERE id = $1 AND organization_id = $2`,
              [loopInstanceId, organizationId],
            );

            await writeAuditLog(pool, {
              organizationId,
              actorType: 'system',
              actorId: null,
              action: 'loop.verification_confirmed',
              resourceType: 'loop_instance',
              resourceId: loopInstanceId,
              correlationId,
            });

            // Increment verification count
            await pool.query(
              `UPDATE loop_instances
               SET verification_count = verification_count + 1
               WHERE id = $1 AND organization_id = $2`,
              [loopInstanceId, organizationId],
            );

            // Send feedback rating request
            await whatsapp
              .send(senderPhone, {
                type: 'interactive',
                interactive: {
                  type: 'button',
                  body: {
                    text: 'Great! How would you rate the experience? (1 = Poor, 5 = Excellent)',
                  },
                  action: {
                    buttons: [
                      {
                        type: 'reply',
                        reply: { id: `loop-rate:${loopInstanceId}:1`, title: '1 ★' },
                      },
                      {
                        type: 'reply',
                        reply: { id: `loop-rate:${loopInstanceId}:3`, title: '3 ★★★' },
                      },
                      {
                        type: 'reply',
                        reply: { id: `loop-rate:${loopInstanceId}:5`, title: '5 ★★★★★' },
                      },
                    ],
                  },
                },
              })
              .catch(() => {
                // Non-fatal
              });
          } else {
            // Requester says not resolved — escalate the loop
            await pool.query(
              `UPDATE loop_instances
               SET status = 'escalated',
                   outcome_notes = 'Requester indicated issue not resolved',
                   updated_at = NOW()
               WHERE id = $1 AND organization_id = $2`,
              [loopInstanceId, organizationId],
            );

            await writeAuditLog(pool, {
              organizationId,
              actorType: 'system',
              actorId: null,
              action: 'loop.escalated',
              resourceType: 'loop_instance',
              resourceId: loopInstanceId,
              correlationId,
            });

            await whatsapp
              .send(senderPhone, {
                type: 'text',
                text: "We're sorry to hear that. Your concern has been escalated to management.",
              })
              .catch(() => {
                // Non-fatal
              });
          }
          break;
        }

        case 'record-feedback': {
          const { loopInstanceId, senderPhone, score } = payload;
          if (!loopInstanceId || !senderPhone || score === undefined) break;

          // Look up user UUID by phone
          const userResult = await pool.query<UserRow>(
            `SELECT id, whatsapp_phone FROM users WHERE whatsapp_phone = $1 AND organization_id = $2 LIMIT 1`,
            [senderPhone, organizationId],
          );
          const userId = userResult.rows[0]?.id ?? '00000000-0000-0000-0000-000000000000';

          await pool.query(
            `INSERT INTO loop_feedback
               (loop_instance_id, organization_id, submitted_by, score, submitted_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [loopInstanceId, organizationId, userId, score],
          );

          await pool.query(
            `UPDATE loop_instances
             SET status = 'completed',
                 feedback_score = (
                   SELECT AVG(score) FROM loop_feedback WHERE loop_instance_id = $1
                 ),
                 updated_at = NOW()
             WHERE id = $1 AND organization_id = $2`,
            [loopInstanceId, organizationId],
          );

          await writeAuditLog(pool, {
            organizationId,
            actorType: 'member',
            actorId: userId,
            action: 'loop.completed',
            resourceType: 'loop_instance',
            resourceId: loopInstanceId,
            correlationId,
          });

          await whatsapp
            .send(senderPhone, {
              type: 'text',
              text: `Thank you for your feedback (${String(score)}/5)! Your response has been recorded.`,
            })
            .catch(() => {
              // Non-fatal
            });
          break;
        }

        case 'run-compliance': {
          // Non-fatal compliance check on workflow completion
          await complianceService.runChecks(organizationId, 'system').catch(() => {
            // Non-fatal — compliance check failures do not block the workflow
          });
          break;
        }

        default: {
          const _never: never = jobName;
          throw new Error(`Unknown loop job: ${String(_never)}`);
        }
      }
    });
}
