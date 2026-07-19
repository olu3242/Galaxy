import { describe, it, expect } from 'vitest';
import { BriefingComposer } from '../BriefingComposer.js';
import type { Insight } from '../types.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const CORR_ID = 'corr-0000-0000-0000-000000000001';

function makeInsight(overrides: Partial<Insight>): Insight {
  return {
    id: 'insight-1',
    category: 'sla_breach_risk',
    severity: 'warning',
    title: 'SLA Warning',
    description: 'SLA is at risk.',
    affectedEntityIds: [],
    pointDeduction: 10,
    ...overrides,
  };
}

describe('BriefingComposer', () => {
  it('composes briefing with no insights — healthy state', () => {
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 100, [], CORR_ID);

    expect(briefing.organizationId).toBe(ORG_ID);
    expect(briefing.healthScore).toBe(100);
    expect(briefing.criticalAlertCount).toBe(0);
    expect(briefing.pendingActionCount).toBe(0);
    expect(briefing.briefingData.alerts).toHaveLength(0);
    expect(briefing.briefingData.items).toHaveLength(0);
    expect(briefing.briefingData.insights).toHaveLength(0);
    expect(briefing.briefingData.actions).toHaveLength(0);
    expect(briefing.executiveSummary).toContain('healthy');
    expect(briefing.executiveSummary).toContain('No significant');
  });

  it('maps critical insights to alerts', () => {
    const criticalInsight = makeInsight({
      id: 'i1',
      severity: 'critical',
      title: 'Critical SLA breach',
      category: 'sla_breach_risk',
    });
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 75, [criticalInsight], CORR_ID);

    expect(briefing.criticalAlertCount).toBe(1);
    expect(briefing.briefingData.alerts).toHaveLength(1);
    expect(briefing.briefingData.alerts[0]?.severity).toBe('critical');
    expect(briefing.briefingData.alerts[0]?.title).toBe('Critical SLA breach');
  });

  it('maps warning insights to items', () => {
    const warnInsight = makeInsight({ severity: 'warning', title: 'Slow approvals' });
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 90, [warnInsight], CORR_ID);

    expect(briefing.briefingData.items).toHaveLength(1);
    expect(briefing.briefingData.items[0]?.title).toBe('Slow approvals');
    expect(briefing.briefingData.alerts).toHaveLength(0);
  });

  it('pendingActionCount equals total insights count', () => {
    const insights = [
      makeInsight({ id: 'i1', severity: 'critical' }),
      makeInsight({ id: 'i2', severity: 'warning' }),
      makeInsight({ id: 'i3', severity: 'warning' }),
    ];
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 65, insights, CORR_ID);
    expect(briefing.pendingActionCount).toBe(3);
  });

  it('executive summary contains health status for score < 60', () => {
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 50, [], CORR_ID);
    expect(briefing.executiveSummary).toContain('needs attention');
  });

  it('executive summary contains moderate for score 60-79', () => {
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 70, [], CORR_ID);
    expect(briefing.executiveSummary).toContain('moderate');
  });

  it('executive summary mentions critical issue titles', () => {
    const criticalInsight = makeInsight({
      severity: 'critical',
      title: 'Workflow overload',
    });
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 60, [criticalInsight], CORR_ID);
    expect(briefing.executiveSummary).toContain('Workflow overload');
  });

  it('executive summary mentions warnings count', () => {
    const warnInsight = makeInsight({ severity: 'warning', title: 'Minor issue' });
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 85, [warnInsight], CORR_ID);
    expect(briefing.executiveSummary).toContain('1 warning(s)');
  });

  it('autonomousActionCount is always 0 (no auto-execution yet)', () => {
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 80, [], CORR_ID);
    expect(briefing.autonomousActionCount).toBe(0);
  });

  it('correlationId is passed through', () => {
    const composer = new BriefingComposer();
    const briefing = composer.compose(ORG_ID, 100, [], CORR_ID);
    expect(briefing.correlationId).toBe(CORR_ID);
  });
});
