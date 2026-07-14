'use client';

import useSWR, { type SWRConfiguration, useSWRConfig } from 'swr';
import { useEffect, useRef } from 'react';
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

export interface OrgHealth {
  overall: number;
  workflowMetrics: {
    activeWorkflows: number;
    completedToday: number;
    pendingApproval: number;
    slaBreaches: number;
  };
  loopMetrics: {
    completionRate: number;
    totalLoops: number;
    completedLoops: number;
  };
}

export function useOrgHealth() {
  return useOrgQuery<{ data: OrgHealth }>('/api/v1/analytics/org-health');
}

// ─── Broadcasts ───────────────────────────────────────────────────────────────

export interface BroadcastItem {
  id: string;
  organizationId: string;
  title: string;
  content: string;
  targetType: string;
  targetIds: string[];
  status: string;
  sentCount: number;
  failedCount: number;
  sentBy: string;
  sentAt: string | null;
  createdAt: string;
}

// ─── Loop Insights ────────────────────────────────────────────────────────────

export interface LoopInsight {
  id: string;
  summary: string;
  recommendations: string[];
  optimizationScore: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}

export interface LoopStats {
  total: number;
  completed: number;
  escalated: number;
  completionRate: number;
  avgFeedbackScore: number | null;
}

export function useLoopInsights() {
  return useOrgQuery<{ data: { insights: LoopInsight[]; stats: LoopStats } }>(
    '/api/v1/analytics/loop-insights',
  );
}

