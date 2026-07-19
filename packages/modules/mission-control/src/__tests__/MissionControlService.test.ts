import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { MissionControlService } from '../dashboard/MissionControlService.js';

const ORG = '00000000-0000-0000-0000-000000000004';

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

describe('MissionControlService.getOperationalSnapshot', () => {
  it('returns parsed counts from parallel queries', async () => {
    // call 0: setTenant
    // call 1: workflows count
    // call 2: conversations count
    // call 3: agents count
    // call 4: health score
    const pool = makePool([
      ok([]),
      ok([{ count: '5' }]),
      ok([{ count: '3' }]),
      ok([{ count: '2' }]),
      ok([{ score: 82 }]),
    ]);
    const svc = new MissionControlService(pool);
    const snap = await svc.getOperationalSnapshot(ORG);
    expect(snap.organizationId).toBe(ORG);
    expect(snap.activeWorkflows).toBe(5);
    expect(snap.openConversations).toBe(3);
    expect(snap.activeAgents).toBe(2);
    expect(snap.healthScore).toBe(82);
    expect(snap.pendingApprovals).toBe(0);
  });

  it('defaults to 0/50 when counts and health are empty', async () => {
    const pool = makePool([ok([]), ok([]), ok([]), ok([]), ok([])]);
    const svc = new MissionControlService(pool);
    const snap = await svc.getOperationalSnapshot(ORG);
    expect(snap.activeWorkflows).toBe(0);
    expect(snap.healthScore).toBe(50);
  });
});

describe('MissionControlService.getLearningSnapshot', () => {
  it('returns total and applied insight counts', async () => {
    // call 0: setTenant, call 1: SELECT
    const pool = makePool([ok([]), ok([{ total: '10', applied: '4' }])]);
    const svc = new MissionControlService(pool);
    const snap = await svc.getLearningSnapshot(ORG);
    expect(snap.totalInsights).toBe(10);
    expect(snap.appliedInsights).toBe(4);
    expect(snap.pendingImprovements).toBe(0);
  });

  it('defaults to 0 when no insights row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MissionControlService(pool);
    const snap = await svc.getLearningSnapshot(ORG);
    expect(snap.totalInsights).toBe(0);
    expect(snap.appliedInsights).toBe(0);
  });
});

describe('MissionControlService.getGuardianSnapshot', () => {
  it('aggregates incident statuses and risk alert count', async () => {
    // call 0: setTenant
    // call 1: incidents grouped by status
    // call 2: risk alerts count
    const pool = makePool([
      ok([]),
      ok([
        { status: 'detected', count: '2' },
        { status: 'healed', count: '1' },
        { status: 'escalated', count: '1' },
      ]),
      ok([{ count: '3' }]),
    ]);
    const svc = new MissionControlService(pool);
    const snap = await svc.getGuardianSnapshot(ORG);
    expect(snap.activeIncidents).toBe(2);
    expect(snap.healedToday).toBe(1);
    expect(snap.escalatedToday).toBe(1);
    expect(snap.riskAlerts).toBe(3);
  });

  it('returns zeros when no incidents or alerts', async () => {
    const pool = makePool([ok([]), ok([]), ok([])]);
    const svc = new MissionControlService(pool);
    const snap = await svc.getGuardianSnapshot(ORG);
    expect(snap.activeIncidents).toBe(0);
    expect(snap.riskAlerts).toBe(0);
  });

  it('counts diagnosing incidents as active', async () => {
    const pool = makePool([
      ok([]),
      ok([{ status: 'diagnosing', count: '3' }]),
      ok([{ count: '0' }]),
    ]);
    const svc = new MissionControlService(pool);
    const snap = await svc.getGuardianSnapshot(ORG);
    expect(snap.activeIncidents).toBe(3);
  });
});

describe('MissionControlService.getDigitalTwinSnapshot', () => {
  it('returns node and relationship counts with last snapshot info', async () => {
    const snapDate = new Date('2024-06-01');
    // call 0: setTenant
    // call 1: nodes count
    // call 2: relationships count
    // call 3: twin_snapshots
    const pool = makePool([
      ok([]),
      ok([{ count: '50' }]),
      ok([{ count: '120' }]),
      ok([{ health_score: 78, created_at: snapDate }]),
    ]);
    const svc = new MissionControlService(pool);
    const snap = await svc.getDigitalTwinSnapshot(ORG);
    expect(snap.nodeCount).toBe(50);
    expect(snap.relationshipCount).toBe(120);
    expect(snap.overallHealthScore).toBe(78);
    expect(snap.lastSnapshotAt).toEqual(snapDate);
  });

  it('returns zeroed snapshot when no data', async () => {
    const pool = makePool([ok([]), ok([]), ok([]), ok([])]);
    const svc = new MissionControlService(pool);
    const snap = await svc.getDigitalTwinSnapshot(ORG);
    expect(snap.nodeCount).toBe(0);
    expect(snap.overallHealthScore).toBe(0);
    expect(snap.lastSnapshotAt).toBeUndefined();
  });
});

describe('MissionControlService.getDashboard', () => {
  it('returns all four snapshots in one call', async () => {
    // getDashboard calls all 4 getX methods in Promise.all.
    // Each method begins with setTenant (await), so all 4 setTenants fire
    // before any data queries resume. Execution order:
    //   call 0: operational setTenant
    //   call 1: learning setTenant
    //   call 2: guardian setTenant
    //   call 3: digitalTwin setTenant
    // Then each method's internal Promise.all fires in order of microtask resolution:
    //   calls 4-7: operational 4 data queries
    //   call 8: learning 1 data query
    //   calls 9-10: guardian 2 data queries
    //   calls 11-13: digitalTwin 3 data queries
    const pool = makePool([
      ok([]), // 0: operational setTenant
      ok([]), // 1: learning setTenant
      ok([]), // 2: guardian setTenant
      ok([]), // 3: digitalTwin setTenant
      // operational 4 parallel queries
      ok([{ count: '1' }]), // 4: workflows
      ok([{ count: '2' }]), // 5: conversations
      ok([{ count: '0' }]), // 6: agents
      ok([{ score: 70 }]), // 7: health
      // learning 1 query
      ok([{ total: '5', applied: '2' }]), // 8
      // guardian 2 parallel queries
      ok([]), // 9: incidents
      ok([{ count: '0' }]), // 10: risk alerts
      // digitalTwin 3 parallel queries
      ok([{ count: '10' }]), // 11: nodes
      ok([{ count: '20' }]), // 12: relationships
      ok([]), // 13: snapshots
    ]);
    const svc = new MissionControlService(pool);
    const dashboard = await svc.getDashboard(ORG);
    expect(dashboard.operational.activeWorkflows).toBe(1);
    expect(dashboard.learning.totalInsights).toBe(5);
    expect(dashboard.guardian.riskAlerts).toBe(0);
    expect(dashboard.digitalTwin.nodeCount).toBe(10);
    expect(dashboard.generatedAt).toBeInstanceOf(Date);
  });
});
