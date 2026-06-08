export type MetricPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type KPIStatus = 'on_track' | 'at_risk' | 'off_track' | 'not_set';
export type ReportStatus = 'draft' | 'generating' | 'ready' | 'failed';
export type DashboardCategory =
  | 'executive'
  | 'operations'
  | 'department'
  | 'workflow'
  | 'communication'
  | 'compliance'
  | 'platform';
export type WidgetType = 'chart' | 'metric' | 'table' | 'gauge' | 'heatmap';

export interface Metric {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  value: number;
  unit: string;
  period: MetricPeriod;
  periodStart: string;
  periodEnd: string;
  dimensions: Record<string, string>;
  createdAt: string;
}

export interface KPI {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  metricName: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  period: MetricPeriod;
  status: KPIStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: DashboardCategory;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface Report {
  id: string;
  organizationId: string;
  templateId: string | null;
  name: string;
  category: DashboardCategory;
  status: ReportStatus;
  data: Record<string, unknown>;
  generatedBy: string;
  generatedAt: string | null;
  createdAt: string;
}

export interface DashboardWidget {
  id: string;
  organizationId: string;
  category: DashboardCategory;
  name: string;
  type: WidgetType;
  config: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsDimension {
  name: string;
  value: string;
}

export interface AnalyticsFact {
  metricName: string;
  value: number;
  dimensions: AnalyticsDimension[];
  recordedAt: string;
}

export interface AnalyticsSnapshot {
  id: string;
  organizationId: string;
  period: MetricPeriod;
  periodStart: string;
  periodEnd: string;
  facts: AnalyticsFact[];
  createdAt: string;
}

export interface MetricRow {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  value: string;
  unit: string;
  period: string;
  period_start: string;
  period_end: string;
  dimensions: Record<string, string>;
  created_at: string;
}

export interface KPIRow {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  metric_name: string;
  target_value: string;
  current_value: string;
  unit: string;
  period: string;
  status: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ReportRow {
  id: string;
  organization_id: string;
  template_id: string | null;
  name: string;
  category: string;
  status: string;
  data: Record<string, unknown>;
  generated_by: string;
  generated_at: string | null;
  created_at: string;
}

export interface DashboardWidgetRow {
  id: string;
  organization_id: string;
  category: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
  updated_at: string;
}
