import { randomUUID } from 'crypto';
import type { AggregatedContext, Insight, InsightResult } from './types.js';

export class InsightEngine {
  analyze(ctx: AggregatedContext): InsightResult {
    const insights: Insight[] = [];

    // SLA breach risk: >30% of active runs are near SLA
    if (ctx.workflowStats.active > 0) {
      const nearSlaRatio = ctx.workflowStats.nearSla / ctx.workflowStats.active;
      if (nearSlaRatio > 0.3) {
        insights.push({
          id: randomUUID(),
          category: 'sla_breach_risk',
          severity: nearSlaRatio > 0.6 ? 'critical' : 'warning',
          title: 'High SLA breach risk',
          description: `${String(ctx.workflowStats.nearSla)} of ${String(ctx.workflowStats.active)} active workflow runs (${Math.round(nearSlaRatio * 100)}%) are within 24 hours of their SLA deadline.`,
          affectedEntityIds: [],
          pointDeduction: nearSlaRatio > 0.6 ? 25 : 15,
        });
      }
    }

    // Active SLA breaches
    if (ctx.workflowStats.breached > 0) {
      insights.push({
        id: randomUUID(),
        category: 'sla_breach_risk',
        severity: 'critical',
        title: 'Active SLA breaches detected',
        description: `${String(ctx.workflowStats.breached)} workflow run(s) have exceeded their SLA deadline and are still active.`,
        affectedEntityIds: [],
        pointDeduction: ctx.workflowStats.breached * 10,
      });
    }

    // Approval bottleneck: >5 approvals pending >3 days
    if (ctx.approvalBacklog.stalePending > 5) {
      insights.push({
        id: randomUUID(),
        category: 'approval_bottleneck',
        severity: ctx.approvalBacklog.stalePending > 15 ? 'critical' : 'warning',
        title: 'Approval bottleneck detected',
        description: `${String(ctx.approvalBacklog.stalePending)} approval request(s) have been pending for more than 3 days. Oldest is ${String(Math.round(ctx.approvalBacklog.oldestDays))} day(s) old.`,
        affectedEntityIds: [],
        pointDeduction: ctx.approvalBacklog.stalePending > 15 ? 20 : 10,
      });
    }

    // Task overload: any member with >10 open tasks
    for (const overloaded of ctx.taskStats.overloaded) {
      insights.push({
        id: randomUUID(),
        category: 'task_overload',
        severity: overloaded.count > 20 ? 'critical' : 'warning',
        title: 'Member task overload',
        description: `Member ${overloaded.memberId} has ${String(overloaded.count)} open tasks assigned, exceeding the recommended limit of 10.`,
        affectedEntityIds: [overloaded.memberId],
        pointDeduction: overloaded.count > 20 ? 15 : 8,
      });
    }

    // Compliance failures
    if (ctx.complianceStatus.failed > 0) {
      insights.push({
        id: randomUUID(),
        category: 'compliance_issue',
        severity: ctx.complianceStatus.failed > 3 ? 'critical' : 'warning',
        title: 'Compliance check failures',
        description: `${String(ctx.complianceStatus.failed)} compliance check(s) failed in the last 30 days.`,
        affectedEntityIds: [],
        pointDeduction: ctx.complianceStatus.failed > 3 ? 20 : 10,
      });
    }

    const totalDeduction = insights.reduce((sum, i) => sum + i.pointDeduction, 0);
    const healthScore = Math.max(0, 100 - totalDeduction);

    return { insights, healthScore };
  }
}
