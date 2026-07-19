export type HealingLevel = 'workflow' | 'queue' | 'data' | 'knowledge' | 'organizational';
export type HealingStatus =
  | 'detected'
  | 'diagnosing'
  | 'healing'
  | 'healed'
  | 'failed'
  | 'escalated';
export type HealingTrigger = 'automatic' | 'scheduled' | 'manual';

export interface HealingIncident {
  id: string;
  organizationId: string;
  level: HealingLevel;
  trigger: HealingTrigger;
  status: HealingStatus;
  description: string;
  diagnosis?: string;
  resolution?: string;
  affectedResourceType?: string;
  affectedResourceId?: string;
  attemptCount: number;
  detectedAt: Date;
  healedAt?: Date;
  failedAt?: Date;
}

export interface HealingRule {
  id: string;
  organizationId: string;
  level: HealingLevel;
  name: string;
  condition: Record<string, unknown>;
  action: string;
  priority: number;
  enabled: boolean;
  createdAt: Date;
}
