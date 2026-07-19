export interface MetricPoint {
  id: string;
  organizationId: string;
  metricName: string;
  metricValue: number;
  labels: Record<string, string>;
  timestamp: string;
}

export interface TraceSpan {
  id: string;
  organizationId: string;
  traceId: string;
  parentSpanId: string | null;
  operationName: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
}

export type HealthStatusLevel = 'healthy' | 'degraded' | 'critical';

export interface HealthStatus {
  id: string;
  organizationId: string;
  component: string;
  status: HealthStatusLevel;
  details: Record<string, unknown>;
  checkedAt: string;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertState = 'firing' | 'resolved';

export interface Alert {
  id: string;
  organizationId: string;
  alertRuleId: string;
  severity: AlertSeverity;
  state: AlertState;
  title: string;
  description: string;
  firedAt: string;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
}

export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';
export type IncidentSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4';

export interface Incident {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  postmortemUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SLODefinition {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  targetPercentage: number;
  windowDays: number;
  currentCompliance: number;
  isBreaching: boolean;
  createdAt: string;
  updatedAt: string;
}

// DB row types
export interface MetricPointRow {
  id: string;
  organization_id: string;
  metric_name: string;
  metric_value: string;
  labels: Record<string, string>;
  timestamp: string;
}

export interface HealthStatusRow {
  id: string;
  organization_id: string;
  component: string;
  status: string;
  details: Record<string, unknown>;
  checked_at: string;
}

export interface AlertRow {
  id: string;
  organization_id: string;
  alert_rule_id: string;
  severity: string;
  state: string;
  title: string;
  description: string;
  fired_at: string;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
}

export interface IncidentRow {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  postmortem_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SLODefinitionRow {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  target_percentage: string;
  window_days: string;
  current_compliance: string;
  is_breaching: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertRuleRow {
  id: string;
  organization_id: string;
  name: string;
  metric_name: string;
  threshold: string;
  operator: string;
  severity: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertRule {
  id: string;
  organizationId: string;
  name: string;
  metricName: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  severity: AlertSeverity;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
