'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { useApiClient, useOrganizationId } from './context';
import type { ApiError } from './client';

/**
 * SWR-backed hook for GET requests via the Galaxy API client.
 * Path is relative to the API base URL.
 */
export function useApiQuery<T>(path: string | null, config?: SWRConfiguration<T, ApiError>) {
  const client = useApiClient();
  return useSWR<T, ApiError>(path, (p: string) => client.get<T>(p), {
    revalidateOnFocus: false,
    ...config,
  });
}

/**
 * Org-scoped query — appends ?organizationId=<orgId> to the path.
 * Suspends (returns null key) when orgId is not yet available.
 */
export function useOrgQuery<T>(path: string | null, config?: SWRConfiguration<T, ApiError>) {
  const orgId = useOrganizationId();
  const sep = path?.includes('?') ? '&' : '?';
  const fullPath = path !== null && orgId ? `${path}${sep}organizationId=${orgId}` : null;
  return useApiQuery<T>(fullPath, config);
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardData {
  metrics?: Record<string, number | string>;
  kpis?: Array<{ name: string; value: number | string; delta?: number }>;
  health?: number;
}

export function useDashboard(category: string) {
  return useOrgQuery<{ data: DashboardData }>(`/api/v1/analytics/dashboards/${category}`);
}

export function useOrgHealth() {
  return useOrgQuery<{ data: { score: number; status: string; details: Record<string, number> } }>(
    '/api/v1/analytics/org-health',
  );
}

export function useKPIs() {
  return useOrgQuery<{ data: Array<{ name: string; value: number | string; period: string }> }>(
    '/api/v1/analytics/kpis',
  );
}

// ─── Members ─────────────────────────────────────────────────────────────────

export interface Member {
  id: string;
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  role: string;
  departmentId?: string | undefined;
  isActive: boolean;
  joinedAt: string;
}

export function useMembers(page = 1, limit = 20) {
  return useOrgQuery<{ data: Member[]; meta: { total: number; page: number; limit: number } }>(
    `/api/v1/members?page=${String(page)}&limit=${String(limit)}`,
  );
}

// ─── Workflows ───────────────────────────────────────────────────────────────

export interface Workflow {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  type: string;
  createdAt: string;
  updatedAt: string;
  executionCount: number;
}

export function useWorkflows(status?: Workflow['status']) {
  const query = status ? `&status=${status}` : '';
  return useOrgQuery<{ data: Workflow[] }>(`/api/v1/workflow-os/definitions${query}`);
}

export function usePendingApprovals() {
  return useOrgQuery<{ data: ApprovalItem[] }>('/api/v1/workflow-os/approvals');
}

// ─── Approvals ───────────────────────────────────────────────────────────────

export interface ApprovalItem {
  id: string;
  workflowId: string;
  workflowName?: string | undefined;
  requestedBy: string;
  requestedAt: string;
  dueAt?: string | undefined;
  priority?: 'low' | 'medium' | 'high' | 'critical' | undefined;
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  action: string;
  actorId: string;
  actorType: 'member' | 'agent' | 'system';
  resourceType: string;
  resourceId: string;
  organizationId: string;
  correlationId: string;
  timestamp: string;
  severity: 'info' | 'warn' | 'error';
  metadata?: Record<string, unknown> | undefined;
}

export function useAuditEvents(limit = 20) {
  return useOrgQuery<{ data: AuditEvent[] }>(`/api/v1/audit/logs?limit=${String(limit)}`);
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export interface AgentOverview {
  totalAgents: number;
  activeAgents: number;
  executionsToday: number;
  pendingApprovals: number;
  agents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    lastExecutedAt?: string | undefined;
  }>;
}

export function useAgentOverview() {
  return useOrgQuery<{ data: AgentOverview }>('/api/v1/agents/overview');
}

// ─── Intelligence ─────────────────────────────────────────────────────────────

export interface AIInsightData {
  id: string;
  type: string;
  title: string;
  summary: string;
  confidence: number;
  impactLevel: number;
}

export function useAIInsights() {
  return useOrgQuery<{ data: AIInsightData[] }>('/api/v1/intelligence/insights');
}

export function useAIRecommendations() {
  return useOrgQuery<{ data: AIInsightData[] }>('/api/v1/intelligence/recommendations');
}

export function useRiskSignals() {
  return useOrgQuery<{
    data: Array<{ id: string; type: string; severity: string; description: string }>;
  }>('/api/v1/intelligence/risks');
}

// ─── Observability ────────────────────────────────────────────────────────────

export interface ServiceHealth {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latencyMs?: number | undefined;
  uptimePct?: number | undefined;
}

export function useSystemHealth() {
  return useApiQuery<{ data: { services: ServiceHealth[]; overall: string } }>(
    '/api/v1/observability/health',
  );
}

export function useAlerts(limit = 10) {
  return useOrgQuery<{
    data: Array<{ id: string; name: string; severity: string; firedAt: string }>;
  }>(`/api/v1/observability/alerts?limit=${String(limit)}`);
}

// ─── Departments ──────────────────────────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
  parentDepartmentId?: string | undefined;
  headMemberId?: string | undefined;
  memberCount?: number | undefined;
}

export function useDepartments() {
  return useOrgQuery<{ data: Department[] }>('/api/v1/departments');
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export interface RoleDefinition {
  id: string;
  name: string;
  permissions: string[];
  memberCount?: number | undefined;
}

export function useRoles() {
  return useOrgQuery<{ data: RoleDefinition[] }>('/api/v1/roles');
}

// ─── Queue Stats ──────────────────────────────────────────────────────────────

export interface QueueStat {
  name: string;
  pending: number;
  active: number;
  completed: number;
  failed: number;
  delayed?: number | undefined;
}

export function useQueueStats() {
  return useOrgQuery<{ data: QueueStat[] }>('/api/v1/observability/queues');
}

// ─── Platform Metrics (super-admin, no org scope) ─────────────────────────────

export function usePlatformMetrics() {
  return useApiQuery<{
    data: {
      totalOrganizations: number;
      totalWorkflows: number;
      activeWorkers: number;
      avgLatencyMs: number;
      failedJobs: number;
      totalEvents: number;
    };
  }>('/api/v1/platform/metrics');
}

// ─── Workflow Stats ───────────────────────────────────────────────────────────

export interface WorkflowStats {
  active: number;
  pending: number;
  completed: number;
  avgDurationHours: number;
  autoApprovalRate: number;
  slaBreaches: number;
}

export function useWorkflowStats() {
  return useOrgQuery<{ data: WorkflowStats }>('/api/v1/analytics/workflow-stats');
}

// ─── Security Metrics ─────────────────────────────────────────────────────────

export function useSecurityMetrics() {
  return useOrgQuery<{
    data: {
      accessDenials: number;
      activePolicies: number;
      activeDelegations: number;
      dormantAccounts: number;
      complianceScore: number;
      rlsViolations: number;
    };
  }>('/api/v1/governance/security-metrics');
}
