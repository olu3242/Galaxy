import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MarketplaceItemService } from '@galaxy/marketplace';
import { PublisherService } from '@galaxy/marketplace';
import { InstallationService } from '@galaxy/marketplace';
import { ReviewService } from '@galaxy/marketplace';
import { MarketplaceBillingService } from '@galaxy/marketplace';
import { MarketplaceAnalyticsService } from '@galaxy/marketplace';
import type {
  MarketplaceItemCategory,
  PricingModel,
  InstallationStatus,
  ReviewStatus,
} from '@galaxy/marketplace';

function getOrgId(request: FastifyRequest): string {
  const orgId = (request.headers['x-organization-id'] as string | undefined) ?? '';
  if (!orgId) throw new Error('Missing x-organization-id header');
  return orgId;
}

export function marketplaceRoutes(fastify: FastifyInstance): void {
  // ---- Items ----
  fastify.get('/marketplace/items', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const query = request.query as Record<string, string>;
    const service = new MarketplaceItemService(fastify.pg);
    const items = await service.listItems(orgId, {
      ...(query.category !== undefined
        ? { category: query.category as MarketplaceItemCategory }
        : {}),
      ...(query.status !== undefined
        ? { status: query.status as 'draft' | 'pending_review' | 'published' | 'suspended' }
        : {}),
      ...(query.limit !== undefined ? { limit: parseInt(query.limit, 10) } : {}),
      ...(query.offset !== undefined ? { offset: parseInt(query.offset, 10) } : {}),
    });
    return reply.send({ items });
  });

  fastify.get('/marketplace/items/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    const service = new MarketplaceItemService(fastify.pg);
    const item = await service.getItem(orgId, id);
    if (!item) return reply.status(404).send({ error: 'Item not found' });
    return reply.send({ item });
  });

  fastify.post('/marketplace/items', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const body = request.body as {
      publisherId: string;
      name: string;
      slug: string;
      description: string;
      category: MarketplaceItemCategory;
      pricingModel: PricingModel;
      priceAmount: number;
      priceCurrency: string;
      tags: string[];
      metadata: Record<string, unknown>;
    };
    const service = new MarketplaceItemService(fastify.pg);
    const item = await service.createItem({ organizationId: orgId, ...body });
    return reply.status(201).send({ item });
  });

  fastify.patch('/marketplace/items/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const service = new MarketplaceItemService(fastify.pg);
    const item = await service.updateItem(orgId, id, {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.description === 'string' ? { description: body.description } : {}),
      ...(typeof body.pricingModel === 'string'
        ? { pricingModel: body.pricingModel as PricingModel }
        : {}),
      ...(typeof body.priceAmount === 'number' ? { priceAmount: body.priceAmount } : {}),
      ...(Array.isArray(body.tags) ? { tags: body.tags as string[] } : {}),
      ...(body.metadata !== undefined &&
      typeof body.metadata === 'object' &&
      body.metadata !== null
        ? { metadata: body.metadata as Record<string, unknown> }
        : {}),
    });
    if (!item) return reply.status(404).send({ error: 'Item not found' });
    return reply.send({ item });
  });

  fastify.post(
    '/marketplace/items/:id/publish',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new MarketplaceItemService(fastify.pg);
      const item = await service.publishItem(orgId, id);
      if (!item) return reply.status(404).send({ error: 'Item not found or cannot be published' });
      return reply.send({ item });
    },
  );

  fastify.delete('/marketplace/items/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    const service = new MarketplaceItemService(fastify.pg);
    const deleted = await service.deleteItem(orgId, id);
    if (!deleted) return reply.status(404).send({ error: 'Item not found or cannot be deleted' });
    return reply.status(204).send();
  });

  // ---- Publishers ----
  fastify.get('/marketplace/publishers', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const service = new PublisherService(fastify.pg);
    const publishers = await service.listPublishers(orgId);
    return reply.send({ publishers });
  });

  fastify.post('/marketplace/publishers', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const body = request.body as {
      displayName: string;
      email: string;
      metadata: Record<string, unknown>;
    };
    const service = new PublisherService(fastify.pg);
    const publisher = await service.registerPublisher({ organizationId: orgId, ...body });
    return reply.status(201).send({ publisher });
  });

  fastify.post(
    '/marketplace/publishers/:id/approve',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new PublisherService(fastify.pg);
      const publisher = await service.approvePublisher(orgId, id);
      if (!publisher) return reply.status(404).send({ error: 'Publisher not found' });
      return reply.send({ publisher });
    },
  );

  // ---- Installations ----
  fastify.get(
    '/marketplace/installations',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const query = request.query as Record<string, string>;
      const service = new InstallationService(fastify.pg);
      const installations = await service.listInstallations(orgId, {
        ...(query.status !== undefined ? { status: query.status as InstallationStatus } : {}),
        ...(query.limit !== undefined ? { limit: parseInt(query.limit, 10) } : {}),
        ...(query.offset !== undefined ? { offset: parseInt(query.offset, 10) } : {}),
      });
      return reply.send({ installations });
    },
  );

  fastify.post(
    '/marketplace/installations',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const body = request.body as {
        marketplaceItemId: string;
        installedBy: string;
        config: Record<string, unknown>;
      };
      const service = new InstallationService(fastify.pg);
      const installation = await service.installItem({ organizationId: orgId, ...body });
      return reply.status(201).send({ installation });
    },
  );

  fastify.delete(
    '/marketplace/installations/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new InstallationService(fastify.pg);
      const installation = await service.uninstallItem(orgId, id);
      if (!installation) return reply.status(404).send({ error: 'Installation not found' });
      return reply.send({ installation });
    },
  );

  // ---- Reviews ----
  fastify.get(
    '/marketplace/items/:id/reviews',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, string>;
      const service = new ReviewService(fastify.pg);
      const reviews = await service.listReviews(orgId, id, {
        ...(query.status !== undefined ? { status: query.status as ReviewStatus } : {}),
        ...(query.limit !== undefined ? { limit: parseInt(query.limit, 10) } : {}),
        ...(query.offset !== undefined ? { offset: parseInt(query.offset, 10) } : {}),
      });
      return reply.send({ reviews });
    },
  );

  fastify.post(
    '/marketplace/items/:id/reviews',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const body = request.body as {
        authorId: string;
        rating: number;
        title: string;
        body: string;
      };
      const service = new ReviewService(fastify.pg);
      const review = await service.submitReview({
        organizationId: orgId,
        marketplaceItemId: id,
        ...body,
      });
      return reply.status(201).send({ review });
    },
  );

  fastify.post(
    '/marketplace/reviews/:id/moderate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const body = request.body as { decision: 'approved' | 'rejected' };
      const service = new ReviewService(fastify.pg);
      const review = await service.moderateReview(orgId, id, body.decision);
      if (!review) return reply.status(404).send({ error: 'Review not found' });
      return reply.send({ review });
    },
  );

  // ---- Billing ----
  fastify.get('/marketplace/billing', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const query = request.query as Record<string, string>;
    const service = new MarketplaceBillingService(fastify.pg);
    const billing = await service.listBilling(orgId, {
      ...(query.installationId !== undefined ? { installationId: query.installationId } : {}),
      ...(query.limit !== undefined ? { limit: parseInt(query.limit, 10) } : {}),
      ...(query.offset !== undefined ? { offset: parseInt(query.offset, 10) } : {}),
    });
    return reply.send({ billing });
  });

  // ---- Analytics ----
  fastify.get('/marketplace/analytics', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const service = new MarketplaceAnalyticsService(fastify.pg);
    const overview = await service.getMarketplaceOverview(orgId);
    return reply.send({ overview });
  });

  fastify.get(
    '/marketplace/analytics/items/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new MarketplaceAnalyticsService(fastify.pg);
      const analytics = await service.getItemAnalytics(orgId, id);
      if (!analytics) return reply.status(404).send({ error: 'Item not found' });
      return reply.send({ analytics });
    },
  );
}
