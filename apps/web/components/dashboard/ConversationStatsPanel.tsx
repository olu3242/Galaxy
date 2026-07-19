'use client';

import { useConversationStats } from '../../hooks/useConversationStats';

/**
 * ConversationStatsPanel — Mission Control live panel for WhatsApp runtime stats.
 * Auto-refreshes every 20 seconds via useConversationStats hook.
 */
export function ConversationStatsPanel() {
  const { data, isLoading, error } = useConversationStats();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 animate-pulse">
        <div className="h-4 w-40 bg-white/10 rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-white/10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
        <p className="text-sm text-red-400">Unable to load conversation stats.</p>
      </div>
    );
  }

  const stats = data.data;
  const handoffPct = (stats.humanHandoffRate * 100).toFixed(1);
  const avgSec = (stats.avgResponseTimeMs / 1000).toFixed(1);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-4">
        WhatsApp Conversations
      </h2>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatTile label="Open Sessions" value={stats.openSessions} color="text-blue-400" />
        <StatTile label="Resolved Today" value={stats.resolvedToday} color="text-green-400" />
        <StatTile label="Avg Response" value={`${avgSec}s`} color="text-purple-400" />
        <StatTile
          label="Human Handoff"
          value={`${handoffPct}%`}
          color={stats.humanHandoffRate > 0.3 ? 'text-yellow-400' : 'text-green-400'}
        />
      </div>

      {stats.topIntents.length > 0 && (
        <div>
          <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">Top Intents</p>
          <div className="space-y-1">
            {stats.topIntents.slice(0, 4).map(({ intent, count }) => (
              <div key={intent} className="flex justify-between text-xs">
                <span className="text-white/70">{intent.replace(/_/g, ' ')}</span>
                <span className="text-white/40">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-white/5 px-3 py-3">
      <p className="text-xs text-white/40 mb-1">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
