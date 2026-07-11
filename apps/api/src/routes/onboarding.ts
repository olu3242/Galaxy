import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OrganizationService } from '@galaxy/identity';
import { MembershipService } from '@galaxy/identity';
import { DepartmentService, TeamService } from '@galaxy/people';
import { EventPublisher } from '@galaxy/events';
import { randomUUID } from 'crypto';

function envelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

export function onboardingRoutes(fastify: FastifyInstance): void {
  const eventPublisher = new EventPublisher(fastify.pg);
  const orgService = new OrganizationService(fastify.pg, eventPublisher);
  const membershipService = new MembershipService(fastify.pg, eventPublisher);
  const departmentService = new DepartmentService(fastify.pg, eventPublisher);
  const teamService = new TeamService(fastify.pg, eventPublisher);

  // ── WABA Setup Wizard ───────────────────────────────────────────────────────

  fastify.post(
    '/onboarding/waba-setup',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          whatsappPhoneNumberId: string;
          actorId: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, whatsappPhoneNumberId, actorId } = request.body;
      if (!organizationId || !whatsappPhoneNumberId || !actorId) {
        return reply
          .status(400)
          .send({ error: 'organizationId, whatsappPhoneNumberId, actorId required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      await fastify.pg.query(
        `UPDATE organizations
         SET waba_phone_number_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [whatsappPhoneNumberId, organizationId],
      );

      const org = await orgService.getById(organizationId);
      if (!org) return reply.status(404).send({ error: 'Organization not found' });

      return reply.send(envelope({ organization: org, wabaConfigured: true }, request.id));
    },
  );

  // ── Bulk Member Invite ──────────────────────────────────────────────────────

  fastify.post(
    '/onboarding/bulk-invite',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          actorId: string;
          members: { userId: string; roleId?: string }[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId, members } = request.body;
      if (!organizationId || !actorId || !Array.isArray(members) || members.length === 0) {
        return reply
          .status(400)
          .send({ error: 'organizationId, actorId, and non-empty members array required' });
      }

      const results: { userId: string; status: 'invited' | 'failed'; error?: string }[] = [];

      for (const member of members) {
        try {
          await membershipService.addMember({
            organizationId,
            userId: member.userId,
            correlationId: randomUUID(),
            actorId,
            ...(member.roleId !== undefined ? { roleId: member.roleId } : {}),
          });
          results.push({ userId: member.userId, status: 'invited' });
        } catch (err) {
          results.push({
            userId: member.userId,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      const invited = results.filter((r) => r.status === 'invited').length;
      const failed = results.filter((r) => r.status === 'failed').length;

      return reply.status(201).send(
        envelope(
          {
            invited,
            failed,
            results,
          },
          request.id,
        ),
      );
    },
  );

  // ── Department Setup ────────────────────────────────────────────────────────

  fastify.post(
    '/onboarding/departments',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          actorId: string;
          departments: { name: string; description?: string; headId?: string }[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId, departments } = request.body;
      if (!organizationId || !actorId || !Array.isArray(departments) || departments.length === 0) {
        return reply
          .status(400)
          .send({ error: 'organizationId, actorId, and non-empty departments array required' });
      }

      const created = await Promise.all(
        departments.map((dept) =>
          departmentService.create({
            organizationId,
            name: dept.name,
            correlationId: randomUUID(),
            actorId,
            ...(dept.description !== undefined ? { description: dept.description } : {}),
            ...(dept.headId !== undefined ? { headId: dept.headId } : {}),
          }),
        ),
      );

      return reply.status(201).send(envelope({ departments: created }, request.id));
    },
  );

  // ── Team Setup ──────────────────────────────────────────────────────────────

  fastify.post(
    '/onboarding/teams',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          actorId: string;
          teams: { name: string; departmentId: string; description?: string }[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId, teams } = request.body;
      if (!organizationId || !actorId || !Array.isArray(teams) || teams.length === 0) {
        return reply
          .status(400)
          .send({ error: 'organizationId, actorId, and non-empty teams array required' });
      }

      const created = await Promise.all(
        teams.map((team) =>
          teamService.create({
            organizationId,
            name: team.name,
            departmentId: team.departmentId,
            correlationId: randomUUID(),
            actorId,
            ...(team.description !== undefined ? { description: team.description } : {}),
          }),
        ),
      );

      return reply.status(201).send(envelope({ teams: created }, request.id));
    },
  );

  // ── Onboarding Status ───────────────────────────────────────────────────────

  fastify.get(
    '/onboarding/status',
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

      const [orgResult, memberCount, deptCount, teamCount] = await Promise.all([
        fastify.pg.query<{ waba_phone_number_id: string | null }>(
          'SELECT waba_phone_number_id FROM organizations WHERE id = $1',
          [organizationId],
        ),
        fastify.pg.query<{ count: string }>(
          "SELECT COUNT(*) AS count FROM memberships WHERE organization_id = $1 AND status = 'active'",
          [organizationId],
        ),
        fastify.pg.query<{ count: string }>(
          "SELECT COUNT(*) AS count FROM departments WHERE organization_id = $1 AND status != 'archived'",
          [organizationId],
        ),
        fastify.pg.query<{ count: string }>(
          "SELECT COUNT(*) AS count FROM teams WHERE organization_id = $1 AND status != 'archived'",
          [organizationId],
        ),
      ]);

      const orgRow = orgResult.rows[0];
      const wabaConfigured = Boolean(orgRow?.waba_phone_number_id);
      const members = parseInt(memberCount.rows[0]?.count ?? '0', 10);
      const departments = parseInt(deptCount.rows[0]?.count ?? '0', 10);
      const teams = parseInt(teamCount.rows[0]?.count ?? '0', 10);

      const steps = {
        wabaConfigured,
        membersInvited: members > 0,
        departmentsCreated: departments > 0,
        teamsCreated: teams > 0,
      };

      const completedSteps = Object.values(steps).filter(Boolean).length;
      const totalSteps = Object.keys(steps).length;
      const complete = completedSteps === totalSteps;

      return reply.send(
        envelope(
          {
            complete,
            progress: { completed: completedSteps, total: totalSteps },
            steps,
            counts: { members, departments, teams },
          },
          request.id,
        ),
      );
    },
  );
}
