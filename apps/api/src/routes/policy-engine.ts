import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  PolicyService,
  PolicyRuleService,
  PolicyEnforcementService,
  type PolicyEnforcementMode,
  type PolicyRuleOperator,
} from '@galaxy/policy-engine';

export async function policyEngineRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /policies
  fastify.post(
    '/policies',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          name: string;
          description?: string;
          enforcementMode: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, name, description, enforcementMode } = request.body;
      const svc = new PolicyService(fastify.pg);
      const policy = await svc.createPolicy(
        orgId,
        name,
        description,
        enforcementMode as PolicyEnforcementMode,
      );
      return reply.status(201).send(policy);
    },
  );

  // GET /policies
  fastify.get(
    '/policies',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const svc = new PolicyService(fastify.pg);
      const policies = await svc.listPolicies(orgId);
      return reply.send(policies);
    },
  );

  // GET /policies/:policyId
  fastify.get(
    '/policies/:policyId',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Querystring: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { orgId } = request.query;
      const svc = new PolicyService(fastify.pg);
      const policy = await svc.getPolicy(orgId, policyId);
      return reply.send(policy);
    },
  );

  // POST /policies/:policyId/activate
  fastify.post(
    '/policies/:policyId/activate',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Body: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { orgId } = request.body;
      const svc = new PolicyService(fastify.pg);
      const policy = await svc.activatePolicy(orgId, policyId);
      return reply.send(policy);
    },
  );

  // POST /policies/:policyId/deactivate
  fastify.post(
    '/policies/:policyId/deactivate',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Body: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { orgId } = request.body;
      const svc = new PolicyService(fastify.pg);
      const policy = await svc.deactivatePolicy(orgId, policyId);
      return reply.send(policy);
    },
  );

  // POST /policies/:policyId/rules
  fastify.post(
    '/policies/:policyId/rules',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Body: {
          orgId: string;
          field: string;
          operator: string;
          value: unknown;
          action: string;
          priority?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { orgId, field, operator, value, action, priority } = request.body;
      const svc = new PolicyRuleService(fastify.pg);
      const rule = await svc.addRule(
        orgId,
        policyId,
        field,
        operator as PolicyRuleOperator,
        value,
        action,
        priority,
      );
      return reply.status(201).send(rule);
    },
  );

  // GET /policies/:policyId/rules
  fastify.get(
    '/policies/:policyId/rules',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Querystring: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { orgId } = request.query;
      const svc = new PolicyRuleService(fastify.pg);
      const rules = await svc.getRules(orgId, policyId);
      return reply.send(rules);
    },
  );

  // DELETE /policies/rules/:ruleId
  fastify.delete(
    '/policies/rules/:ruleId',
    async (
      request: FastifyRequest<{
        Params: { ruleId: string };
        Querystring: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { ruleId } = request.params;
      const { orgId } = request.query;
      const svc = new PolicyRuleService(fastify.pg);
      await svc.deleteRule(orgId, ruleId);
      return reply.status(204).send();
    },
  );

  // POST /policies/:policyId/evaluate
  fastify.post(
    '/policies/:policyId/evaluate',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Body: {
          orgId: string;
          resourceType: string;
          resourceId: string;
          context: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { orgId, resourceType, resourceId, context } = request.body;
      const svc = new PolicyEnforcementService(fastify.pg);
      const result = await svc.evaluate(orgId, policyId, resourceType, resourceId, context);
      return reply.send(result);
    },
  );

  // GET /policies/:policyId/enforcement-log
  fastify.get(
    '/policies/:policyId/enforcement-log',
    async (
      request: FastifyRequest<{
        Params: { policyId: string };
        Querystring: { orgId: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { policyId } = request.params;
      const { orgId, limit } = request.query;
      const svc = new PolicyEnforcementService(fastify.pg);
      const logs = await svc.getEnforcementLog(
        orgId,
        policyId,
        limit !== undefined ? parseInt(limit, 10) : undefined,
      );
      return reply.send(logs);
    },
  );
}
