import type { Pool, PoolClient } from 'pg';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ApprovalRuntimeService, TaskEngineService } from '@galaxy/workflow';

export interface ExecutableWorkflowStep {
  id: string;
  name: string;
  step_type: string;
  step_order: number;
  next_step_id: string | null;
  config: Record<string, unknown>;
}

export interface StepExecutionContext {
  organizationId: string;
  workflowRunId: string;
  correlationId: string;
  actorId: string;
  triggerData: Record<string, unknown>;
}

export type StepExecutionResult =
  | { disposition: 'wait'; engine: 'task' | 'approval' | 'agent' | 'notification' }
  | { disposition: 'advance'; engine: 'branch' | 'automation'; nextStepId?: string }
  | { disposition: 'scheduled'; engine: 'delay'; delayMs: number };

interface QueueJobOptions {
  delay?: number;
  attempts?: number;
  backoff?: { type: 'exponential'; delay: number };
  jobId?: string;
}

interface QueueLike {
  add(name: string, data: Record<string, unknown>, opts?: QueueJobOptions): Promise<unknown>;
}

export interface StepExecutionQueues {
  agent: QueueLike;
  notification: QueueLike;
  workflow: QueueLike;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function queueSet(): StepExecutionQueues {
  const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return {
    agent: new Queue('agent-execution', { connection }),
    notification: new Queue('notification-dispatch', { connection }),
    workflow: new Queue('workflow-execution', { connection }),
  };
}

function poolAdapter(client: PoolClient): Pool {
  return client as unknown as Pool;
}

function readField(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, data);
}

function conditionMatches(type: string, actual: unknown, expected: unknown): boolean {
  switch (type) {
    case 'field_equals': return actual === expected;
    case 'field_gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'field_lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'field_contains': return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
    default: return false;
  }
}

async function resolveBranch(client: PoolClient, step: ExecutableWorkflowStep, triggerData: Record<string, unknown>): Promise<string | undefined> {
  const result = await client.query<{ condition_type: string; field: string | null; value: unknown; next_step_id: string | null }>(
    `SELECT condition_type, field, value, next_step_id
       FROM workflow_conditions WHERE step_id = $1 ORDER BY created_at ASC`,
    [step.id],
  );
  for (const condition of result.rows) {
    if (!condition.field || !condition.next_step_id) continue;
    if (conditionMatches(condition.condition_type, readField(triggerData, condition.field), condition.value)) return condition.next_step_id;
  }
  return step.next_step_id ?? undefined;
}

function retryOptions(jobId: string): QueueJobOptions {
  return { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, jobId };
}

