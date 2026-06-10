import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  BillingService,
  PaymentService,
  PlanService,
  TrialService,
  QuotaService,
  RevenueOperationsService,
  CustomerHealthService,
  CommercialService,
  SubscriptionGovernanceService,
} from '@galaxy/billing';
import type {
  CreateBillingAccountInput,
  UpdateBillingAccountInput,
  CreatePlanInput,
  RecordPaymentInput,
} from '@galaxy/billing';

const ADMIN_SECRET = process.env.PLATFORM_ADMIN_SECRET ?? '';

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const provided = request.headers['x-admin-secret'];
  if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
    void reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export function billingV2Routes(fastify: FastifyInstance): void {
  // ── Billing Accounts (Workstream H) ──────────────────────────────────────

  fastify.post(
    '/billing/v2/accounts',
    async (request: FastifyRequest<{ Body: CreateBillingAccountInput }>, reply: FastifyReply) => {
      const svc = new BillingService(fastify.pg);
      const account = await svc.createBillingAccount(request.body);
      return reply.status(201).send({ account });
    },
  );

  fastify.get(
    '/billing/v2/accounts/:orgId',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      const svc = new BillingService(fastify.pg);
      const account = await svc.getBillingAccount(request.params.orgId);
      if (!account) return reply.status(404).send({ error: 'Billing account not found' });
      return reply.send({ account });
    },
  );

  fastify.patch(
    '/billing/v2/accounts/:orgId',
    async (
      request: FastifyRequest<{ Params: { orgId: string }; Body: UpdateBillingAccountInput }>,
      reply: FastifyReply,
    ) => {
      const svc = new BillingService(fastify.pg);
      const account = await svc.updateBillingAccount(request.params.orgId, request.body);
      if (!account) return reply.status(404).send({ error: 'Billing account not found' });
      return reply.send({ account });
    },
  );

  // ── Payments (Workstream H) ───────────────────────────────────────────────

  fastify.post(
    '/billing/v2/payments',
    async (request: FastifyRequest<{ Body: RecordPaymentInput }>, reply: FastifyReply) => {
      const svc = new PaymentService(fastify.pg);
      const payment = await svc.recordPayment(request.body);
      return reply.status(201).send({ payment });
    },
  );

  fastify.get(
    '/billing/v2/organizations/:orgId/payments',
    async (
      request: FastifyRequest<{ Params: { orgId: string }; Querystring: { limit?: string; offset?: string } }>,
      reply: FastifyReply,
    ) => {
      const svc = new PaymentService(fastify.pg);
      const payments = await svc.listPayments({
        organizationId: request.params.orgId,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : 50,
        offset: request.query.offset ? parseInt(request.query.offset, 10) : 0,
      });
      return reply.send({ payments });
    },
  );

  // ── Plans (Workstream I) ──────────────────────────────────────────────────

  fastify.get('/billing/v2/plans', async (_request: FastifyRequest, reply: FastifyReply) => {
    const svc = new PlanService(fastify.pg);
    const plans = await svc.listPlans();
    return reply.send({ plans });
  });

  fastify.post(
    '/billing/v2/plans',
    async (request: FastifyRequest<{ Body: CreatePlanInput }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new PlanService(fastify.pg);
      const plan = await svc.createPlan(request.body);
      return reply.status(201).send({ plan });
    },
  );

  fastify.delete(
    '/billing/v2/plans/:planId',
    async (request: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new PlanService(fastify.pg);
      const ok = await svc.deactivatePlan(request.params.planId);
      return reply.send({ ok });
    },
  );

  // ── Trials (Workstream I) ─────────────────────────────────────────────────

  fastify.post(
    '/billing/v2/organizations/:orgId/trials',
    async (
      request: FastifyRequest<{ Params: { orgId: string }; Body: { planId: string; trialDays?: number } }>,
      reply: FastifyReply,
    ) => {
      const svc = new TrialService(fastify.pg);
      const trial = await svc.startTrial(request.params.orgId, request.body.planId, request.body.trialDays);
      return reply.status(201).send({ trial });
    },
  );

  fastify.get(
    '/billing/v2/organizations/:orgId/trials',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      const svc = new TrialService(fastify.pg);
      const trial = await svc.getTrialStatus(request.params.orgId);
      if (!trial) return reply.status(404).send({ error: 'No trial found' });
      return reply.send({ trial });
    },
  );

  fastify.post(
    '/billing/v2/organizations/:orgId/trials/convert',
    async (
      request: FastifyRequest<{ Params: { orgId: string }; Body: { planId: string } }>,
      reply: FastifyReply,
    ) => {
      const svc = new TrialService(fastify.pg);
      const subscription = await svc.convertTrialToPaid(request.params.orgId, request.body.planId);
      return reply.send({ subscription });
    },
  );

  // ── Usage & Quota (Workstream J) ──────────────────────────────────────────

  fastify.get(
    '/billing/v2/organizations/:orgId/quota/:eventType',
    async (
      request: FastifyRequest<{ Params: { orgId: string; eventType: string } }>,
      reply: FastifyReply,
    ) => {
      const svc = new QuotaService(fastify.pg);
      const quota = await svc.checkQuota(request.params.orgId, request.params.eventType as Parameters<QuotaService['checkQuota']>[1]);
      return reply.send({ quota });
    },
  );

  fastify.get(
    '/billing/v2/organizations/:orgId/usage-alerts',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      const svc = new QuotaService(fastify.pg);
      const alerts = await svc.getAlerts(request.params.orgId);
      return reply.send({ alerts });
    },
  );

  // ── Revenue Operations (Workstream K) ────────────────────────────────────

  fastify.get(
    '/billing/v2/revenue/metrics',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new RevenueOperationsService(fastify.pg);
      const metrics = await svc.getRevenueMetrics();
      return reply.send({ metrics });
    },
  );

  fastify.get(
    '/billing/v2/organizations/:orgId/health',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      const svc = new CustomerHealthService(fastify.pg);
      const health = await svc.computeHealth(request.params.orgId);
      return reply.send({ health });
    },
  );

  // ── Commercial (Workstream L) ────────────────────────────────────────────

  fastify.get('/billing/v2/pricing', async (_request: FastifyRequest, reply: FastifyReply) => {
    const svc = new CommercialService(fastify.pg);
    const pricing = await svc.getPricingConfig();
    return reply.send({ pricing });
  });

  fastify.get(
    '/billing/v2/policies/:key',
    async (request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new CommercialService(fastify.pg);
      const policy = await svc.getBillingPolicy(request.params.key);
      if (!policy) return reply.status(404).send({ error: 'Policy not found' });
      return reply.send({ policy });
    },
  );

  fastify.put(
    '/billing/v2/policies/:key',
    async (
      request: FastifyRequest<{ Params: { key: string }; Body: { value: unknown; description?: string } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new CommercialService(fastify.pg);
      const policy = await svc.setBillingPolicy(request.params.key, request.body.value, request.body.description);
      return reply.send({ policy });
    },
  );

  fastify.post(
    '/billing/v2/organizations/:orgId/governance/renew',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new SubscriptionGovernanceService(fastify.pg);
      const subscriptions = await svc.enforceRenewal(request.params.orgId);
      return reply.send({ subscriptions, renewed: subscriptions.length });
    },
  );

  fastify.get(
    '/billing/v2/organizations/:orgId/enterprise-access/:feature',
    async (
      request: FastifyRequest<{ Params: { orgId: string; feature: string } }>,
      reply: FastifyReply,
    ) => {
      const svc = new SubscriptionGovernanceService(fastify.pg);
      const hasAccess = await svc.validateEnterpriseAccess(request.params.orgId, request.params.feature);
      return reply.send({ hasAccess });
    },
  );
}
