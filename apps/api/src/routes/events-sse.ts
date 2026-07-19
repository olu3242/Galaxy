import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Maximum time a client can hold an SSE connection open (5 minutes)
const MAX_DURATION_MS = 5 * 60 * 1000;
// Poll interval — how often we query for new events
const POLL_INTERVAL_MS = 4000;

interface GalaxyEventsRow {
  id: string;
  type: string;
  tenant_id: string;
  actor_type: string | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function eventsSseRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/events/stream',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string; since?: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, since } = request.query;
      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId required' });
      }

      // Set SSE headers — Fastify's reply.raw gives direct access to the Node.js response
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });
      res.flushHeaders();

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      let cursor = since ?? new Date(Date.now() - POLL_INTERVAL_MS).toISOString();
      // Use a box so the closure mutation is visible to the linter
      const state = { closed: false };

      request.socket.on('close', () => {
        state.closed = true;
      });

      // Send an initial heartbeat so the client knows the connection is live
      res.write('event: connected\ndata: {}\n\n');

      const deadline = Date.now() + MAX_DURATION_MS;

      while (!state.closed && Date.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        try {
          const result = await fastify.pg.query<GalaxyEventsRow>(
            `SELECT id, type, tenant_id, actor_type, actor_id, payload, created_at
             FROM galaxy_events
             WHERE tenant_id = $1
               AND created_at > $2
             ORDER BY created_at ASC
             LIMIT 50`,
            [organizationId, cursor],
          );

          if (result.rows.length > 0) {
            for (const row of result.rows) {
              const event = {
                id: row.id,
                type: row.type,
                actor: row.actor_type ? { type: row.actor_type, id: row.actor_id } : null,
                payload: row.payload,
                timestamp: row.created_at,
              };
              res.write(`event: galaxy\ndata: ${JSON.stringify(event)}\nid: ${row.id}\n\n`);
            }
            const lastRow = result.rows[result.rows.length - 1];
            if (lastRow) cursor = lastRow.created_at;
          } else {
            // Heartbeat to keep connection alive through proxies
            res.write(': heartbeat\n\n');
          }
        } catch {
          // Non-fatal — DB hiccup should not close the stream
          res.write(': error\n\n');
        }
      }

      if (!state.closed) {
        // Tell the client to reconnect (stream lifetime expired)
        res.write('event: reconnect\ndata: {}\n\n');
        res.end();
      }

      return reply;
    },
  );
}
