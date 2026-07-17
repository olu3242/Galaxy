import { describe, it, expect } from 'vitest';
import { InsightEngine } from '../InsightEngine.js';
import type { AggregatedContext } from '../types.js';

function makeCtx(overrides: Partial<AggregatedContext> = {}): AggregatedContext {
  return {
    workflowStats: { total: 10, active: 10, nearSla: 0, breached: 0 },
    approvalBacklog: { total: 5, stalePending: 0, oldestDays: 0 },
    taskStats: { total: 20, open: 10, overloaded: [] },
    riskSummary: { level: 'low', factors: [] },
    recentIncidents: [],
    complianceStatus: { passed: 5, failed: 0, warnings: 0 },
    ...overrides,
  };
}

describe('InsightEngine', () => {
  it('returns perfect health when no issues', () => {
    const engine = new InsightEngine();
    const result = engine.analyze(makeCtx());
    expect(result.insights).toHaveLength(0);
    expect(result.healthScore).toBe(100);
  });

  describe('SLA breach risk', () => {
    it('generates warning when 31-60% of active runs are near SLA', () => {
      const ctx = makeCtx({
        workflowStats: { total: 10, active: 10, nearSla: 4, breached: 0 },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const insight = result.insights.find((i) => i.category === 'sla_breach_risk');
      expect(insight).toBeDefined();
      expect(insight?.severity).toBe('warning');
      expect(insight?.pointDeduction).toBe(15);
      expect(result.healthScore).toBe(85);
    });

    it('generates critical when >60% of active runs are near SLA', () => {
      const ctx = makeCtx({
        workflowStats: { total: 10, active: 10, nearSla: 7, breached: 0 },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const insight = result.insights.find(
        (i) => i.category === 'sla_breach_risk' && i.title === 'High SLA breach risk',
      );
      expect(insight?.severity).toBe('critical');
      expect(insight?.pointDeduction).toBe(25);
    });

    it('does not trigger SLA risk insight when ratio <= 0.3', () => {
      const ctx = makeCtx({
        workflowStats: { total: 10, active: 10, nearSla: 3, breached: 0 },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const slaInsights = result.insights.filter(
        (i) => i.category === 'sla_breach_risk' && i.title === 'High SLA breach risk',
      );
      expect(slaInsights).toHaveLength(0);
    });

    it('adds breach insight for each breached workflow', () => {
      const ctx = makeCtx({
        workflowStats: { total: 10, active: 5, nearSla: 0, breached: 2 },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const breachInsight = result.insights.find((i) => i.title === 'Active SLA breaches detected');
      expect(breachInsight).toBeDefined();
      expect(breachInsight?.severity).toBe('critical');
      expect(breachInsight?.pointDeduction).toBe(20); // 2 * 10
    });
  });

  describe('approval bottleneck', () => {
    it('generates warning when stalePending 6-15', () => {
      const ctx = makeCtx({
        approvalBacklog: { total: 20, stalePending: 8, oldestDays: 5 },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const insight = result.insights.find((i) => i.category === 'approval_bottleneck');
      expect(insight).toBeDefined();
      expect(insight?.severity).toBe('warning');
      expect(insight?.pointDeduction).toBe(10);
    });

    it('generates critical when stalePending > 15', () => {
      const ctx = makeCtx({
        approvalBacklog: { total: 50, stalePending: 16, oldestDays: 10 },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const insight = result.insights.find((i) => i.category === 'approval_bottleneck');
      expect(insight?.severity).toBe('critical');
      expect(insight?.pointDeduction).toBe(20);
    });

    it('does not trigger when stalePending <= 5', () => {
      const ctx = makeCtx({
        approvalBacklog: { total: 5, stalePending: 5, oldestDays: 2 },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const insight = result.insights.find((i) => i.category === 'approval_bottleneck');
      expect(insight).toBeUndefined();
    });
  });

  describe('task overload', () => {
    it('generates warning for member with 11-20 tasks', () => {
      const ctx = makeCtx({
        taskStats: {
          total: 50,
          open: 30,
          overloaded: [{ memberId: 'member-1', count: 15 }],
        },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const insight = result.insights.find((i) => i.category === 'task_overload');
      expect(insight).toBeDefined();
      expect(insight?.severity).toBe('warning');
      expect(insight?.affectedEntityIds).toContain('member-1');
      expect(insight?.pointDeduction).toBe(8);
    });

    it('generates critical for member with >20 tasks', () => {
      const ctx = makeCtx({
        taskStats: {
          total: 50,
          open: 30,
          overloaded: [{ memberId: 'member-2', count: 25 }],
        },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const insight = result.insights.find((i) => i.category === 'task_overload');
      expect(insight?.severity).toBe('critical');
      expect(insight?.pointDeduction).toBe(15);
    });

    it('generates one insight per overloaded member', () => {
      const ctx = makeCtx({
        taskStats: {
          total: 100,
          open: 60,
          overloaded: [
            { memberId: 'm1', count: 12 },
            { memberId: 'm2', count: 22 },
          ],
        },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const overloadInsights = result.insights.filter((i) => i.category === 'task_overload');
      expect(overloadInsights).toHaveLength(2);
    });
  });

  describe('compliance failures', () => {
    it('generates warning for 1-3 failures', () => {
      const ctx = makeCtx({
        complianceStatus: { passed: 10, failed: 2, warnings: 1 },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const insight = result.insights.find((i) => i.category === 'compliance_issue');
      expect(insight?.severity).toBe('warning');
      expect(insight?.pointDeduction).toBe(10);
    });

    it('generates critical for >3 failures', () => {
      const ctx = makeCtx({
        complianceStatus: { passed: 5, failed: 5, warnings: 0 },
      });
      const engine = new InsightEngine();
      const result = engine.analyze(ctx);

      const insight = result.insights.find((i) => i.category === 'compliance_issue');
      expect(insight?.severity).toBe('critical');
      expect(insight?.pointDeduction).toBe(20);
    });
  });

  it('health score does not go below 0', () => {
    const ctx = makeCtx({
      workflowStats: { total: 10, active: 10, nearSla: 10, breached: 10 },
      approvalBacklog: { total: 50, stalePending: 20, oldestDays: 30 },
      taskStats: {
        total: 100,
        open: 80,
        overloaded: [
          { memberId: 'm1', count: 25 },
          { memberId: 'm2', count: 25 },
          { memberId: 'm3', count: 25 },
        ],
      },
      complianceStatus: { passed: 0, failed: 10, warnings: 0 },
    });
    const engine = new InsightEngine();
    const result = engine.analyze(ctx);
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
  });
});
