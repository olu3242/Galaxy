import type { PoolClient } from 'pg';
import {
  ContextIntelligenceEngine,
  TriggerRegistry,
  WorkflowDiscoveryEngine,
  WorkflowRegistry,
  WorkflowTriggerAdapters,
  type AutomationDomain,
  type FlowType,
  type WorkflowDefinition,
  type WorkflowRequest,
  type WorkflowTriggerSource,
} from '@galaxy/workflow';

interface WorkflowRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  automation_domain: AutomationDomain | null;
  flow_type: FlowType | null;
  tags: string[];
  definition: Record<string, unknown>;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  definition: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface WorkflowDispatchInput {
  organizationId: string;
  sourceType: string;
  sourceId?: string;
  actorId?: string;
  rawInput: string;
  intent: string;
  automationDomain?: AutomationDomain;
  flowType?: FlowType;
  correlationId: string;
  payload: Record<string, unknown>;
}

export interface WorkflowDispatchMatch {
  workflowId: string;
  matchedTemplateId?: string;
  score: number;
  reasons: string[];
  request: WorkflowRequest;
}

function normalizeSource(sourceType: string): WorkflowTriggerSource {
  switch (sourceType.toLowerCase()) {
    case 'whatsapp':
      return 'whatsapp';
    case 'web':
      return 'web';
    case 'scheduler':
    case 'scheduled':
      return 'scheduler';
    case 'event':
      return 'event';
    case 'api':
    default:
      return 'api';
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function workflowFromRow(row: WorkflowRow): WorkflowDefinition {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    version: row.version,
    isActive: row.is_active,
    automationDomain: row.automation_domain ?? 'communication',
    flowType: row.flow_type ?? 'automated',
    tags: row.tags,
    definition: row.definition,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function templateAsWorkflow(
  row: TemplateRow,
  organizationId: string,
  automationDomain: AutomationDomain,
  flowType: FlowType,
): WorkflowDefinition {
  return {
    id: `template:${row.id}`,
    organizationId,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    version: 1,
    isActive: true,
    automationDomain,
    flowType,
    tags: [],
    definition: row.definition,
    createdBy: organizationId,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function makeRequest(input: WorkflowDispatchInput): WorkflowRequest {
  const envelope = {
    organizationId: input.organizationId,
    sourceId: input.sourceId,
    actorId: input.actorId,
    rawInput: input.rawInput,
    intent: input.intent,
    payload: input.payload,
    correlationId: input.correlationId,
  };

  let request: WorkflowRequest;
  switch (normalizeSource(input.sourceType)) {
    case 'whatsapp':
      request = WorkflowTriggerAdapters.whatsapp(envelope);
      break;
    case 'web':
      request = WorkflowTriggerAdapters.web(envelope);
      break;
    case 'scheduler':
      request = WorkflowTriggerAdapters.scheduler(envelope);
      break;
    case 'event':
      request = WorkflowTriggerAdapters.event(envelope);
      break;
    case 'api':
      request = WorkflowTriggerAdapters.api(envelope);
      break;
  }

  if (input.automationDomain) request.automationDomain = input.automationDomain;
  if (input.flowType) request.flowType = input.flowType;
  return request;
}

function normalized(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('-', ' ').trim().toLowerCase();
}

export async function discoverWorkflowForTrigger(
  client: PoolClient,
  input: WorkflowDispatchInput,
): Promise<WorkflowDispatchMatch | null> {
  const workflowRows = await client.query<WorkflowRow>(
    `SELECT id, organization_id, name, description, version, is_active,
            automation_domain, flow_type, tags, definition, created_by, created_at, updated_at
       FROM workflows
      WHERE organization_id = $1 AND is_active = true`,
    [input.organizationId],
  );

  const templateRows = await client.query<TemplateRow>(
    `SELECT id, name, description, definition, created_at, updated_at
       FROM workflow_definitions
      WHERE is_active = true`,
  );

  const domain = input.automationDomain ?? 'communication';
  const flowType = input.flowType ?? 'automated';
  const registry = new WorkflowRegistry();
  registry.registerMany(workflowRows.rows.map(workflowFromRow));

  const templateIds = new Map<string, string>();
  for (const template of templateRows.rows) {
    const workflow = templateAsWorkflow(template, input.organizationId, domain, flowType);
    registry.register(workflow);
    templateIds.set(workflow.id, template.id);
  }

  const request = makeRequest(input);
  const triggers = new TriggerRegistry();
  for (const workflow of registry.active(input.organizationId)) {
    const isTemplate = templateIds.has(workflow.id);
    triggers.register({
      id: `${request.source}:${workflow.id}`,
      workflowId: workflow.id,
      source: request.source,
      intent: request.intent,
      priority: isTemplate ? 10 : 30,
      predicate: (candidate) => {
        if (!candidate.intent) return true;
        const intent = normalized(candidate.intent);
        const name = normalized(workflow.name);
        const tags = workflow.tags.map(normalized);
        return name.includes(intent) || tags.includes(intent);
      },
    });
  }

  const contextEngine = new ContextIntelligenceEngine([
    {
      name: 'intent-classification',
      enrich: async () =>
        Promise.resolve({
          detectedIntent: input.intent,
          source: request.source,
          automationDomain: input.automationDomain ?? null,
          flowType: input.flowType ?? null,
        }),
    },
  ]);
  const context = await contextEngine.build(request);
  const matches = new WorkflowDiscoveryEngine(registry, triggers).discover(context);
  const best = matches[0];
  if (!best) return null;

  const matchedTemplateId = templateIds.get(best.workflow.id);
  if (!matchedTemplateId) {
    return {
      workflowId: best.workflow.id,
      score: best.score,
      reasons: best.reasons,
      request,
    };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO workflows
       (organization_id, name, description, version, is_active, definition, created_by,
        automation_domain, flow_type, tags)
     SELECT $1, name, description, 1, true, definition, $1, $2, $3, $4
       FROM workflow_definitions
      WHERE id = $5 AND is_active = true
     RETURNING id`,
    [input.organizationId, domain, flowType, [input.intent], matchedTemplateId],
  );
  const instantiated = inserted.rows[0];
  if (!instantiated) return null;

  return {
    workflowId: instantiated.id,
    matchedTemplateId,
    score: best.score,
    reasons: best.reasons,
    request,
  };
}
