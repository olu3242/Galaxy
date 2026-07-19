import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NLWorkflowParser, type ParsedWorkflowDraft } from '@galaxy/workflow-generator';
import { WorkflowDefinitionService } from '@galaxy/workflow';

interface GenerateBody {
  text: string;
  channel?: string;
}

interface ConfirmBody {
  draft: ParsedWorkflowDraft;
  name?: string;
}

export async function workflowGenRoutes(fastify: FastifyInstance): Promise<void> {
  const parser = new NLWorkflowParser();

  /**
   * POST /api/v1/workflows/generate
   *
   * Parse a natural-language description into a ParsedWorkflowDraft.
   * Auth required — organizationId and actorId come from the JWT payload.
   */
  fastify.post(
    '/workflows/generate',
    async (
      request: FastifyRequest<{ Body: GenerateBody }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, sub: actorId } = request.user;
      const { text, channel } = request.body;

      if (!text || text.trim().length === 0) {
        return reply.status(400).send({ error: 'text is required' });
      }

      const draft = parser.parse({
        text,
        organizationId,
        channel: (channel ?? 'web') as 'whatsapp' | 'web' | 'email' | 'document',
      });

      // Audit log the generation request (INSERT-only, immutable)
      await fastify.pg.query(
        `INSERT INTO audit_logs
           (organization_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, 'member', 'workflow.generate.parse', 'workflow_draft', gen_random_uuid(), $3)`,
        [
          organizationId,
          actorId,
          JSON.stringify({ channel: channel ?? 'web', stepCount: draft.steps.length, confidence: draft.confidence }),
        ],
      );

      return reply.status(200).send(draft);
    },
  );

  /**
   * POST /api/v1/workflows/generate/confirm
   *
   * Convert a ParsedWorkflowDraft into a persisted WorkflowDefinition.
   * Auth required.
   */
  fastify.post(
    '/workflows/generate/confirm',
    async (
      request: FastifyRequest<{ Body: ConfirmBody }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, sub: actorId } = request.user;
      const { draft, name } = request.body;

      if (!draft) {
        return reply.status(400).send({ error: 'draft is required' });
      }

      const svc = new WorkflowDefinitionService(fastify.pg);

      const correlationId = crypto.randomUUID();
      const workflow = await svc.createWorkflow({
        organizationId,
        name: name ?? draft.title,
        description: draft.description,
        automationDomain: 'task',
        flowType: 'automated',
        tags: draft.detectedOwners,
        definition: {
          steps: draft.steps,
          requiredApprovals: draft.requiredApprovals,
          detectedDeadlines: draft.detectedDeadlines,
          estimatedDurationMs: draft.estimatedDurationMs,
          confidence: draft.confidence,
          generatedFrom: 'nl_parser',
        },
        createdBy: actorId,
        correlationId,
      });

      // Audit log the confirmation
      await fastify.pg.query(
        `INSERT INTO audit_logs
           (organization_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, 'member', 'workflow.generate.confirm', 'workflow', $3, $4)`,
        [
          organizationId,
          actorId,
          workflow.id,
          JSON.stringify({ workflowName: workflow.name, stepCount: draft.steps.length }),
        ],
      );

      return reply.status(201).send(workflow);
    },
  );
}
