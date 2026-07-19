export type InsightSeverity = 'critical' | 'warning' | 'info';
export type InsightCategory =
  | 'sla_breach_risk'
  | 'approval_bottleneck'
  | 'task_overload'
  | 'compliance_issue'
  | 'general';

export type ActionType =
  | 'notify_approver'
  | 'escalate_workflow'
  | 'reassign_task'
  | 'alert_compliance'
  | 'suggest_knowledge_doc';

export type AutonomyLevel = 'observe' | 'notify' | 'suggest' | 'act' | 'command';
export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executed';

export interface WorkflowStats {
  total: number;
  active: number;
  nearSla: number;
  breached: number;
}

export interface ApprovalBacklog {
  total: number;
  stalePending: number;
  oldestDays: number;
}

export interface TaskStats {
  total: number;
  open: number;
  overloaded: { memberId: string; count: number }[];
}

export interface RiskSummary {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
}

export interface RecentIncident {
  id: string;
  title: string;
  severity: string;
  occurredAt: string;
}

export interface AggregatedContext {
  workflowStats: WorkflowStats;
  approvalBacklog: ApprovalBacklog;
  taskStats: TaskStats;
  riskSummary: RiskSummary;
  recentIncidents: RecentIncident[];
  complianceStatus: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

export interface Insight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  description: string;
  affectedEntityIds: string[];
  pointDeduction: number;
}

export interface InsightResult {
  insights: Insight[];
  healthScore: number;
}

export interface COOAlert {
  severity: InsightSeverity;
  title: string;
  description: string;
}

export interface COOItem {
  category: InsightCategory;
  title: string;
  description: string;
}

export interface COOAction {
  id: string;
  organizationId: string;
  briefingId: string | null;
  actionType: ActionType;
  subject: string;
  payload: Record<string, unknown>;
  autonomyLevel: AutonomyLevel;
  status: ActionStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  executedAt: string | null;
  correlationId: string;
  createdAt: string;
  reasoning: string;
}

export interface COOBriefing {
  id: string;
  organizationId: string;
  healthScore: number;
  executiveSummary: string;
  criticalAlertCount: number;
  autonomousActionCount: number;
  pendingActionCount: number;
  briefingData: {
    insights: Insight[];
    alerts: COOAlert[];
    items: COOItem[];
    actions: COOAction[];
  };
  correlationId: string;
  createdAt: string;
}

export interface CreateBriefingInput {
  organizationId: string;
  healthScore: number;
  executiveSummary: string;
  criticalAlertCount: number;
  autonomousActionCount: number;
  pendingActionCount: number;
  briefingData: COOBriefing['briefingData'];
  correlationId: string;
}

export interface CreateActionInput {
  organizationId: string;
  briefingId: string | null;
  actionType: ActionType;
  subject: string;
  payload: Record<string, unknown>;
  autonomyLevel: AutonomyLevel;
  reasoning: string;
  correlationId: string;
}
