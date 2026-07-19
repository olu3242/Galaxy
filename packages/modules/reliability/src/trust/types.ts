export type ThreatType =
  | 'spam'
  | 'abuse'
  | 'bot'
  | 'impersonation'
  | 'phishing'
  | 'prompt_injection'
  | 'social_engineering'
  | 'policy_violation';

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ThreatStatus = 'detected' | 'investigating' | 'confirmed' | 'dismissed' | 'blocked';

export interface ThreatEvent {
  id: string;
  organizationId: string;
  threatType: ThreatType;
  severity: ThreatSeverity;
  status: ThreatStatus;
  sourceId: string;
  sourceType: string;
  content: string;
  indicators: Record<string, unknown>;
  detectedAt: Date;
  resolvedAt?: Date;
}

export interface TrustScore {
  id: string;
  organizationId: string;
  entityId: string;
  entityType: string;
  score: number;
  flags: string[];
  calculatedAt: Date;
}
