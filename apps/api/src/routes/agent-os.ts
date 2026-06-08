import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  AgentRegistryService,
  AgentRuntime,
  DecisionEngine,
  RiskScoringEngine,
  GovernanceEngine,
  ExecutiveCopilot,
  OperationsCopilot,
  ComplianceCopilot,
} from '@galaxy/agents';
import type { AgentType, AgentCapability, DecisionOutcome, RiskLevel } from '@galaxy/agents';

interface AgentRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  agent_type: string;
  capabilities: string[];
  automation_domains: string[];
  is_active: boolean;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ExecutionRow {
  id: string;
  organization_id: string;
  agent_id: string;
  status: string;
  risk_score: string | null;
  requires_human_approval: boolean;
  correlation_id: string;
  created_at: string;
}

interface DecisionRow {
  id: string;
  organization_id: string;
  agent_id: string;
  decision_type: string;
  subject: string;
  outcome: string;
  confidence_score: string;
  requires_human_override: boolean;
  correlation_id: string;
  created_at: string;
}

interface RiskRow {
  id: string;
  organization_id: string;
  subject_type: string;
  subject_id: string;
  risk_score: string;
  risk_level: string;
  correlation_id: string;
  created_at: string;
}

const VALID_AGENT_TYPES = new Set<AgentType>([
  'executive_copilot',
  'operations_copilot',
  'compliance_copilot',
  'custom',
]);

const VALID_CAPABILITIES = new Set<AgentCapability>([
  'read_workflows',
  'read_analytics',
  'read_knowledge',
  'write_tasks',
  'trigger_workflows',
  'approve_decisions',
  'assess_risk',
  'generate_recommendations',
]);

function responseEnvelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

