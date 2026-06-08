export type RiskDomain = 'operational' | 'compliance' | 'financial' | 'security' | 'reputational';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RiskScore {
  domain: RiskDomain;
  score: number;
  level: RiskSeverity;
  factors: string[];
}

export interface RiskProfile {
  organizationId: string;
  overallScore: number;
  overallLevel: RiskSeverity;
  domainScores: RiskScore[];
  computedAt: string;
}

export interface RiskTrendPoint {
  period: string;
  domain: RiskDomain;
  score: number;
}

export interface RiskAlert {
  id: string;
  organizationId: string;
  domain: RiskDomain;
  severity: RiskSeverity;
  title: string;
  description: string;
  score: number;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface RiskAlertRow {
  id: string;
  organization_id: string;
  domain: string;
  severity: string;
  title: string;
  description: string;
  score: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}
