import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { HealingIncidentService } from '../incidents/HealingIncidentService.js';

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

const ORG = 'org-healing';

function makeIncidentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    organization_id: ORG,
    level: 'workflow',
    trigger: 'automatic',
    status: 'detected',
    description: 'Test incident',
    diagnosis: null,
    resolution: null,
    affected_resource_type: null,
    affected_resource_id: null,
    attempt_count: 0,
    detected_at: new Date('2026-07-01'),
    healed_at: null,
    failed_at: null,
    ...overrides,
  };
}

describe('HealingIncidentService', () => {
  describe('detectIncident', () => {
    it('sets tenant context before inserting', async () => {
      const row = makeIncidentRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingIncidentService(pool);
      await svc.detectIncident(ORG, 'workflow', 'Test incident');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns mapped incident on success', async () => {
      const row = makeIncidentRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingIncidentService(pool);
      const incident = await svc.detectIncident(ORG, 'workflow', 'Test incident');
      expect(incident.id).toBe('inc-1');
      expect(incident.level).toBe('workflow');
      expect(incident.status).toBe('detected');
      expect(incident.attemptCount).toBe(0);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HealingIncidentService(pool);
      await expect(svc.detectIncident(ORG, 'queue', 'desc')).rejects.toThrow('Failed to create');
    });

    it('maps optional fields when present', async () => {
      const row = makeIncidentRow({
        diagnosis: 'some diagnosis',
        resolution: 'some resolution',
        affected_resource_type: 'workflow_run',
        affected_resource_id: 'run-42',
        healed_at: new Date('2026-07-02'),
      });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingIncidentService(pool);
      const incident = await svc.detectIncident(ORG, 'workflow', 'desc', 'workflow_run', 'run-42');
      expect(incident.diagnosis).toBe('some diagnosis');
      expect(incident.resolution).toBe('some resolution');
      expect(incident.affectedResourceType).toBe('workflow_run');
      expect(incident.affectedResourceId).toBe('run-42');
    });
  });

  describe('getIncident', () => {
    it('throws when incident not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HealingIncidentService(pool);
      await expect(svc.getIncident(ORG, 'missing-id')).rejects.toThrow('not found');
    });

    it('returns incident when found', async () => {
      const row = makeIncidentRow({ id: 'inc-2' });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingIncidentService(pool);
      const incident = await svc.getIncident(ORG, 'inc-2');
      expect(incident.id).toBe('inc-2');
    });
  });

  describe('listIncidents', () => {
    it('returns all incidents for org', async () => {
      const rows = [makeIncidentRow({ id: 'a' }), makeIncidentRow({ id: 'b' })];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new HealingIncidentService(pool);
      const incidents = await svc.listIncidents(ORG);
      expect(incidents).toHaveLength(2);
    });
  });

  describe('diagnose', () => {
    it('returns incident with updated status', async () => {
      const row = makeIncidentRow({ status: 'diagnosing', diagnosis: 'Root cause found' });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingIncidentService(pool);
      const incident = await svc.diagnose(ORG, 'inc-1', 'Root cause found');
      expect(incident.status).toBe('diagnosing');
    });
  });

  describe('heal', () => {
    it('returns healed incident', async () => {
      const row = makeIncidentRow({
        status: 'healed',
        resolution: 'Auto-fixed',
        healed_at: new Date(),
      });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingIncidentService(pool);
      const incident = await svc.heal(ORG, 'inc-1', 'Auto-fixed');
      expect(incident.status).toBe('healed');
      expect(incident.resolution).toBe('Auto-fixed');
    });
  });

  describe('escalate', () => {
    it('returns escalated incident', async () => {
      const row = makeIncidentRow({ status: 'escalated' });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingIncidentService(pool);
      const incident = await svc.escalate(ORG, 'inc-1');
      expect(incident.status).toBe('escalated');
    });
  });

  describe('failIncident', () => {
    it('returns failed incident', async () => {
      const row = makeIncidentRow({ status: 'failed', attempt_count: 1, failed_at: new Date() });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new HealingIncidentService(pool);
      const incident = await svc.failIncident(ORG, 'inc-1');
      expect(incident.status).toBe('failed');
      expect(incident.attemptCount).toBe(1);
    });
  });
});
