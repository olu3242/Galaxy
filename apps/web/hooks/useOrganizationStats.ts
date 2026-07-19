'use client';

import { useOrgQuery } from '../lib/api';

export interface OrganizationStats {
  totalWorkflows: number;
  runningWorkflows: number;
  pendingApprovals: number;
  activeAgents: number;
  knowledgeDocuments: number;
  alertCount: number;
}

export function useOrganizationStats() {
  return useOrgQuery<{ data: OrganizationStats }>('/api/v1/analytics/summary', {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });
}
