import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';
import type { Job } from 'bullmq';

type DetectedIntent =
  | 'approval_request'
  | 'task_creation'
  | 'incident_report'
  | 'leave_request'
  | 'expense_request'
  | 'membership_registration'
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

interface IntentJobData {
  rawInput: string;
  organizationId: string;
  sourceType: string;
  sourceId?: string;
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

export function createIntentProcessor(
  pool: Pool,
  anthropicApiKey: string,
): (job: Job) => Promise<void> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  return async (job: Job): Promise<void> => {
    const { rawInput, organizationId, sourceType, sourceId } = job.data as IntentJobData;

    await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);

    const prompt = `Classify the following message and respond with ONLY a JSON object (no markdown, no explanation):

Message: "${rawInput}"

Respond with exactly this JSON structure:
{
  "detectedIntent": one of ["approval_request","task_creation","incident_report","leave_request","expense_request","membership_registration","information_request","other"],
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

    await pool.query(
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
  };
}
