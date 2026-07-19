import type { Job } from 'bullmq';
import { Pool } from 'pg';
import { AgentRegistryService, AgentRuntime } from '@galaxy/agents';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const registry = new AgentRegistryService(pool);
const runtime = new AgentRuntime(pool);

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
    return;
  }

  // type === 'approve'
  if (!job.data.executionId) throw new Error('executionId required for approve action');
  await runtime.approveExecution(organizationId, job.data.executionId, actorId);
}
