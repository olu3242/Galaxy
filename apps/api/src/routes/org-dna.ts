import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OrgDNAService, OrgLanguageService, IndustryBlueprintService } from '@galaxy/org-dna';

export function orgDnaRoutes(fastify: FastifyInstance): void {
  // POST /org-dna
  fastify.post(
    '/org-dna',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          identityProfile: Record<string, unknown>;
          operatingProfile: Record<string, unknown>;
          workflowProfile: Record<string, unknown>;
          languageProfile: Record<string, unknown>;
          industryBlueprint?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const {
        orgId,
        identityProfile,
        operatingProfile,
        workflowProfile,
        languageProfile,
        industryBlueprint,
      } = request.body;
      const svc = new OrgDNAService(fastify.pg);
      const dna = await svc.upsertDNA(
        orgId,
        identityProfile,
        operatingProfile,
        workflowProfile,
        languageProfile,
        industryBlueprint,
      );
      return reply.status(201).send(dna);
    },
  );

  // GET /org-dna
  fastify.get(
    '/org-dna',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const svc = new OrgDNAService(fastify.pg);
      const dna = await svc.getDNA(orgId);
      return reply.send(dna);
    },
  );

  // PATCH /org-dna/field
  fastify.patch(
    '/org-dna/field',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          field: 'identityProfile' | 'operatingProfile' | 'workflowProfile' | 'languageProfile';
          value: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, field, value } = request.body;
      const svc = new OrgDNAService(fastify.pg);
      const dna = await svc.updateDNAField(orgId, field, value);
      return reply.send(dna);
    },
  );

  // GET /org-dna/completeness
  fastify.get(
    '/org-dna/completeness',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const svc = new OrgDNAService(fastify.pg);
      const score = await svc.computeCompleteness(orgId);
      return reply.send({ score });
    },
  );

  // POST /org-dna/language
  fastify.post(
    '/org-dna/language',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          term: string;
          definition: string;
          aliases: string[];
          category: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, term, definition, aliases, category } = request.body;
      const svc = new OrgLanguageService(fastify.pg);
      const entry = await svc.addTerm(orgId, term, definition, aliases, category);
      return reply.status(201).send(entry);
    },
  );

  // GET /org-dna/language
  fastify.get(
    '/org-dna/language',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const svc = new OrgLanguageService(fastify.pg);
      const terms = await svc.getTerms(orgId);
      return reply.send(terms);
    },
  );

  // GET /org-dna/language/lookup
  fastify.get(
    '/org-dna/language/lookup',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; term: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, term } = request.query;
      const svc = new OrgLanguageService(fastify.pg);
      const entry = await svc.lookupTerm(orgId, term);
      return reply.send(entry);
    },
  );

  // DELETE /org-dna/language/:termId
  fastify.delete(
    '/org-dna/language/:termId',
    async (
      request: FastifyRequest<{
        Params: { termId: string };
        Querystring: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { termId } = request.params;
      const { orgId } = request.query;
      const svc = new OrgLanguageService(fastify.pg);
      await svc.deleteTerm(orgId, termId);
      return reply.status(204).send();
    },
  );

  // GET /org-dna/blueprints
  fastify.get('/org-dna/blueprints', async (_request: FastifyRequest, reply: FastifyReply) => {
    const svc = new IndustryBlueprintService(fastify.pg);
    const blueprints = await svc.listBlueprints();
    return reply.send(blueprints);
  });

  // GET /org-dna/blueprints/:industry
  fastify.get(
    '/org-dna/blueprints/:industry',
    async (request: FastifyRequest<{ Params: { industry: string } }>, reply: FastifyReply) => {
      const { industry } = request.params;
      const svc = new IndustryBlueprintService(fastify.pg);
      const blueprint = await svc.getBlueprint(industry);
      return reply.send(blueprint);
    },
  );

  // POST /org-dna/blueprints/:industry/apply
  fastify.post(
    '/org-dna/blueprints/:industry/apply',
    async (
      request: FastifyRequest<{
        Params: { industry: string };
        Body: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { industry } = request.params;
      const { orgId } = request.body;
      const svc = new IndustryBlueprintService(fastify.pg);
      const dna = await svc.applyBlueprint(orgId, industry);
      return reply.send(dna);
    },
  );
}