export function useBroadcasts(page = 1, limit = 20) {
  return useOrgQuery<{ data: BroadcastItem[] }>(
    `/api/v1/broadcasts?limit=${String(limit)}&offset=${String((page - 1) * limit)}`,
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
  displayName: string;
  email: string | null;
  whatsappPhone?: string | null | undefined;
  status: 'active' | 'suspended' | 'archived';
  roleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useMembers(page = 1, limit = 20) {
  return useOrgQuery<{ data: Member[]; meta: { total?: number; page?: number; limit?: number } }>(
    `/api/v1/members?limit=${String(limit)}&offset=${String((page - 1) * limit)}`,
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
  description?: string | undefined;
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
  isSystem?: boolean | undefined;
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

// ─── Real-time SSE ────────────────────────────────────────────────────────────

/**
 * Opens a Server-Sent Events connection to /api/v1/events/stream and
 * triggers SWR revalidation for affected endpoints when workflow/loop/broadcast
 * events arrive. Components don't need to call this directly — it's wired into
 * the dashboard layout.
 */
// ─── Knowledge ────────────────────────────────────────────────────────────────

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  status: string;
  category: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export function useKnowledgeDocs(page = 1, limit = 20) {
  return useOrgQuery<{ data: KnowledgeDoc[]; meta: { total?: number } }>(
    `/api/v1/knowledge/documents?limit=${String(limit)}&offset=${String((page - 1) * limit)}`,
  );
}

export function useKnowledgeSearch(query: string) {
  const orgId = useOrganizationId();
  const path =
    query.trim().length >= 2 && orgId
      ? `/api/v1/knowledge/search?query=${encodeURIComponent(query)}&organizationId=${orgId}`
      : null;
  return useApiQuery<{ data: KnowledgeDoc[] }>(path, { revalidateOnFocus: false });
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: string;
  userId: string;
  displayName: string;
  checkInAt: string;
  checkOutAt: string | null;
  source: string;
}

export function useAttendance(page = 1, limit = 20) {
  return useOrgQuery<{ data: AttendanceRecord[]; meta: { total?: number } }>(
    `/api/v1/people/attendance?limit=${String(limit)}&offset=${String((page - 1) * limit)}`,
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────

export interface Integration {
  id: string;
  name: string;
  connectorType: string;
  status: 'active' | 'inactive' | 'error';
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function useIntegrations() {
  const orgId = useOrganizationId();
  const path = orgId ? '/api/v1/integrations' : null;
  return useApiQuery<{ connectors: Integration[] }>(path, {
    revalidateOnFocus: false,
  });
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  description?: string | undefined;
  departmentId: string;
  leadMemberId?: string | undefined;
  memberCount?: number | undefined;
  createdAt: string;
}

export function useTeams(departmentId?: string) {
  const query = departmentId ? `&departmentId=${departmentId}` : '';
  return useOrgQuery<{ data: Team[] }>(`/api/v1/teams?limit=100${query}`);
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface BillingPlan {
  id: string;
  name: string;
  priceMonthly: number;
  description: string;
  currency: string;
  interval: string;
  features: string[];
  limits: Record<string, number>;
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  status: string;
  seats: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd?: string | undefined;
}

export function useBillingPlans() {
  return useApiQuery<{ plans: BillingPlan[] }>('/api/v1/billing/plans');
}

export function useSubscription(orgId: string | null) {
  const path = orgId ? `/api/v1/billing/organizations/${orgId}/subscription` : null;
  return useApiQuery<{ subscription: Subscription }>(path);
}

export function useInvoices(orgId: string | null, limit = 10) {
  const path = orgId
    ? `/api/v1/billing/organizations/${orgId}/invoices?limit=${String(limit)}`
    : null;
  return useApiQuery<{
    invoices: Array<{
      id: string;
      amountDue: number;
      currency: string;
      status: string;
      createdAt: string;
      pdfUrl?: string;
    }>;
  }>(path);
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description?: string | undefined;
  config?: Record<string, unknown> | undefined;
}

export function useFeatureFlags() {
  return useApiQuery<{ flags: FeatureFlag[] }>('/api/v1/platform/features');
}

// ─── All Approvals (with status filter) ──────────────────────────────────────

export function useAllApprovals(status?: string, page = 1, limit = 20) {
  const query = status ? `&status=${status}` : '';
  return useOrgQuery<{ data: ApprovalItem[] }>(
    `/api/v1/workflow-os/approvals?limit=${String(limit)}&offset=${String((page - 1) * limit)}${query}`,
  );
}

// ─── Loop Instances ───────────────────────────────────────────────────────────

export interface LoopInstance {
  id: string;
  workflowInstanceId: string;
  status: 'pending' | 'verifying' | 'collecting_feedback' | 'completed' | 'escalated';
  phase: string | null;
  createdAt: string;
  updatedAt: string;
  verificationDeadline: string | null;
  feedbackScore: number | null;
}

export function useLoopInstances(status?: string, page = 1, limit = 20) {
  const query = status ? `&status=${status}` : '';
  return useOrgQuery<{ data: LoopInstance[]; meta: { total: number } }>(
    `/api/v1/loops/all?limit=${String(limit)}&offset=${String((page - 1) * limit)}${query}`,
  );
}

// ─── Workflow Definitions (full) ──────────────────────────────────────────────

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string | undefined;
  category: string;
  definition: Record<string, unknown>;
  status: 'active' | 'paused' | 'archived';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function useWorkflowDefinitions(status?: string) {
  const query = status ? `&status=${status}` : '';
  return useOrgQuery<{ data: WorkflowDefinition[] }>(
    `/api/v1/workflow-os/definitions?limit=50${query}`,
  );
}

export function useWorkflowDefinition(id: string | null) {
  const orgId = useOrganizationId();
  const path = id && orgId ? `/api/v1/workflow-os/definitions/${id}?organizationId=${orgId}` : null;
  return useApiQuery<{ data: WorkflowDefinition }>(path);
}

// ─── Reports (Governance) ─────────────────────────────────────────────────────

export interface ComplianceReport {
  id: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
  summary: Record<string, unknown>;
  createdAt: string;
}

export function useComplianceReports(limit = 20) {
  return useOrgQuery<{ data: ComplianceReport[] }>(
    `/api/v1/governance/reports?limit=${String(limit)}`,
  );
}

// ─── Observability Alerts (extended) ─────────────────────────────────────────

export interface Alert {
  id: string;
  name: string;
  severity: string;
  firedAt: string;
}

export function useRealtimeEvents() {
  const orgId = useOrganizationId();
  const { mutate } = useSWRConfig();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!orgId) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    const url = `${baseUrl}/api/v1/events/stream?organizationId=${encodeURIComponent(orgId)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('galaxy', (e: MessageEvent<string>) => {
      let event: { type?: string } = {};
      try {
        event = JSON.parse(e.data) as { type?: string };
      } catch {
        return;
      }
      const type = event.type ?? '';

      // Invalidate relevant SWR keys based on event type
      if (type.startsWith('workflow.')) {
        void mutate((key) => typeof key === 'string' && key.includes('/analytics/workflow-stats'));
        void mutate((key) => typeof key === 'string' && key.includes('/workflow-os/approvals'));
        void mutate((key) => typeof key === 'string' && key.includes('/analytics/org-health'));
      }
      if (type.startsWith('broadcast.')) {
        void mutate((key) => typeof key === 'string' && key.includes('/broadcasts'));
      }
      if (type.startsWith('loop.')) {
        void mutate((key) => typeof key === 'string' && key.includes('/analytics/org-health'));
      }
      if (type.startsWith('audit.') || type.startsWith('workflow.') || type.startsWith('loop.')) {
        void mutate((key) => typeof key === 'string' && key.includes('/audit/logs'));
      }
    });

    es.addEventListener('reconnect', () => {
      es.close();
    });

    es.onerror = () => {
      // EventSource auto-reconnects on error — no manual handling needed
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [orgId, mutate]);
}

// ─── Sprint 21: Agent OS ───────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'paused' | 'error';
  capabilities: string[];
  tasksCompleted: number;
  tasksFailed: number;
  lastRunAt?: string | undefined;
  createdAt: string;
}

export interface AgentTask {
  id: string;
  agentId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: Record<string, unknown>;
  output?: Record<string, unknown> | undefined;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  createdAt: string;
}

export function useAgentDefinitions() {
  return useOrgQuery<{ data: AgentDefinition[] }>('/api/v1/agents/definitions');
}

export function useAgentTasks(agentId?: string, limit = 20) {
  const query = agentId ? `&agentId=${agentId}` : '';
  return useOrgQuery<{ data: AgentTask[] }>(`/api/v1/agents/tasks?limit=${String(limit)}${query}`);
}

// ─── Sprint 22: Delegation & Policy ───────────────────────────────────────────

export interface DelegationRecord {
  id: string;
  delegatorId: string;
  delegatorName?: string | undefined;
  delegateeId: string;
  delegateeName?: string | undefined;
  scope: string[];
  reason?: string | undefined;
  status: 'active' | 'revoked' | 'expired';
  expiresAt?: string | undefined;
  createdAt: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  effect: 'allow' | 'deny';
  subject: string;
  resource: string;
  action: string;
  conditions?: Record<string, unknown> | undefined;
  priority: number;
  active: boolean;
  createdAt: string;
}

export function useDelegations(status?: string) {
  const query = status ? `&status=${status}` : '';
  return useOrgQuery<{ data: DelegationRecord[] }>(`/api/v1/identity/delegations?limit=50${query}`);
}

export function usePolicyRules() {
  return useOrgQuery<{ data: PolicyRule[] }>('/api/v1/governance/policies');
}

// ─── Sprint 23: WhatsApp Templates ────────────────────────────────────────────

export interface WaTemplate {
  id: string;
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  body: string;
  header?: string | undefined;
  footer?: string | undefined;
  buttons?: { type: string; text: string; value?: string }[] | undefined;
  createdAt: string;
}

export function useWaTemplates() {
  return useOrgQuery<{ data: WaTemplate[] }>('/api/v1/communication/templates');
}

// ─── Sprint 24: Tenant Management ─────────────────────────────────────────────

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
  workflowCount: number;
  status: 'active' | 'suspended' | 'trial';
  createdAt: string;
}

export function useTenants(page = 1, limit = 20) {
  return useApiQuery<{ data: TenantSummary[]; meta: { total: number } }>(
    `/api/v1/admin/tenants?page=${String(page)}&limit=${String(limit)}`,
  );
}

// ─── Sprint 25: Custom Analytics / KPIs ──────────────────────────────────────

export interface KpiDefinition {
  id: string;
  name: string;
  description?: string | undefined;
  formula: string;
  unit?: string | undefined;
  target?: number | undefined;
  current?: number | undefined;
  trend?: 'up' | 'down' | 'flat' | undefined;
  createdAt: string;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  label?: string | undefined;
}

export function useKpiDefinitions() {
  return useOrgQuery<{ data: KpiDefinition[] }>('/api/v1/analytics/kpis');
}

export function useKpiTimeseries(kpiId: string, days = 30) {
  return useOrgQuery<{ data: MetricDataPoint[] }>(
    kpiId ? `/api/v1/analytics/kpis/${kpiId}/timeseries?days=${String(days)}` : null,
  );
}
