import type { WorkflowRequest, WorkflowTriggerSource } from '../contracts.js';

export interface TriggerEnvelope {
  organizationId: string;
  sourceId?: string;
  actorId?: string;
  rawInput?: string;
  intent?: string;
  payload?: Record<string, unknown>;
  correlationId: string;
  receivedAt?: string;
}

function adapt(source: WorkflowTriggerSource, envelope: TriggerEnvelope): WorkflowRequest {
  return {
    organizationId: envelope.organizationId,
    source,
    payload: envelope.payload ?? {},
    correlationId: envelope.correlationId,
    receivedAt: envelope.receivedAt ?? new Date().toISOString(),
    ...(envelope.sourceId !== undefined ? { sourceId: envelope.sourceId } : {}),
    ...(envelope.actorId !== undefined ? { actorId: envelope.actorId } : {}),
    ...(envelope.rawInput !== undefined ? { rawInput: envelope.rawInput } : {}),
    ...(envelope.intent !== undefined ? { intent: envelope.intent } : {}),
  };
}

export const WorkflowTriggerAdapters = {
  whatsapp: (input: TriggerEnvelope): WorkflowRequest => adapt('whatsapp', input),
  web: (input: TriggerEnvelope): WorkflowRequest => adapt('web', input),
  api: (input: TriggerEnvelope): WorkflowRequest => adapt('api', input),
  scheduler: (input: TriggerEnvelope): WorkflowRequest => adapt('scheduler', input),
  event: (input: TriggerEnvelope): WorkflowRequest => adapt('event', input),
};
