import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Pool, PoolClient } from 'pg';
import { WhatsAppProvider } from '@galaxy/communication';
import type { AutomationDomain, FlowType } from '@galaxy/workflow';
import { discoverWorkflowForTrigger } from '../lib/workflow-dispatch.js';
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

type PersistedIntentSource = 'whatsapp' | 'api' | 'web' | 'scheduled';

interface DirectIntentJobData {
  rawInput: string;
  organizationId: string;
  sourceType: string;
  sourceId?: string;
  actorId?: string;
  correlationId?: string;
}

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

interface WebhookIntentJobData {
  phoneNumberId: string;
  normalized: NormalizedMessage;
  rawMessageId: string;
  correlationId?: string;
}

type IntentJobData = DirectIntentJobData | WebhookIntentJobData;

interface ClassificationResult {
  detectedIntent: DetectedIntent;
  automationDomain: AutomationDomain | null;
  flowType: FlowType | null;
  confidence: number;
}

interface ResolvedIntentContext {
  rawInput: string;
  organizationId: string;
  sourceType: string;
  sourceId?: string;
  actorId?: string;
  senderPhone?: string;
  correlationId: string;
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

const VALID_DOMAINS: ReadonlySet<string> = new Set<AutomationDomain>([
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

const VALID_FLOW_TYPES: ReadonlySet<string> = new Set<FlowType>([
  'screen_flow',
  'record_trigger',
  'scheduled',
  'automated',
  'ai_flow',
]);

function isWebhookPayload(data: IntentJobData): data is WebhookIntentJobData {
  return 'phoneNumberId' in data && 'normalized' in data && 'rawMessageId' in data;
}

function isDetectedIntent(value: unknown): value is DetectedIntent {
  return typeof value === 'string' && VALID_INTENTS.has(value);
}

function isAutomationDomain(value: unknown): value is AutomationDomain {
  return typeof value === 'string' && VALID_DOMAINS.has(value);
}

function isFlowType(value: unknown): value is FlowType {
  return typeof value === 'string' && VALID_FLOW_TYPES.has(value);
}

function persistedSource(sourceType: string): PersistedIntentSource {
  switch (sourceType.toLowerCase()) {
    case 'whatsapp':
      return 'whatsapp';
    case 'web':
      return 'web';
    case 'scheduled':
    case 'scheduler':
      return 'scheduled';
    case 'event':
    case 'api':
    default:
      return 'api';
  }
}

function parseClassification(raw: string): ClassificationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { detectedIntent: 'other', automationDomain: null, flowType: null, confidence: 0.5 };
  }

  const obj = parsed as Record<string, unknown>;
  const confidence =
    typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : 0.5;

  return {
    detectedIntent: isDetectedIntent(obj.detectedIntent) ? obj.detectedIntent : 'other',
    automationDomain: isAutomationDomain(obj.automationDomain) ? obj.automationDomain : null,
    flowType: isFlowType(obj.flowType) ? obj.flowType : null,
    confidence,
  };
}

function makeWorkflowQueue(): Queue {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return new Queue('workflow-execution', { connection: redis });
}

async function resolveIntentContext(
  pool: Pool,
  job: Job,
  data: IntentJobData,
): Promise<ResolvedIntentContext | null> {
  if (!isWebhookPayload(data)) {
    return {
      rawInput: data.rawInput,
      organizationId: data.organizationId,
      sourceType: data.sourceType,
      ...(data.sourceId ? { sourceId: data.sourceId } : {}),
      ...(data.actorId ? { actorId: data.actorId } : {}),
      correlationId: data.correlationId ?? crypto.randomUUID(),
    };
  }

  const orgResult = await pool.query<{ id: string }>(
    'SELECT id FROM organizations WHERE waba_phone_number_id = $1 LIMIT 1',
    [data.phoneNumberId],
  );
  const organization = orgResult.rows[0];
  if (!organization) {
    console.warn(
      `[intent-detection] No organization found for phoneNumberId=${data.phoneNumberId}; skipping job ${String(job.id)}`,
    );
    return null;
  }

  const rawInput =
    data.normalized.content.type === 'text' && data.normalized.content.text
      ? data.normalized.content.text
      : '[media message]';

  return {
    rawInput,
    organizationId: organization.id,
    sourceType: 'whatsapp',
    sourceId: data.rawMessageId,
    senderPhone: data.normalized.senderPhone,
    correlationId: data.correlationId ?? crypto.randomUUID(),
  };
}

async function classifyIntent(
  anthropic: Anthropic,
  rawInput: string,
): Promise<ClassificationResult> {
  const prompt = `Classify the following message and respond with ONLY a JSON object (no markdown, no explanation):\n\nMessage: "${rawInput}"\n\nRespond with exactly this JSON structure:\n{\n  "detectedIntent": one of ["approval_request","task_creation","incident_report","leave_request","expense_request","membership_registration","attendance_checkin","information_request","other"],\n  "automationDomain": one of ["communication","task","approval","incident","membership","event","hr","finance","knowledge","governance","executive"] or null,\n  "flowType": one of ["screen_flow","record_trigger","scheduled","automated","ai_flow"] or null,\n  "confidence": a number between 0 and 1\n}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });
  const firstBlock = response.content[0];
  return parseClassification(firstBlock?.type === 'text' ? firstBlock.text : '{}');
}

async function resolveActorId(client: PoolClient, context: ResolvedIntentContext): Promise<string> {
  if (context.actorId) return context.actorId;
  if (context.senderPhone) {
    const userResult = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE organization_id = $1 AND whatsapp_phone = $2 LIMIT 1',
      [context.organizationId, context.senderPhone],
    );
    const user = userResult.rows[0];
    if (user) return user.id;
  }
  return context.organizationId;
}

async function dispatchWorkflow(
  client: PoolClient,
  workflowQueue: Queue,
  context: ResolvedIntentContext,
  classification: ClassificationResult,
): Promise<void> {
  const match = await discoverWorkflowForTrigger(client, {
    organizationId: context.organizationId,
    sourceType: context.sourceType,
    ...(context.sourceId ? { sourceId: context.sourceId } : {}),
    ...(context.actorId ? { actorId: context.actorId } : {}),
    rawInput: context.rawInput,
    intent: classification.detectedIntent,
    ...(classification.automationDomain
      ? { automationDomain: classification.automationDomain }
      : {}),
    ...(classification.flowType ? { flowType: classification.flowType } : {}),
    correlationId: context.correlationId,
    payload: {
      ...(context.senderPhone ? { senderPhone: context.senderPhone } : {}),
      rawInput: context.rawInput,
      ...(context.sourceId ? { sourceId: context.sourceId } : {}),
    },
  });

  if (!match) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: `intent.${classification.detectedIntent}.no_workflow`,
        organizationId: context.organizationId,
        source: context.sourceType,
      }),
    );
    return;
  }

  const actorId = await resolveActorId(client, context);
  const triggerData = {
    source: context.sourceType,
    sourceId: context.sourceId ?? null,
    rawInput: context.rawInput,
    senderPhone: context.senderPhone ?? null,
    intent: classification.detectedIntent,
    discoveryScore: match.score,
    discoveryReasons: match.reasons,
  };
  const runResult = await client.query<{ id: string }>(
    `INSERT INTO workflow_runs
       (organization_id, workflow_id, status, triggered_by, trigger_data, correlation_id)
     VALUES ($1, $2, 'pending', $3, $4, $5)
     RETURNING id`,
    [
      context.organizationId,
      match.workflowId,
      actorId,
      JSON.stringify(triggerData),
      context.correlationId,
    ],
  );
  const run = runResult.rows[0];
  if (!run) return;

  await workflowQueue.add('start-workflow', {
    jobName: 'start-workflow',
    organizationId: context.organizationId,
    runId: run.id,
    correlationId: context.correlationId,
    actorId,
    data: triggerData,
  });
}

async function handleAttendance(
  client: PoolClient,
  whatsapp: WhatsAppProvider,
  context: ResolvedIntentContext,
): Promise<void> {
  if (!context.senderPhone) return;
  const userResult = await client.query<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM users WHERE whatsapp_phone = $1 AND organization_id = $2 LIMIT 1',
    [context.senderPhone, context.organizationId],
  );
  const user = userResult.rows[0];
  if (!user) return;

  await client.query(
    "INSERT INTO attendance_records (organization_id, user_id, source) VALUES ($1, $2, 'whatsapp')",
    [context.organizationId, user.id],
  );
  await whatsapp
    .send(context.senderPhone, {
      type: 'text',
      text: `Check-in recorded for ${user.display_name}. Have a great day!`,
    })
    .catch(() => undefined);
}

async function handleMembership(
  client: PoolClient,
  whatsapp: WhatsAppProvider,
  context: ResolvedIntentContext,
): Promise<void> {
  if (!context.senderPhone) return;
  const existing = await client.query<{ id: string }>(
    `SELECT u.id FROM users u
       JOIN memberships m ON m.user_id = u.id
      WHERE u.whatsapp_phone = $1 AND u.organization_id = $2 AND m.status = 'active'
      LIMIT 1`,
    [context.senderPhone, context.organizationId],
  );

  if (existing.rows.length > 0) {
    await whatsapp
      .send(context.senderPhone, {
        type: 'text',
        text: "You're already a registered member. How can we help you today?",
      })
      .catch(() => undefined);
    return;
  }

  const newUserId = crypto.randomUUID();
  await client.query(
    'INSERT INTO users (id, organization_id, display_name, whatsapp_phone) VALUES ($1, $2, $3, $4)',
    [
      newUserId,
      context.organizationId,
      `Member ${context.senderPhone.slice(-4)}`,
      context.senderPhone,
    ],
  );
  await client.query('INSERT INTO memberships (organization_id, user_id) VALUES ($1, $2)', [
    context.organizationId,
    newUserId,
  ]);
  await whatsapp
    .send(context.senderPhone, {
      type: 'text',
      text: "Welcome! You've been registered as a member. You can now submit requests through WhatsApp.",
    })
    .catch(() => undefined);
}

async function handleInformationRequest(
  client: PoolClient,
  anthropic: Anthropic,
  whatsapp: WhatsAppProvider,
  context: ResolvedIntentContext,
): Promise<void> {
  if (!context.senderPhone) return;
  const chunks = await client.query<{ content: string; title: string | null }>(
    `SELECT kc.content, kd.title
       FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kd.id = kc.document_id
      WHERE kd.organization_id = $1
        AND kd.status = 'published'
        AND to_tsvector('english', kc.content) @@ plainto_tsquery('english', $2)
      ORDER BY ts_rank(to_tsvector('english', kc.content), plainto_tsquery('english', $2)) DESC
      LIMIT 4`,
    [context.organizationId, context.rawInput],
  );

  if (chunks.rows.length === 0) {
    await whatsapp
      .send(context.senderPhone, {
        type: 'text',
        text: 'Thank you for your question. A team member will get back to you shortly.',
      })
      .catch(() => undefined);
    return;
  }

  const knowledgeContext = chunks.rows
    .map(
      (chunk, index) =>
        `[${String(index + 1)}] ${chunk.title ?? 'Document'}: ${chunk.content.slice(0, 300)}`,
    )
    .join('\n\n');
  const answerResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Answer this question concisely using only the context below. If the context doesn't answer it, say you'll connect them with a team member.\n\nQuestion: ${context.rawInput}\n\nContext:\n${knowledgeContext}`,
      },
    ],
  });
  const answerBlock = answerResponse.content[0];
  if (answerBlock?.type !== 'text') return;
  await whatsapp
    .send(context.senderPhone, { type: 'text', text: answerBlock.text })
    .catch(() => undefined);
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
      const context = await resolveIntentContext(pool, job, jobData);
      if (!context) return;

      const classification = await classifyIntent(anthropic, context.rawInput);
      const requiresHumanReview = classification.confidence < 0.7;

      await withTenantClient(pool, context.organizationId, async (client) => {
        await client.query(
          `INSERT INTO intent_detections
             (organization_id, source_type, source_id, raw_input, detected_intent,
              automation_domain, flow_type, confidence_score, requires_human_review)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            context.organizationId,
            persistedSource(context.sourceType),
            context.sourceId ?? null,
            context.rawInput,
            classification.detectedIntent,
            classification.automationDomain,
            classification.flowType,
            classification.confidence,
            requiresHumanReview,
          ],
        );

        if (!requiresHumanReview) {
          await dispatchWorkflow(client, workflowQueue, context, classification);
        }

        if (requiresHumanReview || !context.senderPhone) return;
        switch (classification.detectedIntent) {
          case 'attendance_checkin':
            await handleAttendance(client, whatsapp, context);
            break;
          case 'membership_registration':
            await handleMembership(client, whatsapp, context);
            break;
          case 'information_request':
            await handleInformationRequest(client, anthropic, whatsapp, context);
            break;
          default:
            break;
        }
      });
    });
}
