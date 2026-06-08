import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PartnerService, PartnerDealService } from '@galaxy/partner';
import type { PartnerType, PartnerTier, RegisterDealInput } from '@galaxy/partner';

export function partnerRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/partners',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; status?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, status } = request.query;
      const service = new PartnerService(fastify.pg);
      const partners = await service.listPartners(
        orgId,
        status ? { status: status as 'pending' | 'approved' | 'rejected' | 'suspended' } : {},
      );
      return reply.send({ partners });
    },
  );

  fastify.post(
    '/partners',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          name: string;
          type: string;
          tier?: string;
          contactEmail: string;
          contactName: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, name, type, tier, contactEmail, contactName } = request.body;
      const service = new PartnerService(fastify.pg);
      const partner = await service.registerPartner({
        organizationId: orgId,
        name,
        type: type as PartnerType,
        tier: (tier ?? 'registered') as PartnerTier,
        contactEmail,
        contactName,
      });
      return reply.status(201).send({ partner });
    },
  );

  fastify.put(
    '/partners/:id/approve',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { orgId: string; approvedBy: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId, approvedBy } = request.body;
      const service = new PartnerService(fastify.pg);
      const partner = await service.approvePartner(orgId, id, approvedBy);
      return reply.send({ partner });
    },
  );

  fastify.get(
    '/partners/:id/analytics',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId } = request.query;
      const service = new PartnerService(fastify.pg);
      const partner = await service.getPartner(orgId, id);
      if (!partner) return reply.status(404).send({ error: 'Partner not found' });
      return reply.send({ partnerId: id, analytics: { partner } });
    },
  );

  fastify.get(
    '/partners/:id/deals',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId } = request.query;
      const service = new PartnerDealService(fastify.pg);
      const deals = await service.listDeals(orgId, id);
      return reply.send({ deals });
    },
  );

  fastify.post(
    '/partners/:id/deals',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          orgId: string;
          customerOrgName: string;
          customerEmail: string;
          dealValue?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId, customerOrgName, customerEmail, dealValue } = request.body;
      const service = new PartnerDealService(fastify.pg);
      const input: RegisterDealInput = {
        organizationId: orgId,
        partnerId: id,
        customerOrgName,
        customerEmail,
        dealValue: dealValue ?? 0,
        notes: '',
      };
      const deal = await service.registerDeal(input);
      return reply.status(201).send({ deal });
    },
  );

  fastify.get(
    '/partners/:id/commissions',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId } = request.query;
      const service = new PartnerDealService(fastify.pg);
      const commissions = await service.listCommissions(orgId, id);
      return reply.send({ commissions });
    },
  );

  fastify.get(
    '/partners/:id/payouts',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId } = request.query;
      const service = new PartnerDealService(fastify.pg);
      const commissions = await service.listCommissions(orgId, id);
      const totalPayout = commissions.reduce((sum, c) => sum + c.amount, 0);
      return reply.send({ partnerId: id, totalPayout, commissions });
    },
  );
}
