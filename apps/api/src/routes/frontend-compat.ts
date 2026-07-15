/**
 * Frontend-compat routes: endpoints called by the web dashboard that aren't
 * covered by existing route files. All queries use parameterized statements.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

function envelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

async function setTenant(fastify: FastifyInstance, orgId: string) {
  await fastify.pg.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
}

export async function frontendCompatRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Sprint 26: Agent definitions ─────────────────────────────────────────────

  fastify.get(
    '/agents/definitions',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, limit = '50', offset = '0' } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);

      const result = await fastify.pg.query<{
        id: string;
        name: string;
        agent_type: string;
        is_active: boolean;
        capabilities: string[];
        created_at: string;
        updated_at: string;
        tasks_completed: string;
        tasks_failed: string;
        last_run_at: string | null;
      }>(
        `SELECT
          a.id, a.name, a.agent_type, a.is_active, a.capabilities, a.created_at, a.updated_at,
          COUNT(e.id) FILTER (WHERE e.status = 'completed') AS tasks_completed,
          COUNT(e.id) FILTER (WHERE e.status = 'failed')    AS tasks_failed,
          MAX(e.created_at)                                  AS last_run_at
        FROM agents a
        LEFT JOIN agent_executions e ON e.agent_id = a.id AND e.organization_id = a.organization_id
        WHERE a.organization_id = $1
        GROUP BY a.id
        ORDER BY a.created_at DESC
        LIMIT $2 OFFSET $3`,
        [organizationId, parseInt(limit, 10), parseInt(offset, 10)],
      );

      const data = result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.agent_type,
        status: r.is_active ? 'active' : 'paused',
        capabilities: r.capabilities,
        tasksCompleted: parseInt(r.tasks_completed, 10),
        tasksFailed: parseInt(r.tasks_failed, 10),
        lastRunAt: r.last_run_at ?? undefined,
        createdAt: r.created_at,
      }));

      return reply.send(envelope(data, request.id));
    },
  );

  fastify.post(
    '/agents/definitions',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          name: string;
          type?: string;
          capabilities?: string[];
          createdBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name, type = 'custom', capabilities = [], createdBy } = request.body;
      if (!organizationId || !name || !createdBy) {
        return reply.status(400).send({ error: 'organizationId, name, createdBy required' });
      }
      await setTenant(fastify, organizationId);

      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO agents (organization_id, name, agent_type, capabilities, automation_domains, created_by)
         VALUES ($1, $2, $3, $4, '{}', $5)
         RETURNING id, created_at`,
        [organizationId, name, type, capabilities, createdBy],
      );

      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Insert failed' });

      return reply.status(201).send(
        envelope(
          {
            id: row.id,
            name,
            type,
            status: 'active',
            capabilities,
            tasksCompleted: 0,
            tasksFailed: 0,
            createdAt: row.created_at,
          },
          request.id,
        ),
      );
    },
  );

  fastify.put(
    '/agents/definitions/:id/activate',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);

      await fastify.pg.query(
        `UPDATE agents SET is_active = true, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [id, organizationId],
      );
      return reply.send(envelope({ id, status: 'active' }, request.id));
    },
  );

  fastify.put(
    '/agents/definitions/:id/pause',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);

      await fastify.pg.query(
        `UPDATE agents SET is_active = false, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [id, organizationId],
      );
      return reply.send(envelope({ id, status: 'paused' }, request.id));
    },
  );

  fastify.get(
    '/agents/tasks',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; agentId?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, agentId, limit = '20' } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);

      const params: unknown[] = [organizationId, parseInt(limit, 10)];
      const agentFilter = agentId ? `AND agent_id = $3` : '';
      if (agentId) params.push(agentId);

      const result = await fastify.pg.query<{
        id: string;
        agent_id: string;
        trigger_type: string;
        status: string;
        input: Record<string, unknown>;
        output: Record<string, unknown>;
        started_at: string | null;
        completed_at: string | null;
        created_at: string;
      }>(
        `SELECT id, agent_id, trigger_type, status, input, output, started_at, completed_at, created_at
         FROM agent_executions
         WHERE organization_id = $1 ${agentFilter}
         ORDER BY created_at DESC
         LIMIT $2`,
        params,
      );

      const data = result.rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        type: r.trigger_type,
        status: r.status,
        input: r.input,
        output: r.output,
        startedAt: r.started_at ?? undefined,
        completedAt: r.completed_at ?? undefined,
        createdAt: r.created_at,
      }));

      return reply.send(envelope(data, request.id));
    },
  );

  // ── Sprint 27: Identity delegations ──────────────────────────────────────────

  fastify.get(
    '/identity/delegations',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; status?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, status, limit = '50' } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);

      let statusFilter = '';
      if (status === 'active') statusFilter = `AND d.is_active = true AND d.end_at > NOW()`;
      else if (status === 'revoked') statusFilter = `AND d.is_active = false`;
      else if (status === 'expired') statusFilter = `AND d.end_at <= NOW()`;

      const result = await fastify.pg.query<{
        id: string;
        delegator_id: string;
        delegatee_id: string;
        permissions: string[];
        reason: string;
        is_active: boolean;
        end_at: string;
        created_at: string;
        delegator_name: string | null;
        delegatee_name: string | null;
      }>(
        `SELECT
          d.id, d.delegator_id, d.delegatee_id, d.permissions, d.reason, d.is_active, d.end_at, d.created_at,
          du.display_name AS delegator_name,
          tu.display_name AS delegatee_name
        FROM delegations d
        LEFT JOIN users du ON du.id = d.delegator_id
        LEFT JOIN users tu ON tu.id = d.delegatee_id
        WHERE d.organization_id = $1 ${statusFilter}
        ORDER BY d.created_at DESC
        LIMIT $2`,
        [organizationId, parseInt(limit, 10)],
      );

      const now2 = new Date();
      const data = result.rows.map((r) => ({
        id: r.id,
        delegatorId: r.delegator_id,
        delegatorName: r.delegator_name ?? undefined,
        delegateeId: r.delegatee_id,
        delegateeName: r.delegatee_name ?? undefined,
        scope: r.permissions,
        reason: r.reason,
        status: !r.is_active ? 'revoked' : new Date(r.end_at) <= now2 ? 'expired' : 'active',
        expiresAt: r.end_at,
        createdAt: r.created_at,
      }));

      return reply.send(envelope(data, request.id));
    },
  );

  fastify.post(
    '/identity/delegations',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          delegatorId: string;
          delegateeId: string;
          scope: string[];
          reason: string;
          expiresAt?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, delegatorId, delegateeId, scope, reason, expiresAt } = request.body;
      if (!organizationId || !delegatorId || !delegateeId || !reason) {
        return reply
          .status(400)
          .send({ error: 'organizationId, delegatorId, delegateeId, reason required' });
      }
      await setTenant(fastify, organizationId);

      const endAt = expiresAt ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO delegations (organization_id, delegator_id, delegatee_id, permissions, reason, start_at, end_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         RETURNING id, created_at`,
        [organizationId, delegatorId, delegateeId, scope, reason, endAt],
      );

      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Insert failed' });

      return reply.status(201).send(
        envelope(
          {
            id: row.id,
            delegatorId,
            delegateeId,
            scope,
            reason,
            status: 'active',
            expiresAt: endAt,
            createdAt: row.created_at,
          },
          request.id,
        ),
      );
    },
  );

  fastify.put(
    '/identity/delegations/:id/revoke',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);

      await fastify.pg.query(
        `UPDATE delegations SET is_active = false, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [id, organizationId],
      );
      return reply.send(envelope({ id, status: 'revoked' }, request.id));
    },
  );

  // ── Sprint 27: RBAC-style policy rules ───────────────────────────────────────
  // The frontend usePolicyRules hook hits /governance/policies expecting
  // { data: PolicyRule[] } — governance.ts already covers GET/POST for this path.

  // ── Sprint 28: WhatsApp templates ────────────────────────────────────────────

  fastify.get(
    '/communication/templates',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          category?: string;
          status?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, category, status, limit = '50' } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);

      const conditions: string[] = ['organization_id = $1'];
      const params: unknown[] = [organizationId];

      if (category) {
        params.push(category);
        conditions.push(`category = $${String(params.length)}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`status = $${String(params.length)}`);
      }
      params.push(parseInt(limit, 10));
      const limitIdx = params.length;

      const result = await fastify.pg.query<{
        id: string;
        name: string;
        category: string;
        language: string;
        status: string;
        header: string | null;
        body: string;
        footer: string | null;
        buttons: { type: string; text: string; value?: string }[];
        created_at: string;
      }>(
        `SELECT id, name, category, language, status, header, body, footer, buttons, created_at
         FROM wa_templates
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${String(limitIdx)}`,
        params,
      );

      const data = result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        language: r.language,
        status: r.status,
        header: r.header ?? undefined,
        body: r.body,
        footer: r.footer ?? undefined,
        buttons: r.buttons,
        createdAt: r.created_at,
      }));

      return reply.send(envelope(data, request.id));
    },
  );

  fastify.post(
    '/communication/templates',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          name: string;
          category: string;
          language?: string;
          header?: string;
          body: string;
          footer?: string;
          buttons?: { type: string; text: string; value?: string }[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name, category, language = 'en', body, buttons = [] } = request.body;
      if (!organizationId || !name || !category || !body) {
        return reply.status(400).send({ error: 'organizationId, name, category, body required' });
      }
      await setTenant(fastify, organizationId);

      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO wa_templates (organization_id, name, category, language, body, header, footer, buttons)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [
          organizationId,
          name,
          category,
          language,
          body,
          request.body.header ?? null,
          request.body.footer ?? null,
          JSON.stringify(buttons),
        ],
      );

      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Insert failed' });

      return reply.status(201).send(
        envelope(
          {
            id: row.id,
            name,
            category,
            language,
            status: 'PENDING',
            header: request.body.header,
            body,
            footer: request.body.footer,
            buttons,
            createdAt: row.created_at,
          },
          request.id,
        ),
      );
    },
  );

  // ── Sprint 29: Analytics KPI definitions + timeseries ────────────────────────

  fastify.post(
    '/analytics/kpis',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          name: string;
          description?: string;
          formula: string;
          unit?: string;
          target?: number;
          createdBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name, formula, unit, target, createdBy } = request.body;
      if (!organizationId || !name || !formula || !createdBy) {
        return reply
          .status(400)
          .send({ error: 'organizationId, name, formula, createdBy required' });
      }
      await setTenant(fastify, organizationId);

      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO kpis (organization_id, name, description, metric_name, target_value, current_value, unit, period, owner_id)
         VALUES ($1, $2, $3, $4, $5, 0, $6, 'monthly', $7)
         RETURNING id, created_at`,
        [
          organizationId,
          name,
          request.body.description ?? '',
          formula,
          target ?? 0,
          unit ?? '',
          createdBy,
        ],
      );

      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Insert failed' });

      return reply.status(201).send(
        envelope(
          {
            id: row.id,
            name,
            description: request.body.description,
            formula,
            unit,
            target,
            current: 0,
            trend: 'flat',
            createdAt: row.created_at,
          },
          request.id,
        ),
      );
    },
  );

  fastify.get(
    '/analytics/kpis/:kpiId/timeseries',
    async (
      request: FastifyRequest<{
        Params: { kpiId: string };
        Querystring: { organizationId: string; days?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { kpiId } = request.params;
      const { organizationId, days = '30' } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);

      const result = await fastify.pg.query<{
        timestamp: string;
        value: string;
        label: string | null;
      }>(
        `SELECT
          DATE_TRUNC('day', created_at) AS timestamp,
          AVG(current_value)::numeric(10,2) AS value,
          NULL AS label
        FROM kpis
        WHERE organization_id = $1
          AND id = $2
          AND created_at > NOW() - ($3 || ' days')::INTERVAL
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY timestamp ASC`,
        [organizationId, kpiId, days],
      );

      const data = result.rows.map((r) => ({
        timestamp: r.timestamp,
        value: parseFloat(r.value),
        label: r.label ?? undefined,
      }));

      return reply.send(envelope(data, request.id));
    },
  );

  // ── Sprint 34: Workflow definition PATCH ─────────────────────────────────────

  fastify.patch(
    '/workflow-os/definitions/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          organizationId: string;
          name?: string;
          description?: string;
          status?: string;
          definition?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);

      const sets: string[] = [];
      const params: unknown[] = [organizationId, id];

      if (request.body.name !== undefined) {
        params.push(request.body.name);
        sets.push(`name = $${String(params.length)}`);
      }
      if (request.body.description !== undefined) {
        params.push(request.body.description);
        sets.push(`description = $${String(params.length)}`);
      }
      if (request.body.status !== undefined) {
        params.push(request.body.status);
        sets.push(`is_active = ($${String(params.length)} = 'active')`);
      }
      if (request.body.definition !== undefined) {
        params.push(JSON.stringify(request.body.definition));
        sets.push(`definition = $${String(params.length)}`);
      }

      if (sets.length === 0) return reply.status(400).send({ error: 'No fields to update' });
      sets.push(`updated_at = NOW()`);

      const result = await fastify.pg.query<{ id: string; updated_at: string }>(
        `UPDATE workflows SET ${sets.join(', ')}
         WHERE organization_id = $1 AND id = $2
         RETURNING id, updated_at`,
        params,
      );

      const row = result.rows[0];
      if (!row) return reply.status(404).send({ error: 'Workflow definition not found' });

      return reply.send(envelope({ id: row.id, updatedAt: row.updated_at }, request.id));
    },
  );

  // ── Sprint 36: WhatsApp send ──────────────────────────────────────────────────

  fastify.post(
    '/communication/whatsapp/send',
    async (
      request: FastifyRequest<{
        Body: { organizationId: string; to: string; templateName: string; params?: unknown[] };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, to, templateName } = request.body;
      if (!organizationId || !to || !templateName) {
        return reply
          .status(400)
          .send({ error: 'organizationId, to, and templateName are required' });
      }
      await setTenant(fastify, organizationId);
      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO whatsapp_messages
           (organization_id, direction, phone_number, message_type, content, status)
         VALUES ($1, 'outbound', $2, 'template', $3, 'queued')
         RETURNING id, created_at`,
        [organizationId, to, JSON.stringify({ templateName, params: request.body.params ?? [] })],
      );
      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Failed to queue message' });
      return reply
        .status(201)
        .send(envelope({ id: row.id, createdAt: row.created_at }, request.id));
    },
  );

  // ── Sprint 37: Governance reports ─────────────────────────────────────────────

  fastify.post(
    '/governance/reports',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          title: string;
          type: string;
          config?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, title, type } = request.body;
      if (!organizationId || !title || !type) {
        return reply.status(400).send({ error: 'organizationId, title, and type are required' });
      }
      await setTenant(fastify, organizationId);
      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO reports (organization_id, name, type, config, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, created_at`,
        [organizationId, title, type, JSON.stringify(request.body.config ?? {})],
      );
      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Failed to create report' });
      return reply
        .status(201)
        .send(envelope({ id: row.id, createdAt: row.created_at }, request.id));
    },
  );

  // ── Sprint 38: Identity roles alias ───────────────────────────────────────────

  fastify.post(
    '/identity/roles',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          name: string;
          slug: string;
          scope?: string;
          description?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name, slug } = request.body;
      if (!organizationId || !name || !slug) {
        return reply.status(400).send({ error: 'organizationId, name, and slug are required' });
      }
      await setTenant(fastify, organizationId);
      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO roles (organization_id, name, slug, scope, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [
          organizationId,
          name,
          slug,
          request.body.scope ?? 'organization',
          request.body.description ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Failed to create role' });
      return reply
        .status(201)
        .send(envelope({ id: row.id, createdAt: row.created_at }, request.id));
    },
  );

  // ── Sprint 39: People departments / teams aliases ─────────────────────────────

  fastify.post(
    '/people/departments',
    async (
      request: FastifyRequest<{
        Body: { organizationId: string; name: string; description?: string; parentId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name } = request.body;
      if (!organizationId || !name) {
        return reply.status(400).send({ error: 'organizationId and name are required' });
      }
      await setTenant(fastify, organizationId);
      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO departments (organization_id, name, description, parent_department_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [organizationId, name, request.body.description ?? null, request.body.parentId ?? null],
      );
      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Failed to create department' });
      return reply
        .status(201)
        .send(envelope({ id: row.id, createdAt: row.created_at }, request.id));
    },
  );

  fastify.post(
    '/people/teams',
    async (
      request: FastifyRequest<{
        Body: { organizationId: string; name: string; departmentId?: string; description?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name } = request.body;
      if (!organizationId || !name) {
        return reply.status(400).send({ error: 'organizationId and name are required' });
      }
      await setTenant(fastify, organizationId);
      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO teams (organization_id, name, description, department_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [organizationId, name, request.body.description ?? null, request.body.departmentId ?? null],
      );
      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Failed to create team' });
      return reply
        .status(201)
        .send(envelope({ id: row.id, createdAt: row.created_at }, request.id));
    },
  );

  // ── Sprint 40: Knowledge documents ───────────────────────────────────────────

  fastify.post(
    '/knowledge/documents',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          title: string;
          content: string;
          categoryId?: string;
          tags?: string[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, title, content } = request.body;
      if (!organizationId || !title || !content) {
        return reply.status(400).send({ error: 'organizationId, title, and content are required' });
      }
      await setTenant(fastify, organizationId);
      const result = await fastify.pg.query<{ id: string; created_at: string }>(
        `INSERT INTO knowledge_documents
           (organization_id, title, content, category_id, status)
         VALUES ($1, $2, $3, $4, 'draft')
         RETURNING id, created_at`,
        [organizationId, title, content, request.body.categoryId ?? null],
      );
      const row = result.rows[0];
      if (!row) return reply.status(500).send({ error: 'Failed to create document' });
      return reply
        .status(201)
        .send(envelope({ id: row.id, createdAt: row.created_at }, request.id));
    },
  );

  fastify.patch(
    '/knowledge/documents/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string; status?: string; title?: string; content?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }
      await setTenant(fastify, organizationId);
      const sets: string[] = [];
      const params: unknown[] = [organizationId, id];
      if (request.body.status !== undefined) {
        params.push(request.body.status);
        sets.push(`status = $${String(params.length)}`);
      }
      if (request.body.title !== undefined) {
        params.push(request.body.title);
        sets.push(`title = $${String(params.length)}`);
      }
      if (request.body.content !== undefined) {
        params.push(request.body.content);
        sets.push(`content = $${String(params.length)}`);
      }
      if (sets.length === 0) {
        return reply.status(400).send({ error: 'No fields to update' });
      }
      sets.push('updated_at = NOW()');
      const result = await fastify.pg.query<{ id: string; updated_at: string }>(
        `UPDATE knowledge_documents SET ${sets.join(', ')}
         WHERE organization_id = $1 AND id = $2
         RETURNING id, updated_at`,
        params,
      );
      const row = result.rows[0];
      if (!row) return reply.status(404).send({ error: 'Document not found' });
      return reply.send(envelope({ id: row.id, updatedAt: row.updated_at }, request.id));
    },
  );

  // ── Sprint 41: Feature-flag toggle ───────────────────────────────────────────

  fastify.put(
    '/governance/feature-flags/:key',
    async (
      request: FastifyRequest<{
        Params: { key: string };
        Body: { organizationId: string; enabled: boolean };
      }>,
      reply: FastifyReply,
    ) => {
      const { key } = request.params;
      const { organizationId, enabled } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      await setTenant(fastify, organizationId);
      await fastify.pg.query(
        `UPDATE feature_flags SET enabled = $3, updated_at = NOW()
         WHERE organization_id = $1 AND key = $2`,
        [organizationId, key, enabled],
      );
      return reply.send(envelope({ key, enabled }, request.id));
    },
  );

  // ── Sprint 42: Organization settings update ───────────────────────────────────

  fastify.put(
    '/identity/organizations/:orgId',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Body: {
          name?: string;
          timezone?: string;
          locale?: string;
          metadata?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId } = request.params;
      const sets: string[] = [];
      const params: unknown[] = [orgId];
      if (request.body.name !== undefined) {
        params.push(request.body.name);
        sets.push(`name = $${String(params.length)}`);
      }
      if (request.body.timezone !== undefined) {
        params.push(request.body.timezone);
        sets.push(`timezone = $${String(params.length)}`);
      }
      if (request.body.locale !== undefined) {
        params.push(request.body.locale);
        sets.push(`locale = $${String(params.length)}`);
      }
      if (request.body.metadata !== undefined) {
        params.push(JSON.stringify(request.body.metadata));
        sets.push(`metadata = $${String(params.length)}`);
      }
      if (sets.length === 0) return reply.status(400).send({ error: 'No fields to update' });
      sets.push('updated_at = NOW()');
      const result = await fastify.pg.query<{ id: string; updated_at: string }>(
        `UPDATE organizations SET ${sets.join(', ')} WHERE id = $1 RETURNING id, updated_at`,
        params,
      );
      const row = result.rows[0];
      if (!row) return reply.status(404).send({ error: 'Organization not found' });
      return reply.send(envelope({ id: row.id, updatedAt: row.updated_at }, request.id));
    },
  );
}
