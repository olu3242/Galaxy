import { randomUUID } from 'crypto';
import type { Insight, COOAction, CreateActionInput } from './types.js';

export class ActionPlanner {
  planActions(orgId: string, insights: Insight[], correlationId: string): CreateActionInput[] {
    const actions: CreateActionInput[] = [];

    for (const insight of insights) {
      if (insight.category === 'sla_breach_risk' && insight.severity === 'critical') {
        actions.push({
          organizationId: orgId,
          briefingId: null,
          actionType: 'escalate_workflow',
          subject: 'Escalate breached SLA workflows',
          payload: { insightId: insight.id },
          autonomyLevel: 'notify',
          reasoning: insight.description,
          correlationId,
        });
      }

      if (insight.category === 'approval_bottleneck') {
        actions.push({
          organizationId: orgId,
          briefingId: null,
          actionType: 'notify_approver',
          subject: 'Notify approvers of pending backlog',
          payload: { insightId: insight.id },
          autonomyLevel: 'notify',
          reasoning: insight.description,
          correlationId,
        });
      }

      if (insight.category === 'task_overload') {
        const memberId = insight.affectedEntityIds[0] ?? '';
        actions.push({
          organizationId: orgId,
          briefingId: null,
          actionType: 'reassign_task',
          subject: `Rebalance tasks for member ${memberId}`,
          payload: { memberId, insightId: insight.id },
          autonomyLevel: 'suggest',
          reasoning: insight.description,
          correlationId,
        });
      }

      if (insight.category === 'compliance_issue') {
        actions.push({
          organizationId: orgId,
          briefingId: null,
          actionType: 'alert_compliance',
          subject: 'Alert compliance officer of failures',
          payload: { insightId: insight.id },
          autonomyLevel: 'notify',
          reasoning: insight.description,
          correlationId,
        });
      }
    }

    return actions;
  }

  toPartialCOOAction(input: CreateActionInput): Omit<COOAction, 'id' | 'createdAt'> {
    return {
      organizationId: input.organizationId,
      briefingId: input.briefingId,
      actionType: input.actionType,
      subject: input.subject,
      payload: input.payload,
      autonomyLevel: input.autonomyLevel,
      status: 'pending',
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      executedAt: null,
      correlationId: input.correlationId,
      reasoning: input.reasoning,
    };
  }
}

export { randomUUID };
