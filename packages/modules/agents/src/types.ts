export type AgentType =
  | 'executive_copilot'
  | 'operations_copilot'
  | 'compliance_copilot'
  | 'custom';

export type AgentCapability =
  | 'read_workflows'
  | 'read_analytics'
  | 'read_knowledge'
  | 'write_tasks'
  | 'trigger_workflows'
  | 'approve_decisions'
  | 'assess_risk'
  | 'generate_recommendations';

export type AgentExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'awaiting_human';

export type MemoryType = 'episodic' | 'semantic' | 'procedural';

export type DecisionType = 'approval' | 'escalation' | 'recommendation' | 'risk_flag' | 'action';

export type DecisionOutcome = 'approved' | 'rejected' | 'escalated' | 'deferred';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Agent {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  agentType: AgentType;
  capabilities: AgentCapability[];
  automationDomains: string[];
  config: Record<string, unknown>;
  isActive: boolean;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentExecution {
  id: string;
  organizationId: string;
  agentId: string;
  triggerType: 'manual' | 'scheduled' | 'event' | 'workflow';
  triggerData: Record<string, unknown>;
  status: AgentExecutionStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  decisions: AgentDecision[];
  recommendations: Recommendation[];
  riskScore?: number;
  requiresHumanApproval: boolean;
  humanApprovedBy?: string;
  humanApprovedAt?: string;
  correlationId: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMemory {
  id: string;
  organizationId: string;
  agentId: string;
  memoryType: MemoryType;
  key: string;
  value: Record<string, unknown>;
  relevanceScore: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentContextSnapshot {
  id: string;
  organizationId: string;
  agentId: string;
  executionId?: string;
  contextData: Record<string, unknown>;
  workflowRuns: Record<string, unknown>[];
  pendingApprovals: Record<string, unknown>[];
  recentDecisions: Record<string, unknown>[];
  createdAt: string;
}

export interface AgentDecision {
  id: string;
  organizationId: string;
  agentId: string;
  executionId?: string;
  decisionType: DecisionType;
  subject: string;
  context: Record<string, unknown>;
  outcome: DecisionOutcome;
  confidenceScore: number;
  reasoning: string;
  ruleIds: string[];
  requiresHumanOverride: boolean;
  humanOverrideBy?: string;
  humanOverrideAt?: string;
  humanOverrideReason?: string;
  correlationId: string;
  createdAt: string;
}

export interface DecisionRule {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  automationDomain: string;
  conditions: RuleCondition[];
  action: string;
  priority: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuleCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
  value: unknown;
}

export interface RiskAssessment {
  id: string;
  organizationId: string;
  agentId: string;
  executionId?: string;
  subjectType: 'workflow_run' | 'approval' | 'action' | 'member';
  subjectId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
  recommendedAction?: string;
  correlationId: string;
  createdAt: string;
}

export interface RiskFactor {
  name: string;
  weight: number;
  score: number;
  detail: string;
}

export interface Recommendation {
  id: string;
  type: 'action' | 'alert' | 'insight' | 'optimization';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  body: string;
  automationDomain: string;
  actionable: boolean;
  metadata: Record<string, unknown>;
}

export interface CopilotQuery {
  organizationId: string;
  actorId: string;
  query: string;
  context?: Record<string, unknown>;
  correlationId: string;
}

export interface CopilotResponse {
  executionId: string;
  summary: string;
  decisions: AgentDecision[];
  recommendations: Recommendation[];
  riskAssessments: RiskAssessment[];
  requiresHumanApproval: boolean;
  correlationId: string;
}

export interface RegisterAgentInput {
  organizationId: string;
  name: string;
  description?: string;
  agentType: AgentType;
  capabilities: AgentCapability[];
  automationDomains: string[];
  config?: Record<string, unknown>;
  createdBy: string;
}

export interface ExecuteAgentInput {
  organizationId: string;
  agentId: string;
  triggerType: AgentExecution['triggerType'];
  triggerData?: Record<string, unknown>;
  input: Record<string, unknown>;
  actorId: string;
  correlationId: string;
}

export interface HumanOverrideInput {
  organizationId: string;
  decisionId: string;
  actorId: string;
  outcome: DecisionOutcome;
  reason: string;
  correlationId: string;
}
