import { describe, it, expect } from 'vitest';
import { RecommendationEngine } from '../recommendations/RecommendationEngine.js';
import type { AgentContextSnapshot } from '../types.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const AGENT_ID = '00000000-0000-0000-0000-000000000010';
const NOW = '2026-01-01T00:00:00.000Z';

function makeContext(
  overrides: Partial<Pick<AgentContextSnapshot, 'workflowRuns' | 'pendingApprovals'>>,
): AgentContextSnapshot {
  return {
    id: 'snap-1',
    organizationId: ORG,
    agentId: AGENT_ID,
    contextData: {},
    workflowRuns: overrides.workflowRuns ?? [],
    pendingApprovals: overrides.pendingApprovals ?? [],
    recentDecisions: [],
    createdAt: NOW,
  };
}

describe('RecommendationEngine', () => {
  describe('generate', () => {
    it('returns a smooth-operations insight when everything is fine', () => {
      const engine = new RecommendationEngine();
      const recs = engine.generate(makeContext({}), 0);

      expect(recs).toHaveLength(1);
      expect(recs[0]?.type).toBe('insight');
      expect(recs[0]?.title).toContain('smoothly');
    });

    it('generates an alert for escalated workflows', () => {
      const engine = new RecommendationEngine();
      const ctx = makeContext({
        workflowRuns: [{ status: 'escalated' }, { status: 'escalated' }],
      });

      const recs = engine.generate(ctx, 0);
      const alert = recs.find((r) => r.title.includes('escalated'));
      expect(alert).toBeDefined();
      expect(alert?.type).toBe('alert');
      expect(alert?.priority).toBe('urgent');
      expect(alert?.metadata).toMatchObject({ count: 2 });
    });

    it('generates an alert for SLA-breached workflows', () => {
      const engine = new RecommendationEngine();
      const past = new Date(Date.now() - 3_600_000).toISOString();
      const ctx = makeContext({
        workflowRuns: [{ status: 'running', sla_due_at: past }],
      });

      const recs = engine.generate(ctx, 0);
      const slaAlert = recs.find((r) => r.title.includes('SLA breach'));
      expect(slaAlert).toBeDefined();
      expect(slaAlert?.priority).toBe('urgent');
    });

    it('generates a high-priority alert for workflows approaching SLA', () => {
      const engine = new RecommendationEngine();
      const soon = new Date(Date.now() + 2 * 3_600_000).toISOString();
      const ctx = makeContext({
        workflowRuns: [{ status: 'running', sla_due_at: soon }],
      });

      const recs = engine.generate(ctx, 0);
      const nearAlert = recs.find((r) => r.title.includes('approaching SLA'));
      expect(nearAlert).toBeDefined();
      expect(nearAlert?.priority).toBe('high');
    });

    it('generates an insight for >5 pending approvals', () => {
      const engine = new RecommendationEngine();
      const approvals = Array.from({ length: 6 }, (_, i) => ({ id: String(i) }));
      const ctx = makeContext({ pendingApprovals: approvals });

      const recs = engine.generate(ctx, 0);
      const approvalRec = recs.find((r) => r.title.includes('approvals'));
      expect(approvalRec).toBeDefined();
      expect(approvalRec?.type).toBe('insight');
      expect(approvalRec?.priority).toBe('medium');
    });

    it('does not generate approval insight for <=5 pending approvals', () => {
      const engine = new RecommendationEngine();
      const approvals = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
      const ctx = makeContext({ pendingApprovals: approvals });

      const recs = engine.generate(ctx, 0);
      expect(recs.find((r) => r.title.includes('approvals'))).toBeUndefined();
    });

    it('generates a high-risk alert when riskScore >= 70', () => {
      const engine = new RecommendationEngine();
      const recs = engine.generate(makeContext({}), 75);

      const riskRec = recs.find((r) => r.title.includes('risk score'));
      expect(riskRec).toBeDefined();
      expect(riskRec?.priority).toBe('high');
    });

    it('generates an optimization recommendation for high-volume domain', () => {
      const engine = new RecommendationEngine();
      const runs = Array.from({ length: 4 }, () => ({
        status: 'running',
        automation_domain: 'finance',
      }));
      const ctx = makeContext({ workflowRuns: runs });

      const recs = engine.generate(ctx, 0);
      const optRec = recs.find((r) => r.type === 'optimization');
      expect(optRec).toBeDefined();
      expect(optRec?.automationDomain).toBe('finance');
    });

    it('assigns unique ids to all recommendations', () => {
      const engine = new RecommendationEngine();
      const past = new Date(Date.now() - 3_600_000).toISOString();
      const ctx = makeContext({
        workflowRuns: [{ status: 'escalated' }, { status: 'running', sla_due_at: past }],
        pendingApprovals: Array.from({ length: 6 }, (_, i) => ({ id: String(i) })),
      });

      const recs = engine.generate(ctx, 75);
      const ids = recs.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
