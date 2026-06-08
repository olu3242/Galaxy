export interface IntelligenceBenchmark {
  id: string;
  industry: string;
  sizeBucket: string;
  metricKey: string;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  cohortSize: number;
  period: string;
  createdAt: string;
}

export interface IntelligenceBenchmarkRow {
  id: string;
  industry: string;
  size_bucket: string;
  metric_key: string;
  p25: string;
  p50: string;
  p75: string;
  p90: string;
  cohort_size: string;
  period: string;
  created_at: string;
}

export interface Contribution {
  id: string;
  organizationId: string;
  metricKey: string;
  metricValue: number;
  period: string;
  anonymizationNoise: number;
  createdAt: string;
}

export interface ContributionRow {
  id: string;
  organization_id: string;
  metric_key: string;
  metric_value: string;
  period: string;
  anonymization_noise: string;
  created_at: string;
}

export interface PeerComparison {
  organizationId: string;
  metricKey: string;
  orgValue: number;
  benchmarkP50: number;
  benchmarkP75: number;
  percentileRank: number;
}

export interface WorkflowRecommendation {
  metricKey: string;
  currentValue: number;
  targetValue: number;
  improvementPct: number;
  recommendation: string;
}
