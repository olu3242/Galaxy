'use client';

import { useAgentHealth } from '../../hooks/useAgentHealth';

const STATUS_COLOR: Record<string, string> = {
  healthy: 'text-green-500',
  degraded: 'text-yellow-500',
  unhealthy: 'text-red-500',
  unknown: 'text-gray-400',
};

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  unhealthy: 'bg-red-500',
  unknown: 'bg-gray-400',
};

/**
 * AgentHealthPanel — Mission Control live panel showing Agent OS health.
 * Auto-refreshes every 15 seconds via useAgentHealth hook.
 */
export function AgentHealthPanel() {
  const { data, isLoading, error } = useAgentHealth();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 animate-pulse">
        <div className="h-4 w-32 bg-white/10 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-white/10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
        <p className="text-sm text-red-400">Unable to load agent health data.</p>
      </div>
    );
  }

  const { agents, healthyCount, degradedCount, unhealthyCount } = data.data;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">
          Agent Health
        </h2>
        <div className="flex gap-3 text-xs">
          <span className="text-green-400">{healthyCount} healthy</span>
          {degradedCount > 0 && <span className="text-yellow-400">{degradedCount} degraded</span>}
          {unhealthyCount > 0 && <span className="text-red-400">{unhealthyCount} down</span>}
        </div>
      </div>

      <div className="space-y-2">
        {agents.map((agent) => (
          <div
            key={agent.agentId}
            className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${STATUS_DOT[agent.status] ?? 'bg-gray-400'}`}
              />
              <span className="text-sm text-white/90">{agent.name}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/50">
              <span>{agent.averageLatencyMs.toFixed(0)}ms</span>
              <span className={STATUS_COLOR[agent.status] ?? 'text-gray-400'}>{agent.status}</span>
            </div>
          </div>
        ))}

        {agents.length === 0 && (
          <p className="text-sm text-white/40 text-center py-4">No agents registered.</p>
        )}
      </div>
    </div>
  );
}
