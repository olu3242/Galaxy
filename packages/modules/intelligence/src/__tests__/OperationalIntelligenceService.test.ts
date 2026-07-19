/**
 * Intelligence OS — OperationalIntelligenceService unit tests
 *
 * Covers: handleEvent — workflow.completed · task.completed · automation.executed ·
 *         message.sent · notification.sent · approval.granted · approval.rejected ·
 *         member.created · member.updated · audit.recorded · unknown event type
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OperationalIntelligenceService } from '../services/OperationalIntelligenceService.js';
import type { HealthScoreService } from '../services/HealthScoreService.js';
import type { InsightService } from '../services/InsightService.js';
import type { RiskDetectionService } from '../services/RiskDetectionService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const CORR = '00000000-0000-0000-0000-000000000099';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[] = []): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

function makeHealthScoreService(score = 0.85): HealthScoreService {
  return {
    computeWorkflowEffectiveness: vi.fn().mockResolvedValue({ score }),
    computeOrganizationHealth: vi.fn().mockResolvedValue({ score }),
    computeCommunicationEffectiveness: vi.fn().mockResolvedValue({ score }),
    computeMemberEngagement: vi.fn().mockResolvedValue({ score }),
  } as unknown as HealthScoreService;
}

function makeInsightService(): InsightService {
  return {
    generateInsights: vi.fn().mockResolvedValue({ id: 'snapshot-1' }),
  } as unknown as InsightService;
}

function makeRiskDetectionService(risks: unknown[] = []): RiskDetectionService {
  return {
    detectRisks: vi.fn().mockResolvedValue(risks),
  } as unknown as RiskDetectionService;
}

// ─── handleEvent ─────────────────────────────────────────────────────────────

describe('OperationalIntelligenceService.handleEvent — workflow.completed', () => {
  it('calls computeWorkflowEffectiveness and generates workflow insight', async () => {
    const pool = makePool();
    const health = makeHealthScoreService(0.9);
    const insight = makeInsightService();
    const risk = makeRiskDetectionService();
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'workflow.completed',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(health.computeWorkflowEffectiveness).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'workflow', { score: 0.9 });
  });
});

describe('OperationalIntelligenceService.handleEvent — task.completed', () => {
  it('calls computeOrganizationHealth and generates operational insight', async () => {
    const pool = makePool();
    const health = makeHealthScoreService(0.75);
    const insight = makeInsightService();
    const risk = makeRiskDetectionService();
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'task.completed',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(health.computeOrganizationHealth).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'operational', { score: 0.75 });
  });
});

describe('OperationalIntelligenceService.handleEvent — automation.executed', () => {
  it('uses same handler as task.completed (operational insight)', async () => {
    const pool = makePool();
    const health = makeHealthScoreService(0.6);
    const insight = makeInsightService();
    const risk = makeRiskDetectionService();
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'automation.executed',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(health.computeOrganizationHealth).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'operational', { score: 0.6 });
  });
});

describe('OperationalIntelligenceService.handleEvent — message.sent', () => {
  it('calls computeCommunicationEffectiveness and generates communication insight', async () => {
    const pool = makePool();
    const health = makeHealthScoreService(0.8);
    const insight = makeInsightService();
    const risk = makeRiskDetectionService();
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'message.sent',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(health.computeCommunicationEffectiveness).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'communication', { score: 0.8 });
  });
});

describe('OperationalIntelligenceService.handleEvent — notification.sent', () => {
  it('uses same handler as message.sent', async () => {
    const pool = makePool();
    const health = makeHealthScoreService(0.7);
    const insight = makeInsightService();
    const risk = makeRiskDetectionService();
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'notification.sent',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(health.computeCommunicationEffectiveness).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'communication', { score: 0.7 });
  });
});

describe('OperationalIntelligenceService.handleEvent — approval.granted', () => {
  it('calls detectRisks; generates risk insight when risks found', async () => {
    const pool = makePool();
    const health = makeHealthScoreService();
    const insight = makeInsightService();
    const risk = makeRiskDetectionService([{ id: 'r1' }, { id: 'r2' }]);
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'approval.granted',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(risk.detectRisks).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'risk', { riskCount: 2 });
  });

  it('does not generate insight when no risks detected', async () => {
    const pool = makePool();
    const health = makeHealthScoreService();
    const insight = makeInsightService();
    const risk = makeRiskDetectionService([]);
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'approval.granted',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(risk.detectRisks).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).not.toHaveBeenCalled();
  });
});

describe('OperationalIntelligenceService.handleEvent — approval.rejected', () => {
  it('calls detectRisks; generates risk insight when risks found', async () => {
    const pool = makePool();
    const health = makeHealthScoreService();
    const insight = makeInsightService();
    const risk = makeRiskDetectionService([{ id: 'r1' }]);
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'approval.rejected',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(risk.detectRisks).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'risk', { riskCount: 1 });
  });
});

describe('OperationalIntelligenceService.handleEvent — member.created', () => {
  it('calls computeMemberEngagement and generates engagement insight', async () => {
    const pool = makePool();
    const health = makeHealthScoreService(0.55);
    const insight = makeInsightService();
    const risk = makeRiskDetectionService();
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'member.created',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(health.computeMemberEngagement).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'engagement', { score: 0.55 });
  });
});

describe('OperationalIntelligenceService.handleEvent — member.updated', () => {
  it('uses same handler as member.created', async () => {
    const pool = makePool();
    const health = makeHealthScoreService(0.65);
    const insight = makeInsightService();
    const risk = makeRiskDetectionService();
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'member.updated',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    expect(health.computeMemberEngagement).toHaveBeenCalledWith(ORG);
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'engagement', { score: 0.65 });
  });
});

describe('OperationalIntelligenceService.handleEvent — audit.recorded', () => {
  it('sets tenant context and generates compliance insight', async () => {
    const pool = makePool([ok([])]);
    const health = makeHealthScoreService();
    const insight = makeInsightService();
    const risk = makeRiskDetectionService();
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    const payload = { action: 'member.login', actorId: 'u1' };
    await svc.handleEvent({ type: 'audit.recorded', tenantId: ORG, correlationId: CORR, payload });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
    expect(insight.generateInsights).toHaveBeenCalledWith(ORG, 'compliance', { event: payload });
  });
});

describe('OperationalIntelligenceService.handleEvent — unknown event', () => {
  it('sets tenant context only and does not call any sub-service', async () => {
    const pool = makePool([ok([])]);
    const health = makeHealthScoreService();
    const insight = makeInsightService();
    const risk = makeRiskDetectionService();
    const svc = new OperationalIntelligenceService(pool, health, insight, risk);

    await svc.handleEvent({
      type: 'some.unknown.event',
      tenantId: ORG,
      correlationId: CORR,
      payload: {},
    });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
    expect(insight.generateInsights).not.toHaveBeenCalled();
    expect(risk.detectRisks).not.toHaveBeenCalled();
  });
});
