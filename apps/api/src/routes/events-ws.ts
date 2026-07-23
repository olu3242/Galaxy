import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import type WebSocket from 'ws';

const POLL_INTERVAL_MS = 3000;
const MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface GalaxyEventsRow {
  id: string;
  type: string;
  tenant_id: string;
  actor_type: string | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * WebSocket real-time event stream.
 *
 * Clients connect to: ws://host/api/v1/events/ws?organizationId=<id>&since=<iso>
 *
 * The server streams new GalaxyEvents as JSON messages:
 *   { type: "event", data: GalaxyEventsRow }
 * and sends a keepalive ping every poll interval:
 *   { type: "ping", ts: <iso> }
 *
 * Clients can send { type: "ping" } and receive { type: "pong" }.
 *
 * The connection closes automatically after MAX_DURATION_MS.
 */
export async function eventsWsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/events/ws', { websocket: true }, (connection: SocketStream, request) => {
    const socket = connection.socket as WebSocket;
    const query = request.query as { organizationId?: string; since?: string };
    const { organizationId, since } = query;

    if (!organizationId) {
      socket.send(JSON.stringify({ type: 'error', message: 'organizationId required' }));
      socket.close(1008, 'organizationId required');
      return;
    }

    let cursor = since ?? new Date(Date.now() - POLL_INTERVAL_MS).toISOString();
    // Box so closure mutation is visible to the linter
    const state = { open: true };

    const deadline = setTimeout(() => {
      if (state.open) {
        socket.send(JSON.stringify({ type: 'close', reason: 'max_duration_reached' }));
        socket.close(1000, 'max duration reached');
      }
    }, MAX_DURATION_MS);

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string };
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: new Date().toISOString() }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on('close', () => {
      state.open = false;
      clearTimeout(deadline);
      clearInterval(poll);
    });

    socket.on('error', () => {
      state.open = false;
      clearTimeout(deadline);
      clearInterval(poll);
    });

    const poll = setInterval(() => {
      if (!state.open) return;

      void (async () => {
        try {
          await fastify.pg.query('SELECT set_config($1, $2, true)', [
            'app.current_tenant',
            organizationId,
          ]);

          const result = await fastify.pg.query<GalaxyEventsRow>(
            `SELECT id, type, tenant_id, actor_type, actor_id, payload, created_at
               FROM galaxy_events
               WHERE tenant_id = $1
                 AND created_at > $2
               ORDER BY created_at ASC
               LIMIT 50`,
            [organizationId, cursor],
          );

          for (const row of result.rows) {
            if (!state.open) break;
            cursor = row.created_at;
            socket.send(JSON.stringify({ type: 'event', data: row }));
          }

          if (state.open) {
            socket.send(JSON.stringify({ type: 'ping', ts: new Date().toISOString() }));
          }
        } catch {
          // DB error — log but don't crash the connection
        }
      })();
    }, POLL_INTERVAL_MS);
  });
}
