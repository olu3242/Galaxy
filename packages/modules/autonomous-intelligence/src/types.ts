export type AgentType = 'learning' | 'evolution' | 'guardian' | 'healing' | 'intelligence';
export type AgentStatus = 'idle' | 'running' | 'paused' | 'error';
export type AgentActionStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'rolled_back';

export interface AutonomousAgent {
  id: string;
  organizationId: string;
  agentType: AgentType;
  status: AgentStatus;
  lastRunAt?: Date;
  nextRunAt?: Date;
  config: Record<string, unknown>;
  metrics: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentAction {
  id: string;
  organizationId: string;
  agentId: string;
  actionType: string;
  status: AgentActionStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface AgentInsight {
  id: string;
  organizationId: string;
  agentId: string;
  insightType: string;
  title: string;
  description: string;
  confidence: number;
  data: Record<string, unknown>;
  appliedAt?: Date;
  createdAt: Date;
}
