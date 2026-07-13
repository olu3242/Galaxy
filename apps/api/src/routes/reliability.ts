import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  HappyPathService,
  FailureRegistryService,
  ConfidenceEngine,
  ThreatDetectionService,
  EscalationService,
  GovernanceEnforcementService,
  RecoveryEngine,
  SimulationEngine,
  ReliabilityScoreService,
} from '@galaxy/reliability';
import type {
  HappyPathScenario,
  HappyPathStep,
  FailureCategory,
  FailureSeverity,
  FailureStatus,
  ThreatType,
  ThreatSeverity,
  EscalationType,
  EscalationStatus,
  GovernanceActionType,
  RetryStatus,
  SimulationType,
} from '@galaxy/reliability';

function getOrgId(request: FastifyRequest): string {
  return (request as unknown as { organizationId: string }).organizationId;
}

export async function reliabilityRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Reliability Score ────────────────────────────────────────────────────

  fastify.get('/reliability/score', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const svc = new ReliabilityScoreService(fastify.pg);
    const existing = await svc.getLatestReport(orgId);
    if (existing) return reply.send(existing);
    return reply.send(await svc.computeScore(orgId));
  });

  fastify.post('/reliability/score', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const svc = new ReliabilityScoreService(fastify.pg);
    return reply.send(await svc.computeScore(orgId));
  });

  // ── Confidence ───────────────────────────────────────────────────────────

  fastify.get(
    '/reliability/confidence/thresholds',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ autoExecuteMin: 0.95, confirmationMin: 0.8 });
    },
  );

  fastify.post(
    '/reliability/confidence/thresholds',
    async (
      request: FastifyRequest<{ Body: { autoExecuteMin: number; confirmationMin: number } }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { autoExecuteMin, confirmationMin } = request.body;
      const svc = new ConfidenceEngine(fastify.pg);
      return reply.send(await svc.setThreshold(orgId, autoExecuteMin, confirmationMin));
    },
  );

  fastify.post(
    '/reliability/confidence/score',
    async (
      request: FastifyRequest<{
        Body: {
          resourceType: string;
          resourceId: string;
          score: number;
          factors?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { resourceType, resourceId, score, factors } = request.body;
      const svc = new ConfidenceEngine(fastify.pg);
      return reply.send(await svc.score(orgId, resourceType, resourceId, score, factors));
    },
  );

  // ── Happy Paths ──────────────────────────────────────────────────────────

  fastify.get(
    '/reliability/happy-paths',
    async (
      request: FastifyRequest<{ Querystring: { scenario?: HappyPathScenario } }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const svc = new HappyPathService(fastify.pg);
      return reply.send(await svc.listTemplates(orgId, request.query.scenario));
    },
  );

  fastify.post(
    '/reliability/happy-paths',
    async (
      request: FastifyRequest<{
        Body: {
          scenario: HappyPathScenario;
          name: string;
          description: string;
          steps: HappyPathStep[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { scenario, name, description, steps } = request.body;
      const svc = new HappyPathService(fastify.pg);
      return reply
        .status(201)
        .send(await svc.registerTemplate(orgId, scenario, name, description, steps));
    },
  );

  fastify.post(
    '/reliability/happy-paths/:templateId/simulate',
    async (request: FastifyRequest<{ Params: { templateId: string } }>, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const svc = new HappyPathService(fastify.pg);
      return reply.send(await svc.runSimulation(orgId, request.params.templateId));
    },
  );

  fastify.get(
    '/reliability/happy-paths/metrics/:scenario',
    async (
      request: FastifyRequest<{ Params: { scenario: HappyPathScenario } }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const svc = new HappyPathService(fastify.pg);
      return reply.send(await svc.getMetrics(orgId, request.params.scenario));
    },
  );

  // ── Failures ─────────────────────────────────────────────────────────────

  fastify.get(
    '/reliability/failures',
    async (
      request: FastifyRequest<{
        Querystring: { category?: FailureCategory; status?: FailureStatus; limit?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { category, status, limit } = request.query;
      const svc = new FailureRegistryService(fastify.pg);
      return reply.send(await svc.listFailures(orgId, category, status, limit));
    },
  );

  fastify.post(
    '/reliability/failures',
    async (
      request: FastifyRequest<{
        Body: {
          category: FailureCategory;
          severity: FailureSeverity;
          description: string;
          context?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { category, severity, description, context } = request.body;
      const svc = new FailureRegistryService(fastify.pg);
      return reply
        .status(201)
        .send(await svc.recordFailure(orgId, category, severity, description, context));
    },
  );

  fastify.post(
    '/reliability/failures/:failureId/resolve',
    async (
      request: FastifyRequest<{
        Params: { failureId: string };
        Body: { resolvedBy: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const svc = new FailureRegistryService(fastify.pg);
      return reply.send(
        await svc.resolveFailure(orgId, request.params.failureId, request.body.resolvedBy),
      );
    },
  );

  fastify.get(
    '/reliability/failures/metrics',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const svc = new FailureRegistryService(fastify.pg);
      return reply.send(await svc.getFailureMetrics(orgId));
    },
  );

  // ── Threats ──────────────────────────────────────────────────────────────

  fastify.get(
    '/reliability/threats',
    async (
      request: FastifyRequest<{ Querystring: { threatType?: ThreatType; limit?: number } }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { threatType, limit } = request.query;
      const svc = new ThreatDetectionService(fastify.pg);
      return reply.send(await svc.listThreats(orgId, threatType, limit));
    },
  );

  fastify.post(
    '/reliability/threats',
    async (
      request: FastifyRequest<{
        Body: {
          threatType: ThreatType;
          severity: ThreatSeverity;
          sourceId: string;
          sourceType: string;
          content: string;
          indicators?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { threatType, severity, sourceId, sourceType, content, indicators } = request.body;
      const svc = new ThreatDetectionService(fastify.pg);
      return reply
        .status(201)
        .send(
          await svc.recordThreat(
            orgId,
            threatType,
            severity,
            sourceId,
            sourceType,
            content,
            indicators,
          ),
        );
    },
  );

  // ── Escalations ──────────────────────────────────────────────────────────

  fastify.get(
    '/reliability/escalations',
    async (
      request: FastifyRequest<{ Querystring: { status?: EscalationStatus; limit?: number } }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { status, limit } = request.query;
      const svc = new EscalationService(fastify.pg);
      return reply.send(await svc.listEscalations(orgId, status, limit));
    },
  );

  fastify.post(
    '/reliability/escalations',
    async (
      request: FastifyRequest<{
        Body: {
          escalationType: EscalationType;
          resourceType: string;
          resourceId: string;
          reason: string;
          escalatedTo: string;
          escalatedBy: string;
          dueAt?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { escalationType, resourceType, resourceId, reason, escalatedTo, escalatedBy, dueAt } =
        request.body;
      const svc = new EscalationService(fastify.pg);
      return reply
        .status(201)
        .send(
          await svc.escalate(
            orgId,
            escalationType,
            resourceType,
            resourceId,
            reason,
            escalatedTo,
            escalatedBy,
            dueAt !== undefined ? new Date(dueAt) : undefined,
          ),
        );
    },
  );

  fastify.post(
    '/reliability/escalations/:escalationId/acknowledge',
    async (request: FastifyRequest<{ Params: { escalationId: string } }>, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const svc = new EscalationService(fastify.pg);
      return reply.send(await svc.acknowledge(orgId, request.params.escalationId));
    },
  );

  fastify.post(
    '/reliability/escalations/:escalationId/resolve',
    async (request: FastifyRequest<{ Params: { escalationId: string } }>, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const svc = new EscalationService(fastify.pg);
      return reply.send(await svc.resolve(orgId, request.params.escalationId));
    },
  );

  // ── Governance ───────────────────────────────────────────────────────────

  fastify.get(
    '/reliability/governance/pending',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const svc = new GovernanceEnforcementService(fastify.pg);
      return reply.send(await svc.listPendingApprovals(orgId));
    },
  );

  fastify.post(
    '/reliability/governance/request',
    async (
      request: FastifyRequest<{
        Body: {
          actionType: GovernanceActionType;
          requestedBy: string;
          resourceType: string;
          resourceId: string;
          context?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { actionType, requestedBy, resourceType, resourceId, context } = request.body;
      const svc = new GovernanceEnforcementService(fastify.pg);
      return reply
        .status(201)
        .send(
          await svc.requestApproval(
            orgId,
            actionType,
            requestedBy,
            resourceType,
            resourceId,
            context,
          ),
        );
    },
  );

  fastify.post(
    '/reliability/governance/:approvalId/approve',
    async (
      request: FastifyRequest<{
        Params: { approvalId: string };
        Body: { approvedBy: string; note?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { approvedBy, note } = request.body;
      const svc = new GovernanceEnforcementService(fastify.pg);
      return reply.send(await svc.approve(orgId, request.params.approvalId, approvedBy, note));
    },
  );

  fastify.post(
    '/reliability/governance/:approvalId/reject',
    async (
      request: FastifyRequest<{
        Params: { approvalId: string };
        Body: { rejectedBy: string; note?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { rejectedBy, note } = request.body;
      const svc = new GovernanceEnforcementService(fastify.pg);
      return reply.send(await svc.reject(orgId, request.params.approvalId, rejectedBy, note));
    },
  );

  // ── Recovery / Retries ───────────────────────────────────────────────────

  fastify.get(
    '/reliability/retries',
    async (
      request: FastifyRequest<{ Querystring: { status?: RetryStatus } }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const svc = new RecoveryEngine(fastify.pg);
      return reply.send(await svc.listRetries(orgId, request.query.status));
    },
  );

  fastify.post(
    '/reliability/retries',
    async (
      request: FastifyRequest<{ Body: { resourceType: string; resourceId: string } }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { resourceType, resourceId } = request.body;
      const svc = new RecoveryEngine(fastify.pg);
      return reply.status(201).send(await svc.initiateRetry(orgId, resourceType, resourceId));
    },
  );

  // ── Simulations ──────────────────────────────────────────────────────────

  fastify.get(
    '/reliability/simulations',
    async (
      request: FastifyRequest<{
        Querystring: { simulationType?: SimulationType; limit?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { simulationType, limit } = request.query;
      const svc = new SimulationEngine(fastify.pg);
      return reply.send(await svc.listRuns(orgId, simulationType, limit));
    },
  );

  fastify.post(
    '/reliability/simulations',
    async (
      request: FastifyRequest<{
        Body: { simulationType: SimulationType; config?: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = getOrgId(request);
      const { simulationType, config } = request.body;
      const svc = new SimulationEngine(fastify.pg);
      return reply.status(201).send(await svc.createRun(orgId, simulationType, config));
    },
  );

  fastify.post(
    '/reliability/simulations/:runId/execute',
    async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const svc = new SimulationEngine(fastify.pg);
      return reply.send(await svc.executeRun(orgId, request.params.runId));
    },
  );

  fastify.post(
    '/reliability/simulations/:runId/report',
    async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const svc = new SimulationEngine(fastify.pg);
      return reply.status(201).send(await svc.generateReport(orgId, request.params.runId));
    },
  );
}
