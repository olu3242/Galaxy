import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { IncidentService } from '../incidents/IncidentService.js';
import type { IncidentRow } from '../types.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

const ORG = 'org-222';
const TENANT_CALL = ok([]);

const incidentRow: IncidentRow = {
  id: 'inc-1',
  organization_id: ORG,
  title: 'Database Down',
  description: 'Primary DB unresponsive',
  status: 'open',
  severity: 'sev1',
  acknowledged_at: null,
  resolved_at: null,
  postmortem_url: null,
  metadata: { affectedServices: ['api'] },
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('IncidentService', () => {
  describe('createIncident', () => {
    it('sets tenant context, inserts, and returns incident', async () => {
      const pool = makePool([TENANT_CALL, ok([incidentRow])]);
      const svc = new IncidentService(pool);
      const inc = await svc.createIncident({
        organizationId: ORG,
        title: 'Database Down',
        description: 'Primary DB unresponsive',
        severity: 'sev1',
        metadata: { affectedServices: ['api'] },
      });
      expect(inc.id).toBe('inc-1');
      expect(inc.status).toBe('open');
      expect(inc.severity).toBe('sev1');
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        'SELECT set_config($1, $2, true)',
        ['app.current_tenant', ORG],
      );
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new IncidentService(pool);
      await expect(
        svc.createIncident({
          organizationId: ORG,
          title: 'X',
          description: 'D',
          severity: 'sev4',
          metadata: {},
        }),
      ).rejects.toThrow('Failed to create incident');
    });
  });

  describe('acknowledgeIncident', () => {
    it('returns acknowledged incident', async () => {
      const acked: IncidentRow = {
        ...incidentRow,
        status: 'acknowledged',
        acknowledged_at: '2025-01-01T01:00:00Z',
      };
      const pool = makePool([TENANT_CALL, ok([acked])]);
      const svc = new IncidentService(pool);
      const result = await svc.acknowledgeIncident(ORG, 'inc-1');
      expect(result?.status).toBe('acknowledged');
      expect(result?.acknowledgedAt).toBe('2025-01-01T01:00:00Z');
    });

    it('returns null when incident not found or not open', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new IncidentService(pool);
      const result = await svc.acknowledgeIncident(ORG, 'missing');
      expect(result).toBeNull();
    });
  });

  describe('resolveIncident', () => {
    it('returns resolved incident', async () => {
      const resolved: IncidentRow = {
        ...incidentRow,
        status: 'resolved',
        resolved_at: '2025-01-01T02:00:00Z',
      };
      const pool = makePool([TENANT_CALL, ok([resolved])]);
      const svc = new IncidentService(pool);
      const result = await svc.resolveIncident(ORG, 'inc-1');
      expect(result?.status).toBe('resolved');
      expect(result?.resolvedAt).toBe('2025-01-01T02:00:00Z');
    });

    it('returns null when incident not found', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new IncidentService(pool);
      const result = await svc.resolveIncident(ORG, 'missing');
      expect(result).toBeNull();
    });
  });

  describe('addPostmortem', () => {
    it('sets postmortem URL and returns updated incident', async () => {
      const withPm: IncidentRow = { ...incidentRow, postmortem_url: 'https://docs.example.com/pm' };
      const pool = makePool([TENANT_CALL, ok([withPm])]);
      const svc = new IncidentService(pool);
      const result = await svc.addPostmortem(ORG, 'inc-1', 'https://docs.example.com/pm');
      expect(result?.postmortemUrl).toBe('https://docs.example.com/pm');
    });

    it('returns null when incident not found', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new IncidentService(pool);
      const result = await svc.addPostmortem(ORG, 'missing', 'https://pm.url');
      expect(result).toBeNull();
    });
  });

  describe('getIncident', () => {
    it('returns incident by id', async () => {
      const pool = makePool([TENANT_CALL, ok([incidentRow])]);
      const svc = new IncidentService(pool);
      const result = await svc.getIncident(ORG, 'inc-1');
      expect(result?.id).toBe('inc-1');
      expect(result?.title).toBe('Database Down');
    });

    it('returns null when not found', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new IncidentService(pool);
      const result = await svc.getIncident(ORG, 'missing');
      expect(result).toBeNull();
    });
  });

  describe('listIncidents', () => {
    it('returns all incidents without filters', async () => {
      const pool = makePool([TENANT_CALL, ok([incidentRow])]);
      const svc = new IncidentService(pool);
      const list = await svc.listIncidents(ORG, {});
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe('inc-1');
    });

    it('applies status filter', async () => {
      const pool = makePool([TENANT_CALL, ok([incidentRow])]);
      const svc = new IncidentService(pool);
      await svc.listIncidents(ORG, { status: 'open' });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('status = $2'),
        expect.arrayContaining(['open']),
      );
    });

    it('applies severity filter', async () => {
      const pool = makePool([TENANT_CALL, ok([incidentRow])]);
      const svc = new IncidentService(pool);
      await svc.listIncidents(ORG, { severity: 'sev1' });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('severity = $'),
        expect.arrayContaining(['sev1']),
      );
    });

    it('applies limit and offset', async () => {
      const pool = makePool([TENANT_CALL, ok([])]);
      const svc = new IncidentService(pool);
      await svc.listIncidents(ORG, { limit: 5, offset: 10 });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([5, 10]),
      );
    });

    it('stacks status + severity filters', async () => {
      const pool = makePool([TENANT_CALL, ok([incidentRow])]);
      const svc = new IncidentService(pool);
      await svc.listIncidents(ORG, { status: 'open', severity: 'sev2' });
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('severity = $3'),
        expect.arrayContaining(['open', 'sev2']),
      );
    });
  });
});
