import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  TenantAdminService,
  FeatureFlagService,
  SystemConfigService,
  AdminActionLogService,
} from '@galaxy/platform-admin';
import type { TenantStatus, AdminActionType, CreateFeatureFlagInput } from '@galaxy/platform-admin';

const ADMIN_SECRET = process.env.PLATFORM_ADMIN_SECRET ?? '';

function requireAdminSecret(request: FastifyRequest, reply: FastifyReply): boolean {
  const provided = request.headers['x-admin-secret'];
  if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
    void reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export function platformAdminRoutes(fastify: FastifyInstance): void {
  // ── Tenants ──────────────────────────────────────────────────────────────────

  fastify.get(
    '/admin/tenants',
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdminSecret(request, reply)) return;
      const { status, limit, offset } = request.query;
      const service = new TenantAdminService(fastify.pg);
      const tenants = await service.listAllTenants({
        ...(status !== undefined ? { status: status as TenantStatus } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
        ...(offset !== undefined ? { offset: parseInt(offset, 10) } : {}),
      });
      return reply.send({ tenants });
    },
  );

  fastify.get(
    '/admin/tenants/:orgId',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      if (!requireAdminSecret(request, reply)) return;
      const service = new TenantAdminService(fastify.pg);
      const tenant = await service.getTenant(request.params.orgId);
      if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
      return reply.send({ tenant });
    },
  );

  fastify.post(
    '/admin/tenants/:orgId/suspend',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Body: { adminId: string; reason?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdminSecret(request, reply)) return;
      const { orgId } = request.params;
      const { adminId } = request.body;
      if (!adminId) return reply.status(400).send({ error: 'adminId required' });

      const tenantService = new TenantAdminService(fastify.pg);
      const logService = new AdminActionLogService(fastify.pg);

      const tenant = await tenantService.suspendTenant(orgId);
      if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

      await logService.logAction({
        adminId,
        actionType: 'suspend_tenant',
        payload: { tenantId: orgId },
        ...(request.body.reason !== undefined ? { reason: request.body.reason } : {}),
        targetTenantId: orgId,
      });

      return reply.send({ tenant });
    },
  );

  fastify.post(
    '/admin/tenants/:orgId/reinstate',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Body: { adminId: string; reason?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdminSecret(request, reply)) return;
      const { orgId } = request.params;
      const { adminId } = request.body;
      if (!adminId) return reply.status(400).send({ error: 'adminId required' });

      const tenantService = new TenantAdminService(fastify.pg);
      const logService = new AdminActionLogService(fastify.pg);

      const tenant = await tenantService.reinstateTenant(orgId);
      if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

      await logService.logAction({
        adminId,
        actionType: 'reinstate_tenant',
        payload: { tenantId: orgId },
        ...(request.body.reason !== undefined ? { reason: request.body.reason } : {}),
        targetTenantId: orgId,
      });

      return reply.send({ tenant });
    },
  );

  // ── Feature flags ─────────────────────────────────────────────────────────────

  fastify.get(
    '/admin/feature-flags',
    async (
      request: FastifyRequest<{
        Querystring: { scope?: string; targetTenantId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdminSecret(request, reply)) return;
      const { scope, targetTenantId } = request.query;
      const service = new FeatureFlagService(fastify.pg);
      const flags = await service.listFlags({
        ...(scope !== undefined ? { scope } : {}),
        ...(targetTenantId !== undefined ? { targetTenantId } : {}),
      });
      return reply.send({ flags });
    },
  );

  fastify.post(
    '/admin/feature-flags',
    async (
      request: FastifyRequest<{ Body: CreateFeatureFlagInput & { adminId: string } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdminSecret(request, reply)) return;
      const { adminId, ...input } = request.body;
      if (!input.key) return reply.status(400).send({ error: 'key required' });

      const flagService = new FeatureFlagService(fastify.pg);
      const logService = new AdminActionLogService(fastify.pg);

      const flag = await flagService.createFlag(input);

      await logService.logAction({
        adminId,
        actionType: 'create_feature_flag',
        payload: { flagKey: input.key },
      });

      return reply.status(201).send({ flag });
    },
  );

  fastify.patch(
    '/admin/feature-flags/:name',
    async (
      request: FastifyRequest<{
        Params: { name: string };
        Body: { isEnabled: boolean; adminId: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdminSecret(request, reply)) return;
      const { name } = request.params;
      const { isEnabled, adminId } = request.body;
      if (typeof isEnabled !== 'boolean') {
        return reply.status(400).send({ error: 'isEnabled (boolean) required' });
      }

      const flagService = new FeatureFlagService(fastify.pg);
      const logService = new AdminActionLogService(fastify.pg);

      const existing = await flagService.getFlag(name);
      if (!existing) return reply.status(404).send({ error: 'Feature flag not found' });

      const flag = await flagService.toggleFlag(existing.id, isEnabled);
      if (!flag) return reply.status(404).send({ error: 'Feature flag not found' });

      await logService.logAction({
        adminId,
        actionType: 'toggle_feature_flag',
        payload: { flagKey: name, isEnabled },
      });

      return reply.send({ flag });
    },
  );

  // ── System config ─────────────────────────────────────────────────────────────

  fastify.get('/admin/config', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdminSecret(request, reply)) return;
    const service = new SystemConfigService(fastify.pg);
    const configs = await service.listConfigs();
    return reply.send({ configs });
  });

  fastify.put(
    '/admin/config/:key',
    async (
      request: FastifyRequest<{
        Params: { key: string };
        Body: { value: unknown; description?: string; updatedBy: string };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdminSecret(request, reply)) return;
      const { key } = request.params;
      const { value, updatedBy } = request.body;
      if (value === undefined || !updatedBy) {
        return reply.status(400).send({ error: 'value and updatedBy required' });
      }

      const configService = new SystemConfigService(fastify.pg);
      const logService = new AdminActionLogService(fastify.pg);

      const config = await configService.upsertConfig({
        key,
        value,
        updatedBy,
        ...(request.body.description !== undefined
          ? { description: request.body.description }
          : {}),
      });

      await logService.logAction({
        adminId: updatedBy,
        actionType: 'update_system_config',
        payload: { configKey: key },
      });

      return reply.send({ config });
    },
  );

  // ── Admin action logs ─────────────────────────────────────────────────────────

  fastify.get(
    '/admin/action-logs',
    async (
      request: FastifyRequest<{
        Querystring: {
          adminId?: string;
          actionType?: string;
          targetTenantId?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdminSecret(request, reply)) return;
      const { adminId, actionType, targetTenantId, limit } = request.query;
      const service = new AdminActionLogService(fastify.pg);
      const logs = await service.listActions({
        ...(adminId !== undefined ? { adminId } : {}),
        ...(actionType !== undefined ? { actionType: actionType as AdminActionType } : {}),
        ...(targetTenantId !== undefined ? { targetTenantId } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
      return reply.send({ logs });
    },
  );
}
