import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  PolicyService,
  ComplianceCheckService,
  ComplianceReportService,
  DataRetentionService,
} from '@galaxy/governance';
import type {
  PolicyType,
  PolicyStatus,
  ComplianceStatus,
  RetentionAction,
} from '@galaxy/governance';

function responseEnvelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

export function governanceRoutes(fastify: FastifyInstance): void {
  const policyService = new PolicyService(fastify.pg);
  const complianceService = new ComplianceCheckService(fastify.pg);
  const reportService = new ComplianceReportService(fastify.pg);
  const retentionService = new DataRetentionService(fastify.pg);

  // ── Policies CRUD ────────────────────────────────────────────────────────────

  fastify.post(
    '/governance/policies',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          name: string;
          policyType: string;
          createdBy: string;
          description?: string;
          config?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name, policyType, createdBy } = request.body;
      if (!organizationId || !name || !policyType || !createdBy) {
        return reply
          .status(400)
          .send({ error: 'organizationId, name, policyType, createdBy required' });
      }

      const policy = await policyService.createPolicy({
        organizationId,
        name,
        policyType: policyType as PolicyType,
        createdBy,
        ...(request.body.description !== undefined
          ? { description: request.body.description }
          : {}),
        ...(request.body.config !== undefined ? { config: request.body.config } : {}),
      });

      return reply.status(201).send(responseEnvelope(policy, request.id));
    },
  );

  fastify.get(
    '/governance/policies',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; policyType?: string; status?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, policyType, status } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const policies = await policyService.listPolicies(organizationId, {
        ...(policyType !== undefined ? { policyType: policyType as PolicyType } : {}),
        ...(status !== undefined ? { status: status as PolicyStatus } : {}),
      });

      return reply.send(responseEnvelope(policies, request.id));
    },
  );

  fastify.get(
    '/governance/policies/:policyId',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Querystring: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const policy = await policyService.getPolicy(organizationId, policyId);
      if (!policy) return reply.status(404).send({ error: 'Policy not found' });

      return reply.send(responseEnvelope(policy, request.id));
    },
  );

  fastify.patch(
    '/governance/policies/:policyId',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Body: {
          organizationId: string;
          name?: string;
          description?: string;
          status?: string;
          config?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const policy = await policyService.updatePolicy(organizationId, policyId, {
        ...(request.body.name !== undefined ? { name: request.body.name } : {}),
        ...(request.body.description !== undefined
          ? { description: request.body.description }
          : {}),
        ...(request.body.status !== undefined
          ? { status: request.body.status as PolicyStatus }
          : {}),
        ...(request.body.config !== undefined ? { config: request.body.config } : {}),
      });

      if (!policy) return reply.status(404).send({ error: 'Policy not found' });
      return reply.send(responseEnvelope(policy, request.id));
    },
  );

  fastify.delete(
    '/governance/policies/:policyId',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Querystring: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const deleted = await policyService.deletePolicy(organizationId, policyId);
      if (!deleted) return reply.status(404).send({ error: 'Policy not found' });
      return reply.status(204).send();
    },
  );

  fastify.post(
    '/governance/policies/:policyId/evaluate',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Body: { organizationId: string; context: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { organizationId, context } = request.body;
      if (!organizationId || !context) {
        return reply.status(400).send({ error: 'organizationId, context required' });
      }

      const result = await policyService.evaluatePolicy(organizationId, policyId, context);
      return reply.send(responseEnvelope(result, request.id));
    },
  );

  // ── Policy rules ─────────────────────────────────────────────────────────────

  fastify.post(
    '/governance/policies/:policyId/rules',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Body: {
          organizationId: string;
          name: string;
          condition: Record<string, unknown>;
          action: string;
          priority?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { organizationId, name, condition, action } = request.body;
      if (!organizationId || !name || !action) {
        return reply.status(400).send({ error: 'organizationId, name, action required' });
      }

      const rule = await policyService.createPolicyRule({
        policyId,
        organizationId,
        name,
        condition,
        action,
        ...(request.body.priority !== undefined ? { priority: request.body.priority } : {}),
      });

      return reply.status(201).send(responseEnvelope(rule, request.id));
    },
  );

  fastify.get(
    '/governance/policies/:policyId/rules',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Querystring: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const rules = await policyService.listPolicyRules(organizationId, policyId);
      return reply.send(responseEnvelope(rules, request.id));
    },
  );

  // ── Compliance checks ─────────────────────────────────────────────────────────

  fastify.post(
    '/governance/compliance/run',
    async (
      request: FastifyRequest<{
        Body: { organizationId: string; runBy: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, runBy } = request.body;
      if (!organizationId || !runBy) {
        return reply.status(400).send({ error: 'organizationId, runBy required' });
      }

      const checks = await complianceService.runChecks(organizationId, runBy);
      return reply.status(201).send(responseEnvelope(checks, request.id));
    },
  );

  fastify.get(
    '/governance/compliance/checks',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          checkType?: string;
          status?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, checkType, status, limit } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const checks = await complianceService.listChecks(organizationId, {
        ...(checkType !== undefined ? { checkType } : {}),
        ...(status !== undefined ? { status: status as ComplianceStatus } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });

      return reply.send(responseEnvelope(checks, request.id));
    },
  );

  // ── Compliance reports ────────────────────────────────────────────────────────

  fastify.post(
    '/governance/reports',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          periodStart: string;
          periodEnd: string;
          generatedBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, periodStart, periodEnd, generatedBy } = request.body;
      if (!organizationId || !periodStart || !periodEnd || !generatedBy) {
        return reply
          .status(400)
          .send({ error: 'organizationId, periodStart, periodEnd, generatedBy required' });
      }

      const report = await reportService.generateReport(
        organizationId,
        periodStart,
        periodEnd,
        generatedBy,
      );
      return reply.status(201).send(responseEnvelope(report, request.id));
    },
  );

  fastify.get(
    '/governance/reports',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, limit } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const reports = await reportService.listReports(organizationId, {
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });

      return reply.send(responseEnvelope(reports, request.id));
    },
  );

  fastify.get(
    '/governance/reports/:reportId',
    async (
      request: FastifyRequest<{
        Params: { reportId: string };
        Querystring: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { reportId } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const report = await reportService.getReport(organizationId, reportId);
      if (!report) return reply.status(404).send({ error: 'Report not found' });
      return reply.send(responseEnvelope(report, request.id));
    },
  );

  fastify.post(
    '/governance/audit/export',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          periodStart: string;
          periodEnd: string;
          exportedBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, periodStart, periodEnd, exportedBy } = request.body;
      if (!organizationId || !periodStart || !periodEnd || !exportedBy) {
        return reply
          .status(400)
          .send({ error: 'organizationId, periodStart, periodEnd, exportedBy required' });
      }

      const exportData = await reportService.exportAuditTrail(
        organizationId,
        periodStart,
        periodEnd,
        exportedBy,
      );
      return reply.send(responseEnvelope(exportData, request.id));
    },
  );

  // ── Data retention policies ───────────────────────────────────────────────────

  fastify.post(
    '/governance/retention',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          resourceType: string;
          retentionDays: number;
          action: string;
          createdBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, resourceType, retentionDays, action, createdBy } = request.body;
      if (!organizationId || !resourceType || !retentionDays || !action || !createdBy) {
        return reply.status(400).send({
          error: 'organizationId, resourceType, retentionDays, action, createdBy required',
        });
      }

      const policy = await retentionService.createRetentionPolicy({
        organizationId,
        resourceType,
        retentionDays,
        action: action as RetentionAction,
        createdBy,
      });

      return reply.status(201).send(responseEnvelope(policy, request.id));
    },
  );

  fastify.get(
    '/governance/retention',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const policies = await retentionService.listRetentionPolicies(organizationId);
      return reply.send(responseEnvelope(policies, request.id));
    },
  );

  fastify.post(
    '/governance/retention/enforce',
    async (request: FastifyRequest<{ Body: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const results = await retentionService.enforceRetentionPolicies(organizationId);
      return reply.send(responseEnvelope(results, request.id));
    },
  );
}
