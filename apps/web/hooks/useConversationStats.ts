'use client';

import { useOrgQuery } from '../lib/api';

export interface ConversationStats {
  openSessions: number;
  resolvedToday: number;
  avgResponseTimeMs: number;
  humanHandoffRate: number;
  topIntents: Array<{ intent: string; count: number }>;
}

/**
 * Hook: live conversation / WhatsApp runtime stats.
 * Polls every 20 seconds for the Mission Control live panel.
 */
export function useConversationStats() {
  return useOrgQuery<{ data: ConversationStats }>('/api/v1/conversation/stats', {
    refreshInterval: 20_000,
  });
}
