export interface OrgPercentile {
  organizationId: string;
  metricKey: string;
  value: number;
  percentile: number;
  industry: string;
  sizeBucket: string;
  period: string;
}

export interface BenchmarkReport {
  industry: string;
  sizeBucket: string;
  period: string;
  metrics: {
    key: string;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    cohortSize: number;
  }[];
}

export interface ComparisonReport {
  organizationId: string;
  period: string;
  percentiles: OrgPercentile[];
  summary: {
    metricsAboveMedian: number;
    totalMetrics: number;
    overallPercentile: number;
  };
}
