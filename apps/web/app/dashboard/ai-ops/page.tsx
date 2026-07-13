'use client';

import { AgentCard, MetricCard, LiveActivityFeed, QueueHealthCard } from '../../../components/ui';
import type { AgentState, ActivityItem, QueueStats } from '../../../components/ui';
import { useAgentOverview, useQueueStats, useAuditEvents } from '../../../lib/api';

function toAgentState(status: string): AgentState {
  const s = status.toUpperCase();
  if (s === 'IDLE') return 'IDLE';
  if (s === 'THINKING') return 'THINKING';
  if (s === 'EXECUTING' || s === 'RUNNING' || s === 'ACTIVE') return 'EXECUTING';
  if (s === 'VERIFYING') return 'VERIFYING';
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'FAILED' || s === 'ERROR') return 'FAILED';
  if (s === 'ESCALATED') return 'ESCALATED';
  return 'OBSERVING';
}

export default function AIOpsDashboard() {
  const { data: overviewData, isLoading } = useAgentOverview();
  const { data: queuesData } = useQueueStats();
  const { data: auditData } = useAuditEvents(6);

  const overview = overviewData?.data;
  const agents = overview?.agents ?? [];

  const queueCards: QueueStats[] = (queuesData?.data ?? [])
    .filter((q) => q.name.includes('agent') || q.name.includes('workflow'))
    .map((q) => ({
      name: q.name,
      waiting: q.pending,
      active: q.active,
      completed: q.completed,
      failed: q.failed,
      delayed: q.delayed ?? 0,
    }));

  const activity: ActivityItem[] = (auditData?.data ?? [])
    .filter((e) => e.actorType === 'agent')
    .map((e) => ({
      id: e.id,
      type: 'agent' as const,
      message: `${e.action} on ${e.resourceType}`,
      actor: e.actorId,
      severity:
        e.severity === 'warn' ? 'warn' : e.severity === 'error' ? 'error' : ('info' as const),
      timestamp: e.timestamp,
    }));

  const mv = (n: number | undefined) => (isLoading ? '…' : n != null ? String(n) : '—');

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            AI Operations Center
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Agent fleet · Real-time execution · 9-stage lifecycle
          </p>
        </div>

        <div className="mc-grid" style={{ marginBottom: '24px' }}>
          <MetricCard
            label="Agents Active"
            value={
              overview ? `${String(overview.activeAgents)} / ${String(overview.totalAgents)}` : '…'
            }
            {...(overview
              ? { subtext: `${String(overview.totalAgents - overview.activeAgents)} idle` }
              : {})}
            accent="#22c55e"
          />
          <MetricCard label="Tasks Completed (24h)" value={mv(overview?.executionsToday)} />
          <MetricCard
            label="Pending Approvals"
            value={mv(overview?.pendingApprovals)}
            accent="#f59e0b"
          />
          <MetricCard label="Total Agents" value={mv(overview?.totalAgents)} accent="#38bdf8" />
          <MetricCard label="Active Agents" value={mv(overview?.activeAgents)} accent="#22c55e" />
          <MetricCard
            label="Executions Today"
            value={mv(overview?.executionsToday)}
            subtext="tasks processed"
            accent="#a78bfa"
          />
        </div>

        {agents.length > 0 && (
          <>
            <h2 className="mc-section-title">Agent Fleet</h2>
            <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  id={agent.id}
                  name={agent.name}
                  fullName={agent.type}
                  state={toAgentState(agent.status)}
                  {...(agent.lastExecutedAt != null
                    ? {
                        currentTask: `Last ran ${new Date(agent.lastExecutedAt).toLocaleTimeString()}`,
                      }
                    : {})}
                  completedToday={0}
                  successRate={100}
                  impactTier={3}
                />
              ))}
            </div>
          </>
        )}

        <div className="mc-grid-2">
          {queueCards.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 className="mc-section-title" style={{ margin: 0 }}>
                Queue Health
              </h2>
              {queueCards.map((q) => (
                <QueueHealthCard key={q.name} queue={q} />
              ))}
            </div>
          )}
          <LiveActivityFeed items={activity} title="Agent Activity" />
        </div>
      </div>
    </main>
  );
}
