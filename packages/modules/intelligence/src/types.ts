export type HealthCategory =
  | 'organization'
  | 'department'
  | 'workflow'
  | 'communication'
  | 'engagement';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type InsightType =
  | 'operational'
  | 'department'
  | 'workflow'
  | 'engagement'
  | 'communication'
  | 'compliance'
  | 'risk'
  | 'executive';
export type RecommendationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface HealthScore {
  id: string;
  organizationId: string;
  category: HealthCategory;
  entityId: string | null;
  score: number;
  components: Record<string, number>;
  computedAt: string;
  createdAt: string;
}

export interface RiskIndicator {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  level: RiskLevel;
  affectedEntityId: string | null;
  affectedEntityType: string | null;
  signals: Record<string, unknown>;
  detectedAt: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface Recommendation {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  priority: RecommendationPriority;
  category: InsightType;
  actionItems: string[];
  relatedEntityId: string | null;
  appliedAt: string | null;
  createdAt: string;
}

export interface OperationalSignal {
  type: string;
  organizationId: string;
  value: number;
  metadata: Record<string, unknown>;
  recordedAt: string;
}

export interface InsightSnapshot {
  id: string;
  organizationId: string;
  type: InsightType;
  title: string;
  summary: string;
  data: Record<string, unknown>;
  generatedAt: string;
  createdAt: string;
}

export interface HealthScoreRow {
  id: string;
  organization_id: string;
  category: string;
  entity_id: string | null;
  score: string;
  components: Record<string, number>;
  computed_at: string;
  created_at: string;
}

export interface InsightSnapshotRow {
  id: string;
  organization_id: string;
  type: string;
  title: string;
  summary: string;
  data: Record<string, unknown>;
  generated_at: string;
  created_at: string;
}
