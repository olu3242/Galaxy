export interface WorkloadForecast {
  domain: string;
  organizationId: string;
  period: string;
  forecastedVolume: number;
  historicalAvg: number;
  seasonalityFactor: number;
  confidence: number;
}

export interface PredictedBreach {
  workflowRunId: string;
  workflowId: string;
  organizationId: string;
  breachProbability: number;
  estimatedBreachAt: string | null;
  slaDeadline: string;
  factors: Record<string, unknown>;
}

export interface ChurnRiskScore {
  memberId: string;
  organizationId: string;
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: string[];
  computedAt: string;
}

export interface PredictiveScoreRow {
  id: string;
  organization_id: string;
  score_type: string;
  subject_type: string;
  subject_id: string;
  score: string;
  factors: Record<string, unknown>;
  predicted_at: string;
  expires_at: string | null;
}
