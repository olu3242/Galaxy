export type HealthDimension = 'communication' | 'workflow' | 'team' | 'knowledge' | 'overall';
export type HealthStatus = 'healthy' | 'at_risk' | 'critical';

export interface HealthScore {
  id: string;
  organizationId: string;
  dimension: HealthDimension;
  score: number;
  status: HealthStatus;
  indicators: Record<string, unknown>;
  recommendations: string[];
  measuredAt: Date;
}

export interface HealthTrend {
  organizationId: string;
  dimension: HealthDimension;
  scores: { score: number; measuredAt: Date }[];
  trend: 'improving' | 'stable' | 'declining';
}
