import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  PlatformAdminService,
  TenantOperationsService,
  OrganizationLifecycleService,
  ReadinessScoringService,
  FeatureFlagService,
  ConfigurationService,
  BillingService,
  InvoiceService,
  SubscriptionService,
  PlanService,
  UsageMeteringService,
  QuotaService,
  RevenueOperationsService,
  CustomerHealthService,
  MetricsService,
} from '@galaxy/platform';
import type { TenantStatus, SubscriptionStatus, InvoiceStatus } from '@galaxy/platform';

export function platformRoutes(fastify: FastifyInstance): void {
  // ── Admin Metrics ────────────────────────────────────────────────────────────

  fastify.post(
    '/platform/admin/metrics',
    async (
      request: FastifyRequest<{
        Body: { metricName: string; value: number; labels?: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ) => {
      const { metricName, value, labels } = request.body;
      if (!metricName) {
        return reply.status(400).send({ error: 'metricName and value required' });
      }
      const svc = new PlatformAdminService(fastify.pg);
      const metric = await svc.recordMetric({
        metricName,
        value,
        ...(labels !== undefined ? { labels } : {}),
      });
      return reply.status(201).send({ metric });
    },
  );

  fastify.get(
    '/platform/admin/metrics',
    async (
      request: FastifyRequest<{ Querystring: { metricName?: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const { metricName, limit } = request.query;
      const svc = new MetricsService(fastify.pg);
      const metrics = await svc.query({
        ...(metricName !== undefined ? { metricName } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
      return reply.send({ metrics });
    },
  );

  // ── Tenants ──────────────────────────────────────────────────────────────────

  fastify.get(
    '/platform/tenants',
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { status, limit, offset } = request.query;
      const svc = new TenantOperationsService(fastify.pg);
      const tenants = await svc.listTenants({
        ...(status !== undefined ? { status: status as TenantStatus } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
        ...(offset !== undefined ? { offset: parseInt(offset, 10) } : {}),
      });
      return reply.send({ tenants });
    },
  );

  fastify.post(
    '/platform/tenants',
    async (
      request: FastifyRequest<{ Body: { name: string; status?: string } }>,
      reply: FastifyReply,
    ) => {
      const { name, status } = request.body;
      if (!name) return reply.status(400).send({ error: 'name required' });
      const svc = new TenantOperationsService(fastify.pg);
      const tenant = await svc.createTenant({
        name,
        ...(status !== undefined ? { status: status as TenantStatus } : {}),
      });
      return reply.status(201).send({ tenant });
    },
  );

  fastify.get(
    '/platform/tenants/:tenantId',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      const svc = new TenantOperationsService(fastify.pg);
      const tenant = await svc.getTenant(request.params.tenantId);
      if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
      return reply.send({ tenant });
    },
  );

  // ── Lifecycle Events ─────────────────────────────────────────────────────────

  fastify.post(
    '/platform/lifecycle/events',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          eventType: string;
          metadata?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, eventType, metadata } = request.body;
      if (!organizationId || !eventType) {
        return reply.status(400).send({ error: 'organizationId and eventType required' });
      }
      const svc = new OrganizationLifecycleService(fastify.pg);
      const event = await svc.recordEvent({
        organizationId,
        eventType: eventType as Parameters<typeof svc.recordEvent>[0]['eventType'],
        ...(metadata !== undefined ? { metadata } : {}),
      });
      return reply.status(201).send({ event });
    },
  );

  fastify.get(
    '/platform/lifecycle/events',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, limit } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const svc = new OrganizationLifecycleService(fastify.pg);
      const events = await svc.listEvents(organizationId, {
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
      return reply.send({ events });
    },
  );

  fastify.post(
    '/platform/lifecycle/readiness',
    async (request: FastifyRequest<{ Body: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const svc = new ReadinessScoringService(fastify.pg);
      const score = await svc.calculateReadiness(organizationId);
      return reply.status(201).send({ score });
    },
  );

  // ── Feature Flags ────────────────────────────────────────────────────────────

  fastify.get('/platform/features', async (_request: FastifyRequest, reply: FastifyReply) => {
    const svc = new FeatureFlagService(fastify.pg);
    const flags = await svc.listFlags();
    return reply.send({ flags });
  });

  fastify.post(
    '/platform/features',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          enabled?: boolean;
          rolloutPercentage?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { name, description, enabled, rolloutPercentage } = request.body;
      if (!name) return reply.status(400).send({ error: 'name required' });
      const svc = new FeatureFlagService(fastify.pg);
      const flag = await svc.createFlag({
        name,
        ...(description !== undefined ? { description } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(rolloutPercentage !== undefined ? { rolloutPercentage } : {}),
      });
      return reply.status(201).send({ flag });
    },
  );

  fastify.patch(
    '/platform/features/:featureId',
    async (
      request: FastifyRequest<{
        Params: { featureId: string };
        Body: { enabled: boolean };
      }>,
      reply: FastifyReply,
    ) => {
      const { featureId } = request.params;
      const { enabled } = request.body;
      if (typeof enabled !== 'boolean')
        return reply.status(400).send({ error: 'enabled required' });
      const svc = new FeatureFlagService(fastify.pg);
      const flag = await svc.toggleFlag(featureId, enabled);
      if (!flag) return reply.status(404).send({ error: 'Feature flag not found' });
      return reply.send({ flag });
    },
  );

  fastify.get(
    '/platform/features/entitlements',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const svc = new FeatureFlagService(fastify.pg);
      const entitlements = await svc.getEntitlements(organizationId);
      return reply.send({ entitlements });
    },
  );

  // ── Configuration ────────────────────────────────────────────────────────────

  fastify.post(
    '/platform/config',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          namespace: string;
          key: string;
          value: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, namespace, key, value } = request.body;
      if (!organizationId || !namespace || !key || !value) {
        return reply.status(400).send({ error: 'organizationId, namespace, key, value required' });
      }
      const svc = new ConfigurationService(fastify.pg);
      const config = await svc.set({ organizationId, namespace, key, value });
      return reply.status(201).send({ config });
    },
  );

  fastify.get(
    '/platform/config',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; namespace?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, namespace } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const svc = new ConfigurationService(fastify.pg);
      const configs =
        namespace !== undefined
          ? await svc.listNamespace(organizationId, namespace)
          : await svc.listAll(organizationId);
      return reply.send({ configs });
    },
  );

  // ── Billing Accounts ─────────────────────────────────────────────────────────

  fastify.post(
    '/platform/billing/accounts',
    async (
      request: FastifyRequest<{ Body: { organizationId: string; currency?: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, currency } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const svc = new BillingService(fastify.pg);
      const account = await svc.createAccount({
        organizationId,
        ...(currency !== undefined ? { currency } : {}),
      });
      return reply.status(201).send({ account });
    },
  );

  fastify.get(
    '/platform/billing/accounts',
    async (
      request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>,
      reply: FastifyReply,
    ) => {
      const { limit, offset } = request.query;
      const svc = new BillingService(fastify.pg);
      const accounts = await svc.listAccounts({
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
        ...(offset !== undefined ? { offset: parseInt(offset, 10) } : {}),
      });
      return reply.send({ accounts });
    },
  );

  // ── Invoices ─────────────────────────────────────────────────────────────────

  fastify.post(
    '/platform/billing/invoices',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          amountCents: number;
          currency?: string;
          dueDate?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, amountCents, currency, dueDate } = request.body;
      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId and amountCents required' });
      }
      const svc = new InvoiceService(fastify.pg);
      const invoice = await svc.createInvoice({
        organizationId,
        amountCents,
        ...(currency !== undefined ? { currency } : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
      });
      return reply.status(201).send({ invoice });
    },
  );

  fastify.get(
    '/platform/billing/invoices',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; status?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, status, limit } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const svc = new InvoiceService(fastify.pg);
      const invoices = await svc.listInvoices(organizationId, {
        ...(status !== undefined ? { status: status as InvoiceStatus } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
      return reply.send({ invoices });
    },
  );

  // ── Subscriptions ────────────────────────────────────────────────────────────

  fastify.post(
    '/platform/subscriptions',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          planId: string;
          status?: string;
          trialEndsAt?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, planId, status, trialEndsAt } = request.body;
      if (!organizationId || !planId) {
        return reply.status(400).send({ error: 'organizationId and planId required' });
      }
      const svc = new SubscriptionService(fastify.pg);
      const subscription = await svc.createSubscription({
        organizationId,
        planId,
        ...(status !== undefined ? { status: status as SubscriptionStatus } : {}),
        ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
      });
      return reply.status(201).send({ subscription });
    },
  );

  fastify.get(
    '/platform/subscriptions',
    async (
      request: FastifyRequest<{ Querystring: { status?: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const { status, limit } = request.query;
      const svc = new SubscriptionService(fastify.pg);
      const subscriptions = await svc.listSubscriptions({
        ...(status !== undefined ? { status: status as SubscriptionStatus } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
      return reply.send({ subscriptions });
    },
  );

  fastify.patch(
    '/platform/subscriptions/:subscriptionId',
    async (
      request: FastifyRequest<{
        Params: { subscriptionId: string };
        Body: { status: string; organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { subscriptionId } = request.params;
      const { status, organizationId } = request.body;
      if (!status || !organizationId) {
        return reply.status(400).send({ error: 'status and organizationId required' });
      }
      const svc = new SubscriptionService(fastify.pg);
      const subscription = await svc.updateStatus(
        subscriptionId,
        status as SubscriptionStatus,
        organizationId,
      );
      if (!subscription) return reply.status(404).send({ error: 'Subscription not found' });
      return reply.send({ subscription });
    },
  );

  // ── Plans ────────────────────────────────────────────────────────────────────

  fastify.get('/platform/plans', async (_request: FastifyRequest, reply: FastifyReply) => {
    const svc = new PlanService(fastify.pg);
    const plans = await svc.listPlans();
    return reply.send({ plans });
  });

  // ── Usage Events ─────────────────────────────────────────────────────────────

  fastify.post(
    '/platform/usage/events',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          resourceType: string;
          quantity: number;
          metadata?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, resourceType, quantity, metadata } = request.body;
      if (!organizationId || !resourceType) {
        return reply
          .status(400)
          .send({ error: 'organizationId, resourceType and quantity required' });
      }
      const svc = new UsageMeteringService(fastify.pg);
      const event = await svc.recordEvent({
        organizationId,
        resourceType,
        quantity,
        ...(metadata !== undefined ? { metadata } : {}),
      });
      return reply.status(201).send({ event });
    },
  );

  fastify.get(
    '/platform/usage/records',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; resourceType?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, resourceType, limit } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const svc = new UsageMeteringService(fastify.pg);
      const records = await svc.getUsageRecords(organizationId, {
        ...(resourceType !== undefined ? { resourceType } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
      return reply.send({ records });
    },
  );

  fastify.get(
    '/platform/usage/limits',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const svc = new QuotaService(fastify.pg);
      const limits = await svc.getLimits(organizationId);
      return reply.send({ limits });
    },
  );

  // ── Revenue Snapshots ────────────────────────────────────────────────────────

  fastify.post(
    '/platform/revenue/snapshots',
    async (
      request: FastifyRequest<{
        Body: {
          mrrCents: number;
          arrCents: number;
          activeSubscriptions: number;
          churnedThisMonth: number;
          newThisMonth: number;
          snapshotDate?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const {
        mrrCents,
        arrCents,
        activeSubscriptions,
        churnedThisMonth,
        newThisMonth,
        snapshotDate,
      } = request.body;
      const svc = new RevenueOperationsService(fastify.pg);
      const snapshot = await svc.recordSnapshot({
        mrrCents,
        arrCents,
        activeSubscriptions,
        churnedThisMonth,
        newThisMonth,
        ...(snapshotDate !== undefined ? { snapshotDate } : {}),
      });
      return reply.status(201).send({ snapshot });
    },
  );

  fastify.get(
    '/platform/revenue/snapshots',
    async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
      const { limit } = request.query;
      const svc = new RevenueOperationsService(fastify.pg);
      const snapshots = await svc.listSnapshots({
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
      return reply.send({ snapshots });
    },
  );

  // ── Customer Health ──────────────────────────────────────────────────────────

  fastify.get(
    '/platform/health/customer',
    async (
      request: FastifyRequest<{ Querystring: { organizationId?: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, limit } = request.query;
      const svc = new CustomerHealthService(fastify.pg);

      if (organizationId !== undefined) {
        const score = await svc.getLatestScore(organizationId);
        return reply.send({ score });
      }

      const scores = await svc.listHealthScores({
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
      return reply.send({ scores });
    },
  );
}
