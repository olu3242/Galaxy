import type { AgentContextSnapshot, Recommendation } from '../types.js';

interface WorkflowRunData {
  status?: string;
  sla_due_at?: string;
  automation_domain?: string;
}

interface ApprovalData {
  id?: string;
  created_at?: string;
}

export class RecommendationEngine {
  generate(context: AgentContextSnapshot, riskScore: number): Recommendation[] {
    const recs: Recommendation[] = [];
    const now = Date.now();

    const runs = context.workflowRuns as WorkflowRunData[];
    const approvals = context.pendingApprovals as ApprovalData[];

    const escalated = runs.filter((r) => r.status === 'escalated');
    if (escalated.length > 0) {
      recs.push({
        id: crypto.randomUUID(),
        type: 'alert',
        priority: 'urgent',
        title: `${String(escalated.length)} escalated workflow(s) need attention`,
        body: `${String(escalated.length)} workflow run(s) are in escalated state. Review and resolve immediately to prevent further delays.`,
        automationDomain: 'governance',
        actionable: true,
        metadata: { count: escalated.length },
      });
    }

    const breached = runs.filter((r) => {
      if (!r.sla_due_at) return false;
      return new Date(r.sla_due_at).getTime() < now;
    });
    if (breached.length > 0) {
      recs.push({
        id: crypto.randomUUID(),
        type: 'alert',
        priority: 'urgent',
        title: `${String(breached.length)} SLA breach(es) detected`,
        body: `${String(breached.length)} workflow run(s) have missed their SLA deadlines. Immediate action required.`,
        automationDomain: 'governance',
        actionable: true,
        metadata: { count: breached.length },
      });
    }

    const nearBreached = runs.filter((r) => {
      if (!r.sla_due_at) return false;
      const ms = new Date(r.sla_due_at).getTime() - now;
      return ms > 0 && ms < 4 * 3_600_000;
    });
    if (nearBreached.length > 0) {
      recs.push({
        id: crypto.randomUUID(),
        type: 'alert',
        priority: 'high',
        title: `${String(nearBreached.length)} workflow(s) approaching SLA deadline`,
        body: `${String(nearBreached.length)} run(s) will breach SLA within 4 hours. Prioritize these immediately.`,
        automationDomain: 'task',
        actionable: true,
        metadata: { count: nearBreached.length },
      });
    }

    if (approvals.length > 5) {
      recs.push({
        id: crypto.randomUUID(),
        type: 'insight',
        priority: 'medium',
        title: `${String(approvals.length)} pending approvals require sign-off`,
        body: `There are ${String(approvals.length)} approvals awaiting decision. Consider delegating or batching to reduce backlog.`,
        automationDomain: 'approval',
        actionable: true,
        metadata: { count: approvals.length },
      });
    }

    if (riskScore >= 70) {
      recs.push({
        id: crypto.randomUUID(),
        type: 'alert',
        priority: 'high',
        title: 'High organizational risk score detected',
        body: `Current risk score is ${riskScore.toFixed(0)}/100. Review risk factors and initiate mitigation measures.`,
        automationDomain: 'governance',
        actionable: true,
        metadata: { riskScore },
      });
    }

    const domainCounts = runs.reduce<Record<string, number>>((acc, r) => {
      const d = r.automation_domain ?? 'unknown';
      acc[d] = (acc[d] ?? 0) + 1;
      return acc;
    }, {});

    const topDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0];
    if (topDomain && topDomain[1] > 3) {
      recs.push({
        id: crypto.randomUUID(),
        type: 'optimization',
        priority: 'low',
        title: `High volume in '${topDomain[0]}' domain`,
        body: `${String(topDomain[1])} active runs in '${topDomain[0]}'. Consider automating recurring patterns to reduce manual load.`,
        automationDomain: topDomain[0],
        actionable: false,
        metadata: { domain: topDomain[0], count: topDomain[1] },
      });
    }

    if (recs.length === 0) {
      recs.push({
        id: crypto.randomUUID(),
        type: 'insight',
        priority: 'low',
        title: 'Operations are running smoothly',
        body: 'No critical issues detected. All workflows and approvals are within normal parameters.',
        automationDomain: 'governance',
        actionable: false,
        metadata: {},
      });
    }

    return recs;
  }
}
