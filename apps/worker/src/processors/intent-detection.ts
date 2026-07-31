import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { WhatsAppProvider } from '@galaxy/communication';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';
import { withTenantClient } from '../lib/withTenantClient.js';

type DetectedIntent =
  | 'approval_request'
  | 'task_creation'
  | 'incident_report'
  | 'leave_request'
  | 'expense_request'
  | 'membership_registration'
  | 'attendance_checkin'
  | 'information_request'
  | 'other';

type AutomationDomain =
  | 'communication'
  | 'task'
  | 'approval'
  | 'incident'
  | 'membership'
  | 'event'
  | 'hr'
  | 'finance'
  | 'knowledge'
  | 'governance'
  | 'executive'
  | null;

type FlowType = 'screen_flow' | 'record_trigger' | 'scheduled' | 'automated' | 'ai_flow' | null;

/** Payload emitted by the direct API path */
interface DirectIntentJobData {
  rawInput: string;
  organizationId: string;
  sourceType: string;
  sourceId?: string;
}

/** Normalized inbound message shape (mirrors NormalizedInboundMessage from @galaxy/communication) */
interface NormalizedContent {
  type: 'text' | 'image' | 'file' | 'audio' | 'video' | 'template';
  text?: string;
  mediaUrl?: string;
}

interface NormalizedMessage {
  externalId: string;
  senderPhone: string;
  receivedAt: string;
  content: NormalizedContent;
}

/** Payload emitted by the WhatsApp webhook route */
interface WebhookIntentJobData {
  phoneNumberId: string;
  normalized: NormalizedMessage;
  rawMessageId: string;
  correlationId?: string;
}

type IntentJobData = DirectIntentJobData | WebhookIntentJobData;

function isWebhookPayload(data: IntentJobData): data is WebhookIntentJobData {
  return 'phoneNumberId' in data && 'normalized' in data && 'rawMessageId' in data;
}

interface ClassificationResult {
  detectedIntent: DetectedIntent;
  automationDomain: AutomationDomain;
  flowType: FlowType;
  confidence: number;
}

const VALID_INTENTS: ReadonlySet<string> = new Set<DetectedIntent>([
  'approval_request',
  'task_creation',
  'incident_report',
  'leave_request',
  'expense_request',
  'membership_registration',
  'attendance_checkin',
  'information_request',
  'other',
]);

const VALID_DOMAINS: ReadonlySet<string> = new Set<string>([
  'communication',
  'task',
  'approval',
  'incident',
  'membership',
  'event',
  'hr',
  'finance',
  'knowledge',
  'governance',
  'executive',
]);

const VALID_FLOW_TYPES: ReadonlySet<string> = new Set<string>([
  'screen_flow',
  'record_trigger',
  'scheduled',
  'automated',
  'ai_flow',
]);

function isDetectedIntent(value: unknown): value is DetectedIntent {
  return typeof value === 'string' && VALID_INTENTS.has(value);
}

function isAutomationDomain(value: unknown): value is AutomationDomain {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && VALID_DOMAINS.has(value);
}

function isFlowType(value: unknown): value is FlowType {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && VALID_FLOW_TYPES.has(value);
}

function parseClassification(raw: string): ClassificationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      detectedIntent: 'other',
      automationDomain: null,
      flowType: null,
      confidence: 0.5,
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      detectedIntent: 'other',
      automationDomain: null,
      flowType: null,
      confidence: 0.5,
    };
  }

  const obj = parsed as Record<string, unknown>;

  const detectedIntent = isDetectedIntent(obj.detectedIntent) ? obj.detectedIntent : 'other';

  const automationDomain = isAutomationDomain(obj.automationDomain)
    ? (obj.automationDomain ?? null)
    : null;

  const flowType = isFlowType(obj.flowType) ? (obj.flowType ?? null) : null;

  const rawConf = obj.confidence;
  const confidence = typeof rawConf === 'number' && rawConf >= 0 && rawConf <= 1 ? rawConf : 0.5;

  return { detectedIntent, automationDomain, flowType, confidence };
}

function makeWorkflowQueue(): Queue {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return new Queue('workflow-execution', { connection: redis });
}

