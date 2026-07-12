'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { useApiClient, useOrganizationId } from './context';
import type { ApiError } from './client';

/**
 * SWR-backed hook for GET requests via the Galaxy API client.
 *
 * @example
 *   const { data, error, isLoading } = useApiQuery<MemberListResponse>('/members');
 */
export function useApiQuery<T>(path: string | null, config?: SWRConfiguration<T, ApiError>) {
  const client = useApiClient();

  return useSWR<T, ApiError>(path, (p: string) => client.get<T>(p), {
    revalidateOnFocus: false,
    ...config,
  });
}

/**
 * SWR-backed hook scoped to the active organization.
 * Prepends /organizations/:orgId to the path.
 *
 * @example
 *   const { data } = useOrgQuery<WorkflowListResponse>('/workflows');
 *   // → GET /organizations/:orgId/workflows
 */
export function useOrgQuery<T>(subPath: string | null, config?: SWRConfiguration<T, ApiError>) {
  const orgId = useOrganizationId();
  const path = subPath !== null && orgId ? `/organizations/${orgId}${subPath}` : null;
  return useApiQuery<T>(path, config);
}

/**
 * Dashboard metrics — aggregates from the analytics endpoint.
 */
export interface DashboardMetrics {
  totalMembers: number;
  activeWorkflows: number;
  pendingApprovals: number;
  aiActionsToday: number;
  orgHealth: number;
  memberGrowthMoM: number;
  workflowGrowthWoW: number;
}

export function useDashboardMetrics() {
  return useOrgQuery<{ data: DashboardMetrics }>('/analytics/dashboard');
}

/**
 * Organization members list.
 */
export interface Member {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  departmentId?: string;
  isActive: boolean;
  joinedAt: string;
}

export function useMembers(page = 1, limit = 20) {
  return useOrgQuery<{ data: Member[]; meta: { total: number; page: number; limit: number } }>(
    `/members?page=${String(page)}&limit=${String(limit)}`,
  );
}

/**
 * Workflow list.
 */
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
  const query = status ? `?status=${status}` : '';
  return useOrgQuery<{ data: Workflow[] }>(`/workflows${query}`);
}

/**
 * Recent audit events.
 */
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
  metadata?: Record<string, unknown>;
}

export function useAuditEvents(limit = 20) {
  return useOrgQuery<{ data: AuditEvent[] }>(`/audit?limit=${String(limit)}`);
}

/**
 * Pending approval queue.
 */
export interface ApprovalItem {
  id: string;
  workflowId: string;
  workflowName: string;
  requestedBy: string;
  requestedAt: string;
  dueAt?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
}

export function usePendingApprovals() {
  return useOrgQuery<{ data: ApprovalItem[] }>('/approvals?status=pending');
}
