import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  EconomyAccountService,
  EconomyTransactionService,
  AgentEconomyService,
  KnowledgeEconomyService,
  WorkflowEconomyService,
  EconomySettlementService,
} from '@galaxy/economy';
import type { EconomyAccountType } from '@galaxy/economy';

export function economyRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/economy/accounts',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const service = new EconomyAccountService(fastify.pg);
      const accounts = await service.listAccounts(orgId);
      return reply.send({ accounts });
    },
  );

  fastify.get(
    '/economy/accounts/:accountType/balance',
    async (
      request: FastifyRequest<{ Params: { accountType: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { accountType } = request.params;
      const { orgId } = request.query;
      const service = new EconomyAccountService(fastify.pg);
      const balance = await service.getBalance(orgId, accountType as EconomyAccountType);
      return reply.send({ accountType, balance });
    },
  );

  fastify.get(
    '/economy/transactions',
    async (
      request: FastifyRequest<{
        Querystring: { orgId: string; accountType?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, accountType, limit } = request.query;
      const service = new EconomyTransactionService(fastify.pg);
      const transactions = await service.getHistory(
        orgId,
        accountType ? (accountType as EconomyAccountType) : undefined,
        limit ? parseInt(limit, 10) : 50,
      );
      return reply.send({ transactions });
    },
  );

  fastify.get(
    '/economy/publisher/earnings',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, limit } = request.query;
      const service = new WorkflowEconomyService(fastify.pg);
      const earnings = await service.getPublisherEarnings(orgId, limit ? parseInt(limit, 10) : 100);
      return reply.send({ earnings });
    },
  );

  fastify.get(
    '/economy/agent/:agentId/ledger',
    async (
      request: FastifyRequest<{ Params: { agentId: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { agentId } = request.params;
      const { orgId } = request.query;
      const service = new AgentEconomyService(fastify.pg);
      const ledger = await service.getAgentLedger(orgId, agentId);
      return reply.send({ ledger });
    },
  );

  fastify.get(
    '/economy/knowledge/earnings',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, limit } = request.query;
      const service = new KnowledgeEconomyService(fastify.pg);
      const earnings = await service.getKnowledgeEarnings(orgId, limit ? parseInt(limit, 10) : 100);
      return reply.send({ earnings });
    },
  );

  fastify.get(
    '/economy/settlement/pending',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const service = new EconomySettlementService(fastify.pg);
      const summary = await service.getPendingSettlement(orgId);
      return reply.send({ summary });
    },
  );

  fastify.post(
    '/economy/settlement/run',
    async (
      request: FastifyRequest<{ Body: { orgId: string; period?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, period } = request.body;
      const service = new EconomySettlementService(fastify.pg);
      const result = await service.runSettlement(
        orgId,
        period ?? new Date().toISOString().slice(0, 7),
      );
      return reply.send({ result });
    },
  );
}
