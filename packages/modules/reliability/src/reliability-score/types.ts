export interface ReliabilityMetric {
  name: string;
  value: number;
  target: number;
  passing: boolean;
}

export interface ReliabilityReport {
  id: string;
  organizationId: string;
  overallScore: number;
  metrics: ReliabilityMetric[];
  passing: boolean;
  generatedAt: Date;
}