export function createIntentProcessor(
  pool: Pool,
  anthropicApiKey: string,
): (job: Job) => Promise<void> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  const workflowQueue = makeWorkflowQueue();
  const whatsapp = new WhatsAppProvider();

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const jobData = job.data as IntentJobData;

      let rawInput: string;
      let organizationId: string;
      let sourceType: string;
      let sourceId: string | undefined;

      if (isWebhookPayload(jobData)) {
        // Resolve organizationId from phoneNumberId WITHOUT RLS context — we don't have the
        // tenant yet, so this must be a plain lookup before set_config is called.
        const orgResult = await pool.query<{ id: string }>(
          'SELECT id FROM organizations WHERE waba_phone_number_id = $1 LIMIT 1',
          [jobData.phoneNumberId],
        );

        if (orgResult.rows.length === 0) {
          console.warn(
            `[intent-detection] No organization found for phoneNumberId=${jobData.phoneNumberId}; skipping job ${String(job.id)}`,
          );
          return;
        }

        const firstRow = orgResult.rows[0];
        if (!firstRow) return;
        organizationId = firstRow.id;
        rawInput =
          jobData.normalized.content.type === 'text' && jobData.normalized.content.text
            ? jobData.normalized.content.text
            : '[media message]';
        sourceType = 'whatsapp';
        sourceId = jobData.rawMessageId;
      } else {
        rawInput = jobData.rawInput;
        organizationId = jobData.organizationId;
        sourceType = jobData.sourceType;
        sourceId = jobData.sourceId;
      }

      const prompt = `Classify the following message and respond with ONLY a JSON object (no markdown, no explanation):

Message: "${rawInput}"

Respond with exactly this JSON structure:
{
  "detectedIntent": one of ["approval_request","task_creation","incident_report","leave_request","expense_request","membership_registration","attendance_checkin","information_request","other"],
  "automationDomain": one of ["communication","task","approval","incident","membership","event","hr","finance","knowledge","governance","executive"] or null,
  "flowType": one of ["screen_flow","record_trigger","scheduled","automated","ai_flow"] or null,
  "confidence": a number between 0 and 1
}`;

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      });

      const firstBlock = response.content[0];
      const rawText = firstBlock?.type === 'text' ? firstBlock.text : '{}';

      const classification = parseClassification(rawText);
      const requiresHumanReview = classification.confidence < 0.7;

      // All DB operations run on a single dedicated client with session-level tenant context.
      // This guarantees RLS policies see the correct app.current_tenant on every query.
      await withTenantClient(pool, organizationId, async (client) => {
        await client.query(
          `INSERT INTO intent_detections
           (organization_id, source_type, source_id, raw_input, detected_intent,
            automation_domain, flow_type, confidence_score, requires_human_review)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            organizationId,
            sourceType,
            sourceId ?? null,
            rawInput,
            classification.detectedIntent,
            classification.automationDomain,
            classification.flowType,
            classification.confidence,
            requiresHumanReview,
          ],
        );

        // Route high-confidence intents to their workflow templates (WhatsApp webhook path only)
        const INTENT_TO_WORKFLOW: Partial<Record<DetectedIntent, string>> = {
          leave_request: 'Leave Request',
          expense_request: 'Expense Approval',
          incident_report: 'Incident Report',
        };

        const workflowName =
          !requiresHumanReview && isWebhookPayload(jobData)
            ? INTENT_TO_WORKFLOW[classification.detectedIntent]
            : undefined;

        if (workflowName) {
          // Find or auto-instantiate the workflow for this org from the global template catalog.
          let workflowRow = await client.query<{ id: string }>(
            `SELECT id FROM workflows WHERE organization_id = $1 AND name = $2 AND is_active = true LIMIT 1`,
            [organizationId, workflowName],
          );
          if (!workflowRow.rows[0]) {
            const defRow = await client.query<{
              id: string;
              description: string | null;
              definition: unknown;
            }>(
              `SELECT id, description, definition FROM workflow_definitions WHERE name = $1 AND is_active = true LIMIT 1`,
              [workflowName],
            );
            const def = defRow.rows[0];
            if (def) {
              await client.query(
                `INSERT INTO workflows (organization_id, name, description, version, is_active, definition, created_by)
                 VALUES ($1, $2, $3, 1, true, $4, $1)`,
                [organizationId, workflowName, def.description, JSON.stringify(def.definition)],
              );
              workflowRow = await client.query<{ id: string }>(
                `SELECT id FROM workflows WHERE organization_id = $1 AND name = $2 AND is_active = true LIMIT 1`,
                [organizationId, workflowName],
              );
            }
          }
          const workflow = workflowRow.rows[0];
          if (workflow) {
            const runResult = await client.query<{ id: string }>(
              `INSERT INTO workflow_runs
                 (organization_id, workflow_id, status, triggered_by, trigger_data, correlation_id)
               VALUES ($1, $2, 'pending', 'whatsapp', $3, $4)
               RETURNING id`,
              [
                organizationId,
                workflow.id,
                JSON.stringify({
                  senderPhone: (jobData as WebhookIntentJobData).normalized.senderPhone,
                  rawInput,
                  rawMessageId: (jobData as WebhookIntentJobData).rawMessageId,
                }),
                (jobData as WebhookIntentJobData).correlationId ?? crypto.randomUUID(),
              ],
            );
            const run = runResult.rows[0];
            if (run) {
              await workflowQueue.add('start-workflow', {
                jobName: 'start-workflow',
                organizationId,
                runId: run.id,
                data: { senderPhone: (jobData as WebhookIntentJobData).normalized.senderPhone },
              });
            }
          } else {
            console.warn(
              JSON.stringify({
                level: 'warn',
                event: `intent.${classification.detectedIntent}.no_workflow`,
                organizationId,
                workflowName,
              }),
            );
          }
        }

        // Attendance check-in — record and reply (WhatsApp only, high confidence)
        if (
          classification.detectedIntent === 'attendance_checkin' &&
          !requiresHumanReview &&
          isWebhookPayload(jobData)
        ) {
          const senderPhone = jobData.normalized.senderPhone;
          const userRow = await client.query<{ id: string; display_name: string }>(
            `SELECT id, display_name FROM users WHERE whatsapp_phone = $1 AND organization_id = $2 LIMIT 1`,
            [senderPhone, organizationId],
          );
          const user = userRow.rows[0];
          if (user) {
            await client.query(
              `INSERT INTO attendance_records (organization_id, user_id, source) VALUES ($1, $2, 'whatsapp')`,
              [organizationId, user.id],
            );
            await whatsapp
              .send(senderPhone, {
                type: 'text',
                text: `Check-in recorded for ${user.display_name}. Have a great day!`,
              })
              .catch(() => {
                // Non-fatal
              });
          }
        }

        // Membership registration — create user + membership and welcome them (WhatsApp only)
        if (
          classification.detectedIntent === 'membership_registration' &&
          !requiresHumanReview &&
          isWebhookPayload(jobData)
        ) {
          const senderPhone = jobData.normalized.senderPhone;
          const existing = await client.query<{ id: string }>(
            `SELECT u.id FROM users u
             JOIN memberships m ON m.user_id = u.id
             WHERE u.whatsapp_phone = $1 AND u.organization_id = $2 AND m.status = 'active'
             LIMIT 1`,
            [senderPhone, organizationId],
          );
          if (existing.rows.length === 0) {
            const newUserId = crypto.randomUUID();
            await client.query(
              `INSERT INTO users (id, organization_id, display_name, whatsapp_phone) VALUES ($1, $2, $3, $4)`,
              [newUserId, organizationId, `Member ${senderPhone.slice(-4)}`, senderPhone],
            );
            await client.query(
              `INSERT INTO memberships (organization_id, user_id) VALUES ($1, $2)`,
              [organizationId, newUserId],
            );
            await whatsapp
              .send(senderPhone, {
                type: 'text',
                text: "Welcome! You've been registered as a member. You can now submit requests through WhatsApp.",
              })
              .catch(() => {
                // Non-fatal
              });
          } else {
            await whatsapp
              .send(senderPhone, {
                type: 'text',
                text: "You're already a registered member. How can we help you today?",
              })
              .catch(() => {
                // Non-fatal
              });
          }
        }

        // Information request — search knowledge base and reply with an AI-synthesized answer
        if (
          classification.detectedIntent === 'information_request' &&
          !requiresHumanReview &&
          isWebhookPayload(jobData)
        ) {
          const senderPhone = jobData.normalized.senderPhone;
          const chunks = await client.query<{ content: string; title: string | null }>(
            `SELECT kc.content, kd.title
             FROM knowledge_chunks kc
             JOIN knowledge_documents kd ON kd.id = kc.document_id
             WHERE kd.organization_id = $1
               AND kd.status = 'published'
               AND to_tsvector('english', kc.content) @@ plainto_tsquery('english', $2)
             ORDER BY ts_rank(to_tsvector('english', kc.content), plainto_tsquery('english', $2)) DESC
             LIMIT 4`,
            [organizationId, rawInput],
          );

          if (chunks.rows.length > 0) {
            const context = chunks.rows
              .map(
                (c, i) => `[${String(i + 1)}] ${c.title ?? 'Document'}: ${c.content.slice(0, 300)}`,
              )
              .join('\n\n');

            const answerResponse = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 256,
              messages: [
                {
                  role: 'user',
                  content: `Answer this question concisely using only the context below. If the context doesn't answer it, say you'll connect them with a team member.\n\nQuestion: ${rawInput}\n\nContext:\n${context}`,
                },
              ],
            });
            const answerBlock = answerResponse.content[0];
            const answer = answerBlock?.type === 'text' ? answerBlock.text : null;
            if (answer) {
              await whatsapp.send(senderPhone, { type: 'text', text: answer }).catch(() => {
                // Non-fatal
              });
            }
          } else {
            await whatsapp
              .send(senderPhone, {
                type: 'text',
                text: 'Thank you for your question. A team member will get back to you shortly.',
              })
              .catch(() => {
                // Non-fatal
              });
          }
        }
      });
    });
}
