import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  PlatformAdminService,
  PlatformDashboardService,
  TenantOperationsService,
  OrganizationLifecycleService,
  ReadinessScoringService,
  EntitlementService,
  ConfigurationService,
  MetricsService,
  PlatformHealthService,
  AuditService,
  SupportService,
} from '@galaxy/platform-admin';
import type { TenantLifecycleStatus, ConfigScope, TicketStatus, TicketPriority } from '@galaxy/platform-admin';

const ADMIN_SECRET = process.env.PLATFORM_ADMIN_SECRET ?? '';

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const provided = request.headers['x-admin-secret'];
  if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
    void reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export function platformAdminV2Routes(fastify: FastifyInstance): void {
  // ── Platform Dashboard (Workstream A) ──────────────────────────────────────

  fastify.get('/admin/v2/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;
    const svc = new PlatformDashboardService(fastify.pg);
    const metrics = await svc.getAggregateMetrics();
    return reply.send({ metrics });
  });

  fastify.get('/admin/v2/health', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;
    const svc = new PlatformAdminService(fastify.pg);
    const health = await svc.getPlatformHealthSummary();
    return reply.send({ health });
  });

  fastify.get(
    '/admin/v2/orgs',
    async (
      request: FastifyRequest<{ Querystring: { status?: string; limit?: string; offset?: string } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new PlatformAdminService(fastify.pg);
      const orgs = await svc.getOrgDirectory({
        status: request.query.status as TenantLifecycleStatus | undefined,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
        offset: request.query.offset ? parseInt(request.query.offset, 10) : undefined,
      });
      return reply.send({ orgs });
    },
  );

  fastify.get(
    '/admin/v2/users',
    async (
      request: FastifyRequest<{ Querystring: { organizationId?: string; limit?: string; offset?: string } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new PlatformAdminService(fastify.pg);
      const users = await svc.getUserDirectory({
        organizationId: request.query.organizationId,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
        offset: request.query.offset ? parseInt(request.query.offset, 10) : undefined,
      });
      return reply.send({ users });
    },
  );

  // ── Tenant Operations (Workstream B) ──────────────────────────────────────

  fastify.post(
    '/admin/v2/tenants',
    async (
      request: FastifyRequest<{ Body: { name: string; slug: string; plan: string; adminEmail: string } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new TenantOperationsService(fastify.pg);
      const tenant = await svc.createTenant(request.body);
      return reply.status(201).send({ tenant });
    },
  );

  fastify.post(
    '/admin/v2/tenants/:orgId/provision',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new TenantOperationsService(fastify.pg);
      const tenant = await svc.provisionTenant(request.params.orgId);
      return reply.send({ tenant });
    },
  );

  fastify.post(
    '/admin/v2/tenants/:orgId/activate',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new TenantOperationsService(fastify.pg);
      const tenant = await svc.activateTenant(request.params.orgId);
      return reply.send({ tenant });
    },
  );

  fastify.post(
    '/admin/v2/tenants/:orgId/suspend',
    async (
      request: FastifyRequest<{ Params: { orgId: string }; Body: { reason: string } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new TenantOperationsService(fastify.pg);
      const tenant = await svc.suspendTenant(request.params.orgId, request.body.reason);
      return reply.send({ tenant });
    },
  );

  fastify.post(
    '/admin/v2/tenants/:orgId/reactivate',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new TenantOperationsService(fastify.pg);
      const tenant = await svc.reactivateTenant(request.params.orgId);
      return reply.send({ tenant });
    },
  );

  fastify.post(
    '/admin/v2/tenants/:orgId/archive',
    async (
      request: FastifyRequest<{ Params: { orgId: string }; Body: { reason: string } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new TenantOperationsService(fastify.pg);
      const tenant = await svc.archiveTenant(request.params.orgId, request.body.reason);
      return reply.send({ tenant });
    },
  );

  // ── Org Lifecycle (Workstream C) ──────────────────────────────────────────

  fastify.get(
    '/admin/v2/orgs/:orgId/lifecycle',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new OrganizationLifecycleService(fastify.pg);
      const state = await svc.getLifecycleState(request.params.orgId);
      return reply.send({ state });
    },
  );

  fastify.get(
    '/admin/v2/orgs/:orgId/readiness',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new ReadinessScoringService(fastify.pg);
      const score = await svc.computeScore(request.params.orgId);
      return reply.send({ score });
    },
  );

  fastify.post(
    '/admin/v2/orgs/:orgId/onboarding/start',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new OrganizationLifecycleService(fastify.pg);
      await svc.startOnboarding(request.params.orgId);
      return reply.send({ ok: true });
    },
  );

  fastify.post(
    '/admin/v2/orgs/:orgId/onboarding/complete',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new OrganizationLifecycleService(fastify.pg);
      await svc.completeOnboarding(request.params.orgId);
      return reply.send({ ok: true });
    },
  );

  // ── Feature Management (Workstream D) ────────────────────────────────────

  fastify.get(
    '/admin/v2/entitlements/:planTier',
    async (request: FastifyRequest<{ Params: { planTier: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new EntitlementService(fastify.pg);
      const entitlements = await svc.getEntitlementsForPlan(request.params.planTier);
      return reply.send({ entitlements });
    },
  );

  fastify.post(
    '/admin/v2/entitlements',
    async (
      request: FastifyRequest<{
        Body: { planTier: string; featureKey: string; isEnabled: boolean; config?: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new EntitlementService(fastify.pg);
      const { planTier, featureKey, isEnabled, config } = request.body;
      const entitlement = await svc.upsertEntitlement(planTier, featureKey, isEnabled, config);
      return reply.send({ entitlement });
    },
  );

  fastify.post(
    '/admin/v2/orgs/:orgId/feature-overrides',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Body: { featureKey: string; isEnabled: boolean; reason?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new EntitlementService(fastify.pg);
      const { featureKey, isEnabled, reason } = request.body;
      const override = await svc.setOrgOverride(request.params.orgId, featureKey, isEnabled, reason);
      return reply.send({ override });
    },
  );

  // ── Configuration (Workstream E) ──────────────────────────────────────────

  fastify.get(
    '/admin/v2/orgs/:orgId/config',
    async (
      request: FastifyRequest<{ Params: { orgId: string }; Querystring: { scope?: string } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new ConfigurationService(fastify.pg);
      const configs = await svc.listConfigs(request.params.orgId, request.query.scope as ConfigScope | undefined);
      return reply.send({ configs });
    },
  );

  fastify.put(
    '/admin/v2/orgs/:orgId/config/:scope/:key',
    async (
      request: FastifyRequest<{
        Params: { orgId: string; scope: string; key: string };
        Body: { value: unknown; updatedBy: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new ConfigurationService(fastify.pg);
      const config = await svc.setConfig(
        request.params.orgId,
        request.params.scope as ConfigScope,
        request.params.key,
        request.body.value,
        request.body.updatedBy,
      );
      return reply.send({ config });
    },
  );

  // ── Observability (Workstream F) ──────────────────────────────────────────

  fastify.get(
    '/admin/v2/metrics/platform',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new MetricsService(fastify.pg);
      const metrics = await svc.getPlatformMetrics();
      return reply.send({ metrics });
    },
  );

  fastify.get(
    '/admin/v2/metrics/tenant/:orgId',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new MetricsService(fastify.pg);
      const metrics = await svc.getTenantMetrics(request.params.orgId);
      return reply.send({ metrics });
    },
  );

  fastify.get(
    '/admin/v2/health-checks',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new PlatformHealthService(fastify.pg);
      const report = await svc.runHealthChecks();
      return reply.send({ report });
    },
  );

  // ── Audit (Workstream G) ──────────────────────────────────────────────────

  fastify.get(
    '/admin/v2/audit-logs',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId?: string; actorId?: string; action?: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new AuditService(fastify.pg);
      const logs = await svc.queryLogs({
        organizationId: request.query.organizationId,
        actorId: request.query.actorId,
        action: request.query.action,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : 50,
        offset: request.query.offset ? parseInt(request.query.offset, 10) : 0,
      });
      return reply.send({ logs });
    },
  );

  // ── Support (Workstream G) ────────────────────────────────────────────────

  fastify.get(
    '/admin/v2/support/tickets',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId?: string; status?: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new SupportService(fastify.pg);
      const tickets = await svc.listTickets({
        organizationId: request.query.organizationId,
        status: request.query.status as TicketStatus | undefined,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : 50,
        offset: request.query.offset ? parseInt(request.query.offset, 10) : 0,
      });
      return reply.send({ tickets });
    },
  );

  fastify.post(
    '/admin/v2/support/tickets',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          submittedBy: string;
          subject: string;
          description: string;
          priority?: TicketPriority;
        };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new SupportService(fastify.pg);
      const ticket = await svc.createTicket(request.body);
      return reply.status(201).send({ ticket });
    },
  );

  fastify.patch(
    '/admin/v2/support/tickets/:ticketId/status',
    async (
      request: FastifyRequest<{ Params: { ticketId: string }; Body: { status: TicketStatus } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new SupportService(fastify.pg);
      const ticket = await svc.updateStatus(request.params.ticketId, request.body.status);
      if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
      return reply.send({ ticket });
    },
  );

  fastify.post(
    '/admin/v2/support/tickets/:ticketId/notes',
    async (
      request: FastifyRequest<{
        Params: { ticketId: string };
        Body: { authorId: string; content: string; isInternal?: boolean };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;
      const svc = new SupportService(fastify.pg);
      const note = await svc.addNote(
        request.params.ticketId,
        request.body.authorId,
        request.body.content,
        request.body.isInternal,
      );
      return reply.status(201).send({ note });
    },
  );
}
