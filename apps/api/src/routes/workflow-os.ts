import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

interface WorkflowRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  automation_domain: string | null;
  flow_type: string | null;
  sla_duration_hours: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowRunRow {
  id: string;
  organization_id: string;
  workflow_id: string;
  status: string;
  triggered_by: string;
  trigger_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  correlation_id: string;
  sla_due_at: string | null;
  automation_domain: string | null;
  flow_type: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ApprovalRow {
  id: string;
  organization_id: string;
  title: string;
  status: string;
  requested_by: string;
  current_step_order: number;
  correlation_id: string;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  organization_id: string;
  title: string;
  status: string;
  priority: string;
  reporter_id: string;
  correlation_id: string;
  created_at: string;
  updated_at: string;
}

interface IntentDetectionRow {
  id: string;
  detected_intent: string;
  automation_domain: string | null;
  matched_workflow_id: string | null;
  confidence_score: string | null;
  requires_human_review: boolean;
}

const VALID_DOMAINS = new Set([
  'communication',
  'task',
  'approval',
  'incident',
  'membership',
  'event',
  'hr',
  'finance',
  'knowledge',
  'governance',
  'executive',
]);

const VALID_FLOW_TYPES = new Set([
  'screen_flow',
  'record_trigger',
  'scheduled',
  'automated',
  'ai_flow',
]);

const INTENT_PATTERNS: { keywords: string[]; intent: string; domain: string }[] = [
  {
    keywords: [
      'approval',
      'approve',
      'cost',
      'expense',
      'repair',
      'purchase',
      'budget',
      'reimburse',
    ],
    intent: 'approval_request',
    domain: 'approval',
  },
  {
    keywords: ['task', 'todo', 'assign', 'complete', 'finish'],
    intent: 'task_creation',
    domain: 'task',
  },
  {
    keywords: ['incident', 'broken', 'issue', 'problem', 'fault', 'outage', 'emergency'],
    intent: 'incident_report',
    domain: 'incident',
  },
  {
    keywords: ['leave', 'vacation', 'sick', 'off', 'annual', 'absence'],
    intent: 'leave_request',
    domain: 'hr',
  },
  {
    keywords: ['member', 'join', 'register', 'enroll', 'membership'],
    intent: 'membership_registration',
    domain: 'membership',
  },
];

function detectIntentFromText(text: string): { intent: string; domain: string } {
  const lower = text.toLowerCase();
  for (const pattern of INTENT_PATTERNS) {
    if (pattern.keywords.some((kw) => lower.includes(kw))) {
      return { intent: pattern.intent, domain: pattern.domain };
    }
  }
  return { intent: 'information_request', domain: 'communication' };
}

function responseEnvelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

export async function workflowOsRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Workflow Definitions ────────────────────────────────────────────────

  fastify.get(
    '/workflow-os/definitions',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          domain?: string;
          flowType?: string;
          isActive?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, domain, flowType, limit, offset } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId is required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const conditions: string[] = ['organization_id = $1'];
      const params: unknown[] = [organizationId];
      let idx = 2;

      if (domain !== undefined) {
        conditions.push(`automation_domain = $${String(idx)}`);
        params.push(domain);
        idx++;
      }
      if (flowType !== undefined) {
        conditions.push(`flow_type = $${String(idx)}`);
        params.push(flowType);
        idx++;
      }
      if (request.query.isActive !== undefined) {
        conditions.push(`is_active = $${String(idx)}`);
        params.push(request.query.isActive === 'true');
        idx++;
      }

      params.push(parseInt(limit ?? '50', 10), parseInt(offset ?? '0', 10));

      const result = await fastify.pg.query<WorkflowRow>(
        `SELECT * FROM workflows WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${String(idx)} OFFSET $${String(idx + 1)}`,
        params,
      );

      return reply.send(responseEnvelope(result.rows, request.id));
    },
  );

  fastify.post(
    '/workflow-os/definitions',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          name: string;
          description?: string;
          automationDomain: string;
          flowType: string;
          ownerId?: string;
          departmentId?: string;
          slaDurationHours?: number;
          tags?: string[];
          definition?: Record<string, unknown>;
          createdBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name, createdBy } = request.body;
      if (!organizationId || !name || !createdBy) {
        return reply.status(400).send({ error: 'organizationId, name, createdBy are required' });
      }
      if (!VALID_DOMAINS.has(request.body.automationDomain)) {
        return reply.status(400).send({ error: 'Invalid automationDomain' });
      }
      if (!VALID_FLOW_TYPES.has(request.body.flowType)) {
        return reply.status(400).send({ error: 'Invalid flowType' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const result = await fastify.pg.query<WorkflowRow>(
        `INSERT INTO workflows
           (organization_id, name, description, version, is_active, automation_domain,
            flow_type, owner_id, department_id, sla_duration_hours, tags, definition, created_by)
         VALUES ($1, $2, $3, 1, false, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          organizationId,
          name,
          request.body.description ?? null,
          request.body.automationDomain,
          request.body.flowType,
          request.body.ownerId ?? null,
          request.body.departmentId ?? null,
          request.body.slaDurationHours ?? null,
          request.body.tags ?? [],
          JSON.stringify(request.body.definition ?? {}),
          createdBy,
        ],
      );

      const row = result.rows[0];
      if (!row) throw new Error('INSERT returned no row');
      return reply.status(201).send(responseEnvelope(row, request.id));
    },
  );

  fastify.get(
    '/workflow-os/definitions/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId is required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);
      const result = await fastify.pg.query<WorkflowRow>(
        `SELECT * FROM workflows WHERE organization_id = $1 AND id = $2`,
        [organizationId, request.params.id],
      );
      const row = result.rows[0];
      if (!row) return reply.status(404).send({ error: 'Workflow not found' });
      return reply.send(responseEnvelope(row, request.id));
    },
  );

  // ─── Workflow Instances ──────────────────────────────────────────────────

  fastify.post(
    '/workflow-os/instances',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          workflowId: string;
          triggeredBy: string;
          triggerData?: Record<string, unknown>;
          correlationId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, workflowId, triggeredBy } = request.body;
      if (!organizationId || !workflowId || !triggeredBy) {
        return reply
          .status(400)
          .send({ error: 'organizationId, workflowId, triggeredBy are required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const wfResult = await fastify.pg.query<{
        id: string;
        is_active: boolean;
        sla_duration_hours: number | null;
        automation_domain: string | null;
        flow_type: string | null;
      }>(
        `SELECT id, is_active, sla_duration_hours, automation_domain, flow_type FROM workflows WHERE organization_id = $1 AND id = $2`,
        [organizationId, workflowId],
      );
      const wf = wfResult.rows[0];
      if (!wf) return reply.status(404).send({ error: 'Workflow not found' });
      if (!wf.is_active) return reply.status(400).send({ error: 'Workflow is not active' });

      const correlationId = request.body.correlationId ?? crypto.randomUUID();
      const slaDueAt = wf.sla_duration_hours
        ? new Date(Date.now() + wf.sla_duration_hours * 3_600_000).toISOString()
        : null;

      const runResult = await fastify.pg.query<WorkflowRunRow>(
        `INSERT INTO workflow_runs
           (organization_id, workflow_id, status, triggered_by, trigger_data, output_data,
            correlation_id, sla_due_at, automation_domain, flow_type, started_at)
         VALUES ($1, $2, 'running', $3, $4, '{}', $5, $6, $7, $8, NOW())
         RETURNING *`,
        [
          organizationId,
          workflowId,
          triggeredBy,
          JSON.stringify(request.body.triggerData ?? {}),
          correlationId,
          slaDueAt,
          wf.automation_domain,
          wf.flow_type,
        ],
      );

      const run = runResult.rows[0];
      if (!run) throw new Error('INSERT returned no row');

      await fastify.pg.query(
        `INSERT INTO workflow_history (organization_id, run_id, to_status, actor_type, actor_id)
         VALUES ($1, $2, 'running', 'system', 'engine')`,
        [organizationId, run.id],
      );

      return reply.status(201).send(responseEnvelope(run, request.id));
    },
  );

  fastify.get(
    '/workflow-os/instances/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId is required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);
      const result = await fastify.pg.query<WorkflowRunRow>(
        `SELECT * FROM workflow_runs WHERE organization_id = $1 AND id = $2`,
        [organizationId, request.params.id],
      );
      const row = result.rows[0];
      if (!row) return reply.status(404).send({ error: 'Workflow run not found' });
      return reply.send(responseEnvelope(row, request.id));
    },
  );

  fastify.post(
    '/workflow-os/instances/:id/cancel',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string; actorId: string; reason?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId } = request.body;
      if (!organizationId || !actorId)
        return reply.status(400).send({ error: 'organizationId, actorId are required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const prevResult = await fastify.pg.query<{ status: string }>(
        `SELECT status FROM workflow_runs WHERE organization_id = $1 AND id = $2`,
        [organizationId, request.params.id],
      );
      const prev = prevResult.rows[0];
      if (!prev) return reply.status(404).send({ error: 'Workflow run not found' });

      const result = await fastify.pg.query<WorkflowRunRow>(
        `UPDATE workflow_runs SET status = 'cancelled', updated_at = NOW()
         WHERE organization_id = $1 AND id = $2 RETURNING *`,
        [organizationId, request.params.id],
      );
      const row = result.rows[0];
      if (!row) return reply.status(404).send({ error: 'Workflow run not found' });

      await fastify.pg.query(
        `INSERT INTO workflow_history (organization_id, run_id, from_status, to_status, actor_type, actor_id, notes)
         VALUES ($1, $2, $3, 'cancelled', 'member', $4, $5)`,
        [organizationId, request.params.id, prev.status, actorId, request.body.reason ?? null],
      );

      return reply.send(responseEnvelope(row, request.id));
    },
  );

  // ─── Approvals ───────────────────────────────────────────────────────────

  fastify.get(
    '/workflow-os/approvals',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          approverId?: string;
          status?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, approverId, status, limit, offset } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId is required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const conditions: string[] = ['a.organization_id = $1'];
      const params: unknown[] = [organizationId];
      let idx = 2;

      if (status !== undefined) {
        conditions.push(`a.status = $${String(idx)}`);
        params.push(status);
        idx++;
      }
      if (approverId !== undefined) {
        conditions.push(
          `EXISTS (SELECT 1 FROM approval_steps s WHERE s.approval_id = a.id AND s.approver_id = $${String(idx)} AND s.status = 'pending')`,
        );
        params.push(approverId);
        idx++;
      }
      params.push(parseInt(limit ?? '50', 10), parseInt(offset ?? '0', 10));

      const result = await fastify.pg.query<ApprovalRow>(
        `SELECT a.* FROM approvals a WHERE ${conditions.join(' AND ')} ORDER BY a.created_at DESC LIMIT $${String(idx)} OFFSET $${String(idx + 1)}`,
        params,
      );

      return reply.send(responseEnvelope(result.rows, request.id));
    },
  );

  fastify.get(
    '/workflow-os/approvals/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const [approvalResult, stepsResult] = await Promise.all([
        fastify.pg.query<ApprovalRow>(
          `SELECT * FROM approvals WHERE organization_id = $1 AND id = $2`,
          [organizationId, id],
        ),
        fastify.pg.query<{
          id: string;
          step_order: number;
          approver_id: string;
          approver_type: string;
          status: string;
          due_at: string | null;
          decided_at: string | null;
        }>(
          `SELECT id, step_order, approver_id, approver_type, status, due_at, decided_at
           FROM approval_steps WHERE organization_id = $1 AND approval_id = $2
           ORDER BY step_order ASC`,
          [organizationId, id],
        ),
      ]);

      const approval = approvalResult.rows[0];
      if (!approval) return reply.status(404).send({ error: 'Approval not found' });

      return reply.send(
        responseEnvelope(
          {
            ...approval,
            steps: stepsResult.rows.map((s) => ({
              id: s.id,
              stepOrder: s.step_order,
              approverId: s.approver_id,
              approverType: s.approver_type,
              status: s.status,
              dueAt: s.due_at,
              decidedAt: s.decided_at,
            })),
          },
          request.id,
        ),
      );
    },
  );

  fastify.post(
    '/workflow-os/approvals',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          workflowRunId?: string;
          title: string;
          description?: string;
          requestedBy: string;
          dueAt?: string;
          data?: Record<string, unknown>;
          correlationId?: string;
          steps: { approverId: string; approverType: string; dueAt?: string }[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, title, requestedBy } = request.body;
      if (!organizationId || !title || !requestedBy) {
        return reply.status(400).send({ error: 'organizationId, title, requestedBy are required' });
      }
      if (request.body.steps.length === 0) {
        return reply.status(400).send({ error: 'At least one step is required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const correlationId = request.body.correlationId ?? crypto.randomUUID();

      const approvalResult = await fastify.pg.query<ApprovalRow>(
        `INSERT INTO approvals (organization_id, workflow_run_id, title, description, status,
          requested_by, current_step_order, due_at, data, correlation_id)
         VALUES ($1, $2, $3, $4, 'pending', $5, 1, $6, $7, $8)
         RETURNING *`,
        [
          organizationId,
          request.body.workflowRunId ?? null,
          title,
          request.body.description ?? null,
          requestedBy,
          request.body.dueAt ?? null,
          JSON.stringify(request.body.data ?? {}),
          correlationId,
        ],
      );

      const approval = approvalResult.rows[0];
      if (!approval) throw new Error('INSERT returned no row');

      for (let i = 0; i < request.body.steps.length; i++) {
        const step = request.body.steps[i];
        if (!step) continue;
        await fastify.pg.query(
          `INSERT INTO approval_steps (organization_id, approval_id, step_order, approver_id, approver_type, status, due_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
          [
            organizationId,
            approval.id,
            i + 1,
            step.approverId,
            step.approverType,
            step.dueAt ?? null,
          ],
        );
      }

      await fastify.pg.query(
        `INSERT INTO approval_history (organization_id, approval_id, to_status, actor_type, actor_id)
         VALUES ($1, $2, 'pending', 'system', 'engine')`,
        [organizationId, approval.id],
      );

      return reply.status(201).send(responseEnvelope(approval, request.id));
    },
  );

  fastify.post(
    '/workflow-os/approvals/:id/decide',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          organizationId: string;
          stepId: string;
          approverId: string;
          decision: string;
          comment?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, stepId, approverId } = request.body;
      if (!organizationId || !stepId || !approverId) {
        return reply.status(400).send({ error: 'organizationId, stepId, approverId are required' });
      }
      if (request.body.decision !== 'approved' && request.body.decision !== 'rejected') {
        return reply.status(400).send({ error: 'decision must be approved or rejected' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      await fastify.pg.query(
        `UPDATE approval_steps SET status = $3, decided_at = NOW()
         WHERE organization_id = $1 AND id = $2`,
        [organizationId, stepId, request.body.decision],
      );

      await fastify.pg.query(
        `INSERT INTO approval_decisions (organization_id, approval_id, step_id, approver_id, decision, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          organizationId,
          request.params.id,
          stepId,
          approverId,
          request.body.decision,
          request.body.comment ?? null,
        ],
      );

      const approvalMeta = await fastify.pg.query<{ workflow_run_id: string | null }>(
        `SELECT workflow_run_id FROM approvals WHERE organization_id = $1 AND id = $2`,
        [organizationId, request.params.id],
      );
      const workflowRunId = approvalMeta.rows[0]?.workflow_run_id ?? undefined;

      const correlationId = crypto.randomUUID();
      const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
      });
      const approvalQueue = new Queue('approval-processing', { connection: redis });

      if (request.body.decision === 'rejected') {
        const result = await fastify.pg.query<ApprovalRow>(
          `UPDATE approvals SET status = 'rejected', completed_at = NOW(), updated_at = NOW()
           WHERE organization_id = $1 AND id = $2 RETURNING *`,
          [organizationId, request.params.id],
        );
        const row = result.rows[0];
        if (!row) {
          await approvalQueue.close();
          await redis.quit();
          return reply.status(404).send({ error: 'Approval not found' });
        }
        await fastify.pg.query(
          `INSERT INTO approval_history (organization_id, approval_id, from_status, to_status, actor_type, actor_id)
           VALUES ($1, $2, 'pending', 'rejected', 'member', $3)`,
          [organizationId, request.params.id, approverId],
        );
        await approvalQueue.add('post-rejection-notify', {
          jobName: 'post-rejection-notify',
          organizationId,
          approvalId: request.params.id,
          workflowRunId,
          approverId,
          decision: 'rejected',
          correlationId,
        });
        await approvalQueue.close();
        await redis.quit();
        return reply.send(responseEnvelope(row, request.id));
      }

      const pendingResult = await fastify.pg.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM approval_steps WHERE organization_id = $1 AND approval_id = $2 AND status = 'pending'`,
        [organizationId, request.params.id],
      );
      const pendingCount = parseInt(pendingResult.rows[0]?.count ?? '0', 10);

      const newStatus = pendingCount === 0 ? 'approved' : 'pending';
      const completedAt = pendingCount === 0 ? ', completed_at = NOW()' : '';

      const result = await fastify.pg.query<ApprovalRow>(
        `UPDATE approvals SET status = $3, current_step_order = current_step_order + 1${completedAt}, updated_at = NOW()
         WHERE organization_id = $1 AND id = $2 RETURNING *`,
        [organizationId, request.params.id, newStatus],
      );
      const row = result.rows[0];
      if (!row) {
        await approvalQueue.close();
        await redis.quit();
        return reply.status(404).send({ error: 'Approval not found' });
      }

      await fastify.pg.query(
        `INSERT INTO approval_history (organization_id, approval_id, from_status, to_status, actor_type, actor_id)
         VALUES ($1, $2, 'pending', $3, 'member', $4)`,
        [organizationId, request.params.id, newStatus, approverId],
      );

      if (newStatus === 'approved' && workflowRunId) {
        await approvalQueue.add('post-approval-advance', {
          jobName: 'post-approval-advance',
          organizationId,
          approvalId: request.params.id,
          workflowRunId,
          approverId,
          decision: 'approved',
          correlationId,
        });
      }

      await approvalQueue.close();
      await redis.quit();
      return reply.send(responseEnvelope(row, request.id));
    },
  );

  // ─── Tasks ───────────────────────────────────────────────────────────────

  fastify.get(
    '/workflow-os/tasks',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          assigneeId?: string;
          status?: string;
          workflowRunId?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, assigneeId, status, workflowRunId, limit, offset } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId is required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const conditions: string[] = ['organization_id = $1'];
      const params: unknown[] = [organizationId];
      let idx = 2;

      if (assigneeId !== undefined) {
        conditions.push(`assignee_id = $${String(idx)}`);
        params.push(assigneeId);
        idx++;
      }
      if (status !== undefined) {
        conditions.push(`status = $${String(idx)}`);
        params.push(status);
        idx++;
      }
      if (workflowRunId !== undefined) {
        conditions.push(`workflow_run_id = $${String(idx)}`);
        params.push(workflowRunId);
        idx++;
      }

      params.push(parseInt(limit ?? '50', 10), parseInt(offset ?? '0', 10));

      const result = await fastify.pg.query<TaskRow>(
        `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${String(idx)} OFFSET $${String(idx + 1)}`,
        params,
      );

      return reply.send(responseEnvelope(result.rows, request.id));
    },
  );

  fastify.post(
    '/workflow-os/tasks',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          workflowRunId?: string;
          title: string;
          description?: string;
          priority?: string;
          assigneeId?: string;
          reporterId: string;
          dueAt?: string;
          data?: Record<string, unknown>;
          correlationId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, title, reporterId } = request.body;
      if (!organizationId || !title || !reporterId) {
        return reply.status(400).send({ error: 'organizationId, title, reporterId are required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const result = await fastify.pg.query<TaskRow>(
        `INSERT INTO tasks
           (organization_id, workflow_run_id, title, description, status, priority,
            assignee_id, reporter_id, due_at, data, correlation_id)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          organizationId,
          request.body.workflowRunId ?? null,
          title,
          request.body.description ?? null,
          request.body.priority ?? 'medium',
          request.body.assigneeId ?? null,
          reporterId,
          request.body.dueAt ?? null,
          JSON.stringify(request.body.data ?? {}),
          request.body.correlationId ?? crypto.randomUUID(),
        ],
      );

      const row = result.rows[0];
      if (!row) throw new Error('INSERT returned no row');
      return reply.status(201).send(responseEnvelope(row, request.id));
    },
  );

  fastify.post(
    '/workflow-os/tasks/:id/complete',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string; actorId: string; notes?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId } = request.body;
      if (!organizationId || !actorId)
        return reply.status(400).send({ error: 'organizationId, actorId are required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const prevResult = await fastify.pg.query<{ status: string }>(
        `SELECT status FROM tasks WHERE organization_id = $1 AND id = $2`,
        [organizationId, request.params.id],
      );
      const prev = prevResult.rows[0];
      if (!prev) return reply.status(404).send({ error: 'Task not found' });

      const result = await fastify.pg.query<TaskRow>(
        `UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
         WHERE organization_id = $1 AND id = $2 RETURNING *`,
        [organizationId, request.params.id],
      );
      const row = result.rows[0];
      if (!row) return reply.status(404).send({ error: 'Task not found' });

      await fastify.pg.query(
        `INSERT INTO task_history (organization_id, task_id, from_status, to_status, actor_type, actor_id, notes)
         VALUES ($1, $2, $3, 'completed', 'member', $4, $5)`,
        [organizationId, request.params.id, prev.status, actorId, request.body.notes ?? null],
      );

      return reply.send(responseEnvelope(row, request.id));
    },
  );

  // ─── Intent Detection ────────────────────────────────────────────────────

  fastify.post(
    '/workflow-os/detect-intent',
    async (
      request: FastifyRequest<{
        Body: { organizationId: string; rawInput: string; sourceType?: string; sourceId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, rawInput } = request.body;
      if (!organizationId || !rawInput) {
        return reply.status(400).send({ error: 'organizationId and rawInput are required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const { intent, domain } = detectIntentFromText(rawInput);
      const sourceType = request.body.sourceType ?? 'api';

      const wfResult = await fastify.pg.query<{ id: string }>(
        `SELECT id FROM workflows WHERE organization_id = $1 AND automation_domain = $2 AND is_active = true LIMIT 1`,
        [organizationId, domain],
      );
      const matchedWorkflow = wfResult.rows[0];

      const result = await fastify.pg.query<IntentDetectionRow>(
        `INSERT INTO intent_detections
           (organization_id, source_type, source_id, raw_input, detected_intent,
            automation_domain, flow_type, matched_workflow_id, confidence_score, requires_human_review)
         VALUES ($1, $2, $3, $4, $5, $6, 'automated', $7, 0.85, false)
         RETURNING *`,
        [
          organizationId,
          sourceType,
          request.body.sourceId ?? null,
          rawInput,
          intent,
          domain,
          matchedWorkflow?.id ?? null,
        ],
      );

      const row = result.rows[0];
      if (!row) throw new Error('INSERT returned no row');

      return reply.send(
        responseEnvelope(
          {
            detectedIntent: intent,
            automationDomain: domain,
            matchedWorkflowId: matchedWorkflow?.id ?? null,
            confidenceScore: 0.85,
            requiresHumanReview: false,
            detectionId: row.id,
          },
          request.id,
        ),
      );
    },
  );
}
