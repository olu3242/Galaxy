import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { AgentRegistryService, AgentRuntime } from '@galaxy/agents';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const registry = new AgentRegistryService(pool);
const runtime = new AgentRuntime(pool);
let workflowQueue: Queue | undefined;

function getWorkflowQueue(): Queue {
  if (!workflowQueue) {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    workflowQueue = new Queue('workflow-execution', { connection: redis });
  }
  return workflowQueue;
}

interface AgentJobData {
  type: 'execute' | 'approve';
  organizationId: string;
  agentId: string;
  executionId?: string;
  triggerType?: string;
  triggerData?: Record<string, unknown>;
  input?: Record<string, unknown>;
  actorId: string;
  correlationId: string;
  workflowRunId?: string;
  workflowStepId?: string;
}

export async function processAgentJob(job: Job<AgentJobData>): Promise<void> {
  const { type, organizationId, agentId, actorId, correlationId } = job.data;

  if (type === 'execute') {
    const agent = await registry.getAgent(organizationId, agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    await runtime.execute(agent, {
      organizationId,
      agentId,
      triggerType: (job.data.triggerType ?? 'scheduled') as
        | 'manual'
        | 'scheduled'
        | 'event'
        | 'workflow',
      ...(job.data.triggerData !== undefined ? { triggerData: job.data.triggerData } : {}),
      input: job.data.input ?? {},
      actorId,
      correlationId,
    });

    if (job.data.workflowRunId && job.data.workflowStepId) {
      const idempotencyKey = `workflow:${job.data.workflowRunId}:${job.data.workflowStepId}:agent:${agentId}`;
      await getWorkflowQueue().add(
        'resume-step',
        {
          jobName: 'resume-step',
          organizationId,
          runId: job.data.workflowRunId,
          completedStepId: job.data.workflowStepId,
          actorId,
          correlationId,
          idempotencyKey,
          outcome: { engine: 'agent', status: 'completed', agentId },
        },
        {
          jobId: idempotencyKey,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
    }
    return;
  }

  if (!job.data.executionId) throw new Error('executionId required for approve action');
  await runtime.approveExecution(organizationId, job.data.executionId, actorId);
}
