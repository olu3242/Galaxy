import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  SubscriptionService,
  InvoiceService,
  UsageMeteringService,
  PlanLimitsService,
} from '@galaxy/billing';
import type { CreateSubscriptionInput, RecordUsageInput } from '@galaxy/billing';

export async function billingRoutes(fastify: FastifyInstance): Promise<void> {
  // List available plans
  fastify.get('/billing/plans', async (_request: FastifyRequest, reply: FastifyReply) => {
    const service = new SubscriptionService(fastify.pg);
    const plans = await service.listPlans();
    return reply.send({ plans });
  });

  // Get current subscription for org
  fastify.get(
    '/billing/organizations/:orgId/subscription',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.params;
      const service = new SubscriptionService(fastify.pg);
      const subscription = await service.getSubscription(orgId);
      if (!subscription) {
        return reply.status(404).send({ error: 'No active subscription found' });
      }
      return reply.send({ subscription });
    },
  );

  // Create subscription
  fastify.post(
    '/billing/organizations/:orgId/subscription',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Body: { planId: string; trialEnd?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId } = request.params;
      const body = request.body;
      const service = new SubscriptionService(fastify.pg);

      const input: CreateSubscriptionInput = {
        organizationId: orgId,
        planId: body.planId,
        ...(body.trialEnd !== undefined ? { trialEnd: body.trialEnd } : {}),
      };

      const subscription = await service.createSubscription(input);
      return reply.status(201).send({ subscription });
    },
  );

  // Upgrade subscription
  fastify.put(
    '/billing/organizations/:orgId/subscription/:subscriptionId/upgrade',
    async (
      request: FastifyRequest<{
        Params: { orgId: string; subscriptionId: string };
        Body: { planId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, subscriptionId } = request.params;
      const { planId } = request.body;
      const service = new SubscriptionService(fastify.pg);
      const subscription = await service.upgradeSubscription(orgId, subscriptionId, planId);
      return reply.send({ subscription });
    },
  );

  // Downgrade subscription
  fastify.put(
    '/billing/organizations/:orgId/subscription/:subscriptionId/downgrade',
    async (
      request: FastifyRequest<{
        Params: { orgId: string; subscriptionId: string };
        Body: { planId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, subscriptionId } = request.params;
      const { planId } = request.body;
      const service = new SubscriptionService(fastify.pg);
      const subscription = await service.downgradeSubscription(orgId, subscriptionId, planId);
      return reply.send({ subscription });
    },
  );

  // Cancel subscription
  fastify.delete(
    '/billing/organizations/:orgId/subscription/:subscriptionId',
    async (
      request: FastifyRequest<{ Params: { orgId: string; subscriptionId: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, subscriptionId } = request.params;
      const service = new SubscriptionService(fastify.pg);
      const subscription = await service.cancelSubscription(orgId, subscriptionId);
      return reply.send({ subscription });
    },
  );

  // List invoices
  fastify.get(
    '/billing/organizations/:orgId/invoices',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Querystring: { limit?: string; offset?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId } = request.params;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
      const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;
      const service = new InvoiceService(fastify.pg);
      const invoices = await service.listByOrg(orgId, limit, offset);
      return reply.send({ invoices });
    },
  );

  // Get invoice
  fastify.get(
    '/billing/organizations/:orgId/invoices/:invoiceId',
    async (
      request: FastifyRequest<{ Params: { orgId: string; invoiceId: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, invoiceId } = request.params;
      const service = new InvoiceService(fastify.pg);
      const invoice = await service.getInvoice(orgId, invoiceId);
      if (!invoice) {
        return reply.status(404).send({ error: 'Invoice not found' });
      }
      return reply.send({ invoice });
    },
  );

  // Mark invoice paid
  fastify.post(
    '/billing/organizations/:orgId/invoices/:invoiceId/pay',
    async (
      request: FastifyRequest<{ Params: { orgId: string; invoiceId: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, invoiceId } = request.params;
      const service = new InvoiceService(fastify.pg);
      const invoice = await service.markPaid(orgId, invoiceId);
      return reply.send({ invoice });
    },
  );

  // Get usage summary
  fastify.get(
    '/billing/organizations/:orgId/usage',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Querystring: {
          subscriptionId: string;
          periodStart: string;
          periodEnd: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId } = request.params;
      const { subscriptionId, periodStart, periodEnd } = request.query;

      if (!subscriptionId || !periodStart || !periodEnd) {
        return reply
          .status(400)
          .send({ error: 'subscriptionId, periodStart, and periodEnd are required' });
      }

      const service = new UsageMeteringService(fastify.pg);
      const summary = await service.getUsageSummary(orgId, subscriptionId, {
        start: periodStart,
        end: periodEnd,
      });
      return reply.send({ summary });
    },
  );

  // Record usage event
  fastify.post(
    '/billing/organizations/:orgId/usage',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Body: RecordUsageInput;
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId } = request.params;
      const service = new UsageMeteringService(fastify.pg);
      const event = await service.recordUsage({ ...request.body, organizationId: orgId });
      return reply.status(201).send({ event });
    },
  );

  // Check plan limits
  fastify.get(
    '/billing/organizations/:orgId/limits',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.params;
      const service = new PlanLimitsService(fastify.pg);
      const limits = await service.getPlanLimits(orgId);
      return reply.send({ limits });
    },
  );

  // Check specific limit
  fastify.get(
    '/billing/organizations/:orgId/limits/:resource',
    async (
      request: FastifyRequest<{
        Params: { orgId: string; resource: string };
        Querystring: { subscriptionId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, resource } = request.params;
      const service = new PlanLimitsService(fastify.pg);

      let result;
      if (resource === 'members') {
        result = await service.checkMemberLimit(orgId);
      } else if (resource === 'workflows') {
        result = await service.checkWorkflowLimit(orgId);
      } else if (resource === 'agents') {
        result = await service.checkAgentLimit(orgId);
      } else if (resource === 'api_calls') {
        const subscriptionId = request.query.subscriptionId;
        if (!subscriptionId) {
          return reply
            .status(400)
            .send({ error: 'subscriptionId is required for api_calls check' });
        }
        result = await service.checkApiCallLimit(orgId, subscriptionId);
      } else {
        return reply.status(400).send({ error: 'Unknown resource type' });
      }

      return reply.send({ result });
    },
  );
}
