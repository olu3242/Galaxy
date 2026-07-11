import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export type AbacAction =
  | 'read'
  | 'write'
  | 'delete'
  | 'approve'
  | 'escalate'
  | 'admin'
  | 'trigger_workflow';

export type AbacResource =
  | 'workflow'
  | 'member'
  | 'department'
  | 'team'
  | 'broadcast'
  | 'knowledge'
  | 'loop'
  | 'analytics'
  | 'audit'
  | 'agent'
  | 'organization';

export interface AbacContext {
  actorId: string;
  organizationId: string;
  action: AbacAction;
  resource: AbacResource;
  resourceOwnerId?: string;
  resourceDepartmentId?: string;
  attributes?: Record<string, unknown>;
}

interface PermissionRow {
  permission_name: string;
}

interface MemberRow {
  department_id: string | null;
  team_id: string | null;
}

const PERMISSION_MAP: Record<AbacResource, Record<AbacAction, string>> = {
  workflow: {
    read: 'workflow:read',
    write: 'workflow:write',
    delete: 'workflow:delete',
    approve: 'workflow:approve',
    escalate: 'workflow:escalate',
    admin: 'workflow:admin',
    trigger_workflow: 'workflow:trigger',
  },
  member: {
    read: 'member:read',
    write: 'member:write',
    delete: 'member:delete',
    approve: 'member:approve',
    escalate: 'member:admin',
    admin: 'member:admin',
    trigger_workflow: 'member:admin',
  },
  department: {
    read: 'department:read',
    write: 'department:write',
    delete: 'department:admin',
    approve: 'department:admin',
    escalate: 'department:admin',
    admin: 'department:admin',
    trigger_workflow: 'department:admin',
  },
  team: {
    read: 'team:read',
    write: 'team:write',
    delete: 'team:admin',
    approve: 'team:admin',
    escalate: 'team:admin',
    admin: 'team:admin',
    trigger_workflow: 'team:admin',
  },
  broadcast: {
    read: 'broadcast:read',
    write: 'broadcast:write',
    delete: 'broadcast:admin',
    approve: 'broadcast:admin',
    escalate: 'broadcast:admin',
    admin: 'broadcast:admin',
    trigger_workflow: 'broadcast:admin',
  },
  knowledge: {
    read: 'knowledge:read',
    write: 'knowledge:write',
    delete: 'knowledge:admin',
    approve: 'knowledge:admin',
    escalate: 'knowledge:admin',
    admin: 'knowledge:admin',
    trigger_workflow: 'knowledge:admin',
  },
  loop: {
    read: 'loop:read',
    write: 'loop:write',
    delete: 'loop:admin',
    approve: 'loop:verify',
    escalate: 'loop:escalate',
    admin: 'loop:admin',
    trigger_workflow: 'loop:admin',
  },
  analytics: {
    read: 'analytics:read',
    write: 'analytics:admin',
    delete: 'analytics:admin',
    approve: 'analytics:admin',
    escalate: 'analytics:admin',
    admin: 'analytics:admin',
    trigger_workflow: 'analytics:admin',
  },
  audit: {
    read: 'audit:read',
    write: 'audit:admin',
    delete: 'audit:admin',
    approve: 'audit:admin',
    escalate: 'audit:admin',
    admin: 'audit:admin',
    trigger_workflow: 'audit:admin',
  },
  agent: {
    read: 'agent:read',
    write: 'agent:write',
    delete: 'agent:admin',
    approve: 'agent:approve',
    escalate: 'agent:admin',
    admin: 'agent:admin',
    trigger_workflow: 'agent:trigger',
  },
  organization: {
    read: 'org:read',
    write: 'org:write',
    delete: 'org:admin',
    approve: 'org:admin',
    escalate: 'org:admin',
    admin: 'org:admin',
    trigger_workflow: 'org:admin',
  },
};

export async function evaluateAbac(fastify: FastifyInstance, ctx: AbacContext): Promise<boolean> {
  const requiredPermission = PERMISSION_MAP[ctx.resource][ctx.action];
  if (!requiredPermission) return false;

  await fastify.pg.query('SELECT set_config($1, $2, true)', [
    'app.current_tenant',
    ctx.organizationId,
  ]);

  // Check if actor holds the required permission via their role
  const permResult = await fastify.pg.query<PermissionRow>(
    `SELECT p.permission_name
     FROM memberships m
     JOIN roles r ON r.id = m.role_id
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE m.user_id = $1
       AND m.organization_id = $2
       AND m.status = 'active'
       AND p.permission_name = $3
     LIMIT 1`,
    [ctx.actorId, ctx.organizationId, requiredPermission],
  );

  if (permResult.rows.length > 0) return true;

  // Attribute check: resource owner always has read access to own resources
  if (
    ctx.action === 'read' &&
    ctx.resourceOwnerId !== undefined &&
    ctx.resourceOwnerId === ctx.actorId
  ) {
    return true;
  }

  // Attribute check: department-scoped read — actor in same dept as resource
  if (ctx.action === 'read' && ctx.resourceDepartmentId !== undefined) {
    const memberResult = await fastify.pg.query<MemberRow>(
      `SELECT m.department_id, mt.department_id AS team_dept_id
       FROM memberships m
       LEFT JOIN team_members tm ON tm.user_id = m.user_id
       LEFT JOIN teams mt ON mt.id = tm.team_id
       WHERE m.user_id = $1 AND m.organization_id = $2 AND m.status = 'active'
       LIMIT 1`,
      [ctx.actorId, ctx.organizationId],
    );
    const actorDept = memberResult.rows[0]?.department_id ?? memberResult.rows[0]?.team_id ?? null;
    if (actorDept !== null && actorDept === ctx.resourceDepartmentId) return true;
  }

  return false;
}

/**
 * Fastify plugin that decorates the instance with `checkAbac`.
 * Routes call `await fastify.checkAbac(ctx)` and handle 403 themselves
 * or use the optional `assertAbac` helper which auto-replies.
 */
export function registerAbacPlugin(fastify: FastifyInstance): void {
  fastify.decorate(
    'checkAbac',
    async (ctx: AbacContext): Promise<boolean> => evaluateAbac(fastify, ctx),
  );

  fastify.decorate(
    'assertAbac',
    async (ctx: AbacContext, reply: FastifyReply): Promise<boolean> => {
      const allowed = await evaluateAbac(fastify, ctx);
      if (!allowed) {
        await reply
          .status(403)
          .send({ error: 'Forbidden: insufficient permissions for this action' });
      }
      return allowed;
    },
  );
}

declare module 'fastify' {
  interface FastifyInstance {
    checkAbac: (ctx: AbacContext) => Promise<boolean>;
    assertAbac: (ctx: AbacContext, reply: FastifyReply) => Promise<boolean>;
  }
}

export function abacGuard(
  resource: AbacResource,
  action: AbacAction,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as { sub?: string; organizationId?: string } | undefined;
    const actorId = user?.sub;
    const organizationId =
      user?.organizationId ?? (request.query as Record<string, string | undefined>).organizationId;

    if (!actorId || !organizationId) {
      await reply.status(401).send({ error: 'Authentication required' });
      return;
    }

    const allowed = await evaluateAbac(request.server, {
      actorId,
      organizationId,
      action,
      resource,
    });

    if (!allowed) {
      await reply.status(403).send({ error: 'Forbidden: insufficient permissions' });
    }
  };
}
