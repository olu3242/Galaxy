export interface OperationalSnapshot {
  organizationId: string;
  activeWorkflows: number;
  pendingApprovals: number;
  openConversations: number;
  activeAgents: number;
  healthScore: number;
  generatedAt: Date;
}

export interface LearningSnapshot {
  organizationId: string;
  totalInsights: number;
  appliedInsights: number;
  pendingImprovements: number;
  generatedAt: Date;
}

export interface GuardianSnapshot {
  organizationId: string;
  activeIncidents: number;
  healedToday: number;
  escalatedToday: number;
  riskAlerts: number;
  generatedAt: Date;
}

export interface DigitalTwinSnapshot {
  organizationId: string;
  nodeCount: number;
  relationshipCount: number;
  overallHealthScore: number;
  lastSnapshotAt?: Date;
  generatedAt: Date;
}

export interface MissionControlDashboard {
  operational: OperationalSnapshot;
  learning: LearningSnapshot;
  guardian: GuardianSnapshot;
  digitalTwin: DigitalTwinSnapshot;
  generatedAt: Date;
}