export function createStepExecutor(injectedQueues?: StepExecutionQueues) {
  let queues = injectedQueues;
  const getQueues = (): StepExecutionQueues => {
    queues ??= queueSet();
    return queues;
  };

  return async (client: PoolClient, step: ExecutableWorkflowStep, context: StepExecutionContext): Promise<StepExecutionResult> => {
    const config = step.config ?? {};

    switch (step.step_type) {
      case 'manual_task':
      case 'task': {
        const description = stringValue(config.description);
        const assigneeId = stringValue(config.assigneeId);
        const taskEngine = new TaskEngineService(poolAdapter(client));
        await taskEngine.createTask({
          organizationId: context.organizationId,
          workflowRunId: context.workflowRunId,
          title: stringValue(config.title) ?? step.name,
          ...(description ? { description } : {}),
          priority: (stringValue(config.priority) as 'low' | 'medium' | 'high' | 'urgent' | undefined) ?? 'medium',
          ...(assigneeId ? { assigneeId } : {}),
          reporterId: stringValue(config.reporterId) ?? context.actorId,
          data: { ...config, workflowStepId: step.id },
          correlationId: context.correlationId,
        });
        return { disposition: 'wait', engine: 'task' };
      }

      case 'approval': {
        const assignedTo = stringArray(config.assignedTo);
        if (assignedTo.length === 0) throw new Error(`Approval step ${step.id} requires config.assignedTo`);
        const currency = stringValue(config.currency);
        const deadline = stringValue(config.deadline);
        const escalateTo = stringValue(config.escalateTo);
        const timeoutAt = stringValue(config.timeoutAt);
        const approvals = new ApprovalRuntimeService(poolAdapter(client));
        await approvals.request({
          organizationId: context.organizationId,
          workflowRunId: context.workflowRunId,
          stepId: step.id,
          category: (stringValue(config.category) as 'finance' | 'hr' | 'security' | 'legal' | 'executive' | 'compliance' | 'general' | undefined) ?? 'general',
          subject: stringValue(config.subject) ?? step.name,
          description: stringValue(config.description) ?? step.name,
          requestedBy: stringValue(config.requestedBy) ?? context.actorId,
          assignedTo,
          ...(typeof config.amount === 'number' ? { amount: config.amount } : {}),
          ...(currency ? { currency } : {}),
          ...(deadline ? { deadline } : {}),
          ...(escalateTo ? { escalateTo } : {}),
          ...(timeoutAt ? { timeoutAt } : {}),
          correlationId: context.correlationId,
        });
        return { disposition: 'wait', engine: 'approval' };
      }

      case 'agent': {
        const agentId = stringValue(config.agentId);
        if (!agentId) throw new Error(`Agent step ${step.id} requires config.agentId`);
        await getQueues().agent.add('execute', {
          type: 'execute', organizationId: context.organizationId, agentId,
          triggerType: 'workflow', triggerData: context.triggerData,
          input: typeof config.input === 'object' && config.input !== null ? config.input : {},
          actorId: stringValue(config.actorId) ?? context.actorId,
          correlationId: context.correlationId,
          workflowRunId: context.workflowRunId,
          workflowStepId: step.id,
        }, retryOptions(`workflow:${context.workflowRunId}:${step.id}:agent`));
        return { disposition: 'wait', engine: 'agent' };
      }

      case 'notification': {
        const recipientIds = stringArray(config.recipientIds);
        const broadcastId = stringValue(config.broadcastId);
        if (!broadcastId || recipientIds.length === 0) throw new Error(`Notification step ${step.id} requires broadcastId and recipientIds`);
        await getQueues().notification.add('dispatch', {
          organizationId: context.organizationId, broadcastId, recipientIds,
          content: stringValue(config.content) ?? step.name,
          channel: stringValue(config.channel) ?? 'whatsapp',
          correlationId: context.correlationId,
          workflowRunId: context.workflowRunId,
          workflowStepId: step.id,
        }, retryOptions(`workflow:${context.workflowRunId}:${step.id}:notification`));
        return { disposition: 'wait', engine: 'notification' };
      }

      case 'delay': {
        const delayMs = Math.max(0, numberValue(config.delayMs, 0));
        await getQueues().workflow.add('resume-step', {
          jobName: 'resume-step', organizationId: context.organizationId,
          runId: context.workflowRunId, completedStepId: step.id,
          actorId: context.actorId, correlationId: context.correlationId,
          idempotencyKey: `workflow:${context.workflowRunId}:${step.id}:delay`,
          outcome: { engine: 'delay', status: 'elapsed' },
        }, { ...retryOptions(`workflow:${context.workflowRunId}:${step.id}:delay`), delay: delayMs });
        return { disposition: 'scheduled', engine: 'delay', delayMs };
      }

      case 'condition':
      case 'branch': {
        const nextStepId = await resolveBranch(client, step, context.triggerData);
        return nextStepId ? { disposition: 'advance', engine: 'branch', nextStepId } : { disposition: 'advance', engine: 'branch' };
      }

      case 'automation': {
        const delayMs = numberValue(config.delayMs, -1);
        if (delayMs >= 0) {
          await getQueues().workflow.add('resume-step', {
            jobName: 'resume-step', organizationId: context.organizationId,
            runId: context.workflowRunId, completedStepId: step.id,
            actorId: context.actorId, correlationId: context.correlationId,
            idempotencyKey: `workflow:${context.workflowRunId}:${step.id}:automation`,
            outcome: { engine: 'automation', status: 'elapsed' },
          }, { ...retryOptions(`workflow:${context.workflowRunId}:${step.id}:automation`), delay: delayMs });
          return { disposition: 'scheduled', engine: 'delay', delayMs };
        }
        return { disposition: 'advance', engine: 'automation' };
      }

      default: throw new Error(`Unsupported workflow step type: ${step.step_type}`);
    }
  };
}
