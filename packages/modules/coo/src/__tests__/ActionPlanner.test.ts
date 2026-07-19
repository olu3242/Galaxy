import { describe, it, expect } from 'vitest';
import { ActionPlanner } from '../ActionPlanner.js';
import type { Insight } from '../types.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const CORR_ID = 'corr-0000-0000-0000-000000000001';

function makeInsight(overrides: Partial<Insight>): Insight {
  return {
    id: 'insight-1',
    category: 'general',
    severity: 'info',
    title: 'Test',
    description: 'Test description',
    affectedEntityIds: [],
    pointDeduction: 0,
    ...overrides,
  };
}

describe('ActionPlanner', () => {
  describe('planActions', () => {
    it('returns empty array when no insights', () => {
      const planner = new ActionPlanner();
      expect(planner.planActions(ORG_ID, [], CORR_ID)).toEqual([]);
    });

    it('creates escalate_workflow action for critical SLA breach', () => {
      const insight = makeInsight({ category: 'sla_breach_risk', severity: 'critical' });
      const planner = new ActionPlanner();
      const actions = planner.planActions(ORG_ID, [insight], CORR_ID);

      expect(actions).toHaveLength(1);
      const action = actions[0];
      expect(action?.actionType).toBe('escalate_workflow');
      expect(action?.autonomyLevel).toBe('notify');
      expect(action?.organizationId).toBe(ORG_ID);
      expect(action?.correlationId).toBe(CORR_ID);
      expect(action?.payload).toEqual({ insightId: 'insight-1' });
    });

    it('does NOT create action for warning SLA breach', () => {
      const insight = makeInsight({ category: 'sla_breach_risk', severity: 'warning' });
      const planner = new ActionPlanner();
      const actions = planner.planActions(ORG_ID, [insight], CORR_ID);
      expect(actions.filter((a) => a.actionType === 'escalate_workflow')).toHaveLength(0);
    });

    it('creates notify_approver action for approval_bottleneck', () => {
      const insight = makeInsight({ category: 'approval_bottleneck', severity: 'warning' });
      const planner = new ActionPlanner();
      const actions = planner.planActions(ORG_ID, [insight], CORR_ID);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.actionType).toBe('notify_approver');
    });

    it('creates reassign_task action for task_overload with memberId', () => {
      const insight = makeInsight({
        category: 'task_overload',
        severity: 'warning',
        affectedEntityIds: ['member-123'],
      });
      const planner = new ActionPlanner();
      const actions = planner.planActions(ORG_ID, [insight], CORR_ID);

      expect(actions).toHaveLength(1);
      const action = actions[0];
      expect(action?.actionType).toBe('reassign_task');
      expect(action?.autonomyLevel).toBe('suggest');
      expect(action?.payload).toMatchObject({ memberId: 'member-123' });
    });

    it('uses empty string as memberId when affectedEntityIds is empty', () => {
      const insight = makeInsight({
        category: 'task_overload',
        severity: 'warning',
        affectedEntityIds: [],
      });
      const planner = new ActionPlanner();
      const actions = planner.planActions(ORG_ID, [insight], CORR_ID);
      expect(actions[0]?.payload).toMatchObject({ memberId: '' });
    });

    it('creates alert_compliance action for compliance_issue', () => {
      const insight = makeInsight({ category: 'compliance_issue', severity: 'warning' });
      const planner = new ActionPlanner();
      const actions = planner.planActions(ORG_ID, [insight], CORR_ID);

      expect(actions).toHaveLength(1);
      expect(actions[0]?.actionType).toBe('alert_compliance');
      expect(actions[0]?.autonomyLevel).toBe('notify');
    });

    it('generates no action for general category', () => {
      const insight = makeInsight({ category: 'general' });
      const planner = new ActionPlanner();
      const actions = planner.planActions(ORG_ID, [insight], CORR_ID);
      expect(actions).toHaveLength(0);
    });

    it('generates multiple actions for multiple insights', () => {
      const insights = [
        makeInsight({ id: 'i1', category: 'sla_breach_risk', severity: 'critical' }),
        makeInsight({ id: 'i2', category: 'approval_bottleneck', severity: 'warning' }),
        makeInsight({ id: 'i3', category: 'compliance_issue', severity: 'warning' }),
      ];
      const planner = new ActionPlanner();
      const actions = planner.planActions(ORG_ID, insights, CORR_ID);
      expect(actions).toHaveLength(3);
    });
  });

  describe('toPartialCOOAction', () => {
    it('converts CreateActionInput to partial COOAction with pending status', () => {
      const planner = new ActionPlanner();
      const input = {
        organizationId: ORG_ID,
        briefingId: null,
        actionType: 'notify_approver' as const,
        subject: 'Notify approvers',
        payload: {},
        autonomyLevel: 'notify' as const,
        reasoning: 'bottleneck detected',
        correlationId: CORR_ID,
      };
      const partial = planner.toPartialCOOAction(input);

      expect(partial.status).toBe('pending');
      expect(partial.approvedBy).toBeNull();
      expect(partial.approvedAt).toBeNull();
      expect(partial.rejectedBy).toBeNull();
      expect(partial.rejectionReason).toBeNull();
      expect(partial.executedAt).toBeNull();
      expect(partial.actionType).toBe('notify_approver');
      expect(partial.autonomyLevel).toBe('notify');
    });
  });
});