export function agentOsRoutes(fastify: FastifyInstance): void {
  const registry = new AgentRegistryService(fastify.pg);
  const runtime = new AgentRuntime(fastify.pg);
  const decisionEngine = new DecisionEngine(fastify.pg);
  const riskEngine = new RiskScoringEngine(fastify.pg);
  const governance = new GovernanceEngine(fastify.pg);

  // ── Register agent ──────────────────────────────────────────────────────────
  fastify.post(
    '/agents',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          name: string;
          description?: string;
          agentType: string;
          capabilities: string[];
          automationDomains: string[];
          config?: Record<string, unknown>;
          createdBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name, agentType, capabilities, automationDomains, createdBy } =
        request.body;

      if (!organizationId || !name || !agentType || !createdBy) {
        return reply
          .status(400)
          .send({ error: 'organizationId, name, agentType, createdBy required' });
      }
      if (!VALID_AGENT_TYPES.has(agentType as AgentType)) {
        return reply.status(400).send({ error: `Invalid agentType: ${agentType}` });
      }
      const invalidCap = capabilities.find((c) => !VALID_CAPABILITIES.has(c as AgentCapability));
      if (invalidCap) {
        return reply.status(400).send({ error: `Invalid capability: ${invalidCap}` });
      }

      const agent = await registry.registerAgent({
        organizationId,
        name,
        agentType: agentType as AgentType,
        capabilities: capabilities as AgentCapability[],
        automationDomains,
        ...(request.body.config !== undefined ? { config: request.body.config } : {}),
        createdBy,
        ...(request.body.description !== undefined
          ? { description: request.body.description }
          : {}),
      });

      return reply.status(201).send(responseEnvelope(agent, request.id));
    },
  );

  // ── List agents ─────────────────────────────────────────────────────────────
  fastify.get(
    '/agents',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; agentType?: string; isActive?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, agentType, isActive } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const agents = await registry.listAgents(organizationId, {
        ...(agentType !== undefined ? { agentType: agentType as AgentType } : {}),
        ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
      });

      return reply.send(responseEnvelope(agents, request.id));
    },
  );

  // ── Get agent ───────────────────────────────────────────────────────────────
  fastify.get(
    '/agents/:agentId',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Querystring: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { agentId } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const agent = await registry.getAgent(organizationId, agentId);
      if (!agent) return reply.status(404).send({ error: 'Agent not found' });

      return reply.send(responseEnvelope(agent, request.id));
    },
  );

  // ── Execute agent ───────────────────────────────────────────────────────────
  fastify.post(
    '/agents/:agentId/execute',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: {
          organizationId: string;
          triggerType: string;
          triggerData?: Record<string, unknown>;
          input: Record<string, unknown>;
          actorId: string;
          correlationId: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { agentId } = request.params;
      const { organizationId, triggerType, input, actorId, correlationId } = request.body;

      if (!organizationId || !actorId || !correlationId) {
        return reply
          .status(400)
          .send({ error: 'organizationId, input, actorId, correlationId required' });
      }

      const agent = await registry.getAgent(organizationId, agentId);
      if (!agent) return reply.status(404).send({ error: 'Agent not found' });
      if (!agent.isActive) return reply.status(409).send({ error: 'Agent is inactive' });

      const govCheck = await governance.validateAgentWriteAction(
        organizationId,
        actorId,
        'trigger_workflow',
        input,
      );
      if (!govCheck.allowed) {
        return reply.status(403).send({ error: govCheck.reason });
      }

      const execution = await runtime.execute(agent, {
        organizationId,
        agentId,
        triggerType: triggerType as 'manual' | 'scheduled' | 'event' | 'workflow',
        ...(request.body.triggerData !== undefined
          ? { triggerData: request.body.triggerData }
          : {}),
        input,
        actorId,
        correlationId,
      });

      return reply.status(202).send(responseEnvelope(execution, request.id));
    },
  );

  // ── List executions ─────────────────────────────────────────────────────────
  fastify.get(
    '/agents/:agentId/executions',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Querystring: { organizationId: string; status?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { agentId } = request.params;
      const { organizationId, status, limit } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const executions = await runtime.listExecutions(organizationId, {
        agentId,
        ...(status !== undefined
          ? { status: status as 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_human' }
          : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });

      return reply.send(responseEnvelope(executions, request.id));
    },
  );

  // ── Approve execution (human override) ──────────────────────────────────────
  fastify.post(
    '/agents/executions/:executionId/approve',
    async (
      request: FastifyRequest<{
        Params: { executionId: string };
        Body: { organizationId: string; actorId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { executionId } = request.params;
      const { organizationId, actorId } = request.body;
      if (!organizationId || !actorId) {
        return reply.status(400).send({ error: 'organizationId, actorId required' });
      }

      const execution = await runtime.approveExecution(organizationId, executionId, actorId);
      return reply.send(responseEnvelope(execution, request.id));
    },
  );

  // ── List decisions ──────────────────────────────────────────────────────────
  fastify.get(
    '/agents/decisions',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          agentId?: string;
          requiresHumanOverride?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, agentId, requiresHumanOverride, limit } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const decisions = await decisionEngine.listDecisions(organizationId, {
        ...(agentId !== undefined ? { agentId } : {}),
        ...(requiresHumanOverride !== undefined
          ? { requiresHumanOverride: requiresHumanOverride === 'true' }
          : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });

      return reply.send(responseEnvelope(decisions, request.id));
    },
  );

  // ── Human override on decision ──────────────────────────────────────────────
  fastify.post(
    '/agents/decisions/:decisionId/override',
    async (
      request: FastifyRequest<{
        Params: { decisionId: string };
        Body: {
          organizationId: string;
          actorId: string;
          outcome: string;
          reason: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { decisionId } = request.params;
      const { organizationId, actorId, outcome, reason } = request.body;

      if (!organizationId || !actorId || !outcome || !reason) {
        return reply
          .status(400)
          .send({ error: 'organizationId, actorId, outcome, reason required' });
      }

      const decision = await decisionEngine.applyHumanOverride(
        organizationId,
        decisionId,
        actorId,
        outcome as DecisionOutcome,
        reason,
      );

      return reply.send(responseEnvelope(decision, request.id));
    },
  );

  // ── Decision rules ──────────────────────────────────────────────────────────
  fastify.post(
    '/agents/rules',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          name: string;
          description?: string;
          automationDomain: string;
          conditions: { field: string; operator: string; value: unknown }[];
          action: string;
          priority?: number;
          createdBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name, automationDomain, conditions, action, createdBy } =
        request.body;
      if (!organizationId || !name || !automationDomain || !action || !createdBy) {
        return reply
          .status(400)
          .send({ error: 'organizationId, name, automationDomain, action, createdBy required' });
      }

      const rule = await decisionEngine.createRule(organizationId, {
        name,
        automationDomain,
        conditions: conditions as Parameters<typeof decisionEngine.createRule>[1]['conditions'],
        action,
        createdBy,
        ...(request.body.description !== undefined
          ? { description: request.body.description }
          : {}),
        ...(request.body.priority !== undefined ? { priority: request.body.priority } : {}),
      });

      return reply.status(201).send(responseEnvelope(rule, request.id));
    },
  );

  // ── Risk assessments ────────────────────────────────────────────────────────
  fastify.get(
    '/agents/risk',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; riskLevel?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, riskLevel, limit } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const assessments = await riskEngine.listAssessments(organizationId, {
        ...(riskLevel !== undefined ? { riskLevel: riskLevel as RiskLevel } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });

      return reply.send(responseEnvelope(assessments, request.id));
    },
  );

  // ── Copilots ────────────────────────────────────────────────────────────────
  fastify.post(
    '/copilots/executive',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          actorId: string;
          query: string;
          context?: Record<string, unknown>;
          correlationId: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId, query, correlationId } = request.body;
      if (!organizationId || !actorId || !query || !correlationId) {
        return reply
          .status(400)
          .send({ error: 'organizationId, actorId, query, correlationId required' });
      }

      const copilot = new ExecutiveCopilot(fastify.pg);
      const response = await copilot.query({
        organizationId,
        actorId,
        query,
        correlationId,
        ...(request.body.context !== undefined ? { context: request.body.context } : {}),
      });

      return reply.send(responseEnvelope(response, request.id));
    },
  );

  fastify.post(
    '/copilots/operations',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          actorId: string;
          query: string;
          context?: Record<string, unknown>;
          correlationId: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId, query, correlationId } = request.body;
      if (!organizationId || !actorId || !query || !correlationId) {
        return reply
          .status(400)
          .send({ error: 'organizationId, actorId, query, correlationId required' });
      }

      const copilot = new OperationsCopilot(fastify.pg);
      const response = await copilot.query({
        organizationId,
        actorId,
        query,
        correlationId,
        ...(request.body.context !== undefined ? { context: request.body.context } : {}),
      });

      return reply.send(responseEnvelope(response, request.id));
    },
  );

  fastify.post(
    '/copilots/compliance',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          actorId: string;
          query: string;
          context?: Record<string, unknown>;
          correlationId: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId, query, correlationId } = request.body;
      if (!organizationId || !actorId || !query || !correlationId) {
        return reply
          .status(400)
          .send({ error: 'organizationId, actorId, query, correlationId required' });
      }

      const copilot = new ComplianceCopilot(fastify.pg);
      const response = await copilot.query({
        organizationId,
        actorId,
        query,
        correlationId,
        ...(request.body.context !== undefined ? { context: request.body.context } : {}),
      });

      return reply.send(responseEnvelope(response, request.id));
    },
  );

  // ── Raw query endpoints (direct DB, typed) ──────────────────────────────────
  fastify.get(
    '/agents/overview',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const [agentResult, execResult, riskResult, decisionResult] = await Promise.all([
        fastify.pg.query<AgentRow>(
          `SELECT id, name, agent_type, is_active, created_at FROM agents
           WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [organizationId],
        ),
        fastify.pg.query<ExecutionRow>(
          `SELECT id, agent_id, status, risk_score, requires_human_approval, created_at
           FROM agent_executions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [organizationId],
        ),
        fastify.pg.query<RiskRow>(
          `SELECT id, risk_level, risk_score, subject_type, created_at
           FROM risk_assessments WHERE organization_id = $1 ORDER BY risk_score DESC LIMIT 5`,
          [organizationId],
        ),
        fastify.pg.query<DecisionRow>(
          `SELECT id, decision_type, outcome, confidence_score, requires_human_override, created_at
           FROM decisions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [organizationId],
        ),
      ]);

      return reply.send(
        responseEnvelope(
          {
            agents: agentResult.rows,
            recentExecutions: execResult.rows,
            topRisks: riskResult.rows,
            recentDecisions: decisionResult.rows,
          },
          request.id,
        ),
      );
    },
  );
}
