'use client';

import { useOrgQuery } from '../lib/api';

export interface AgentHealthSummary {
  agentId: string;
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  errorRate: number;
  averageLatencyMs: number;
  lastHeartbeatAt: string;
}

export interface AgentHealthData {
  agents: AgentHealthSummary[];
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
}

/**
 * Hook: real-time agent health overview.
 * Polls every 15 seconds for the Mission Control live panel.
 */
export function useAgentHealth() {
  return useOrgQuery<{ data: AgentHealthData }>('/api/v1/agent-os/health', {
    refreshInterval: 15_000,
  });
}
