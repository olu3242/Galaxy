'use client';

import {
  MetricCard,
  SystemHealthPanel,
  LiveActivityFeed,
  QueueHealthCard,
} from '../../../components/ui';
import type { SystemService, ActivityItem, QueueStats } from '../../../components/ui';
import { usePlatformMetrics, useSystemHealth, useQueueStats, useAlerts } from '../../../lib/api';

function statusNormalize(s: string): SystemService['status'] {
  if (s === 'down') return 'outage';
  if (s === 'operational' || s === 'degraded' || s === 'maintenance') return s;
  return 'maintenance';
}

type ActSev = 'info' | 'warn' | 'error' | 'success';

function toSeverity(s: string): ActSev {
  if (s === 'critical' || s === 'error') return 'error';
  if (s === 'warning' || s === 'warn') return 'warn';
  if (s === 'success') return 'success';
  return 'info';
}

export default function SuperAdminDashboard() {
  const { data: platform, isLoading: platLoading } = usePlatformMetrics();
  const { data: health } = useSystemHealth();
  const { data: queues } = useQueueStats();
  const { data: alerts } = useAlerts(8);

  const p = platform?.data;
  const v = (n: number | undefined, fmt?: (n: number) => string) =>
    platLoading ? '…' : n != null ? (fmt ? fmt(n) : String(n)) : '—';

  const services: SystemService[] = (health?.data.services ?? []).map((s) => ({
    name: s.name,
    status: statusNormalize(s.status),
    ...(s.latencyMs != null ? { latencyMs: s.latencyMs } : {}),
    ...(s.uptimePct != null ? { uptimePct: s.uptimePct } : {}),
  }));

  const queueCards: QueueStats[] = (queues?.data ?? []).map((q) => ({
    name: q.name,
    waiting: q.pending,
    active: q.active,
    completed: q.completed,
    failed: q.failed,
    delayed: q.delayed ?? 0,
  }));

  const activity: ActivityItem[] = (alerts?.data ?? []).map((a, i) => ({
    id: String(i),
    type: 'alert' as const,
    message: a.name,
    severity: toSeverity(a.severity),
    timestamp: a.firedAt,
  }));

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
            Super Admin Mission Control
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Platform-level visibility · All tenants · Real-time
          </p>
        </div>

        <div className="mc-grid" style={{ marginBottom: '24px' }}>
          <MetricCard
            label="Active Tenants"
            value={v(p?.totalOrganizations)}
            subtext="organizations"
          />
          <MetricCard
            label="Total Workflows Today"
            value={v(p?.totalWorkflows, (n) => n.toLocaleString())}
            subtext="across all orgs"
          />
          <MetricCard
            label="Active Workers"
            value={v(p?.activeWorkers)}
            subtext="processing queues"
            accent="#22c55e"
          />
          <MetricCard
            label="Avg Latency"
            value={v(p?.avgLatencyMs, (n) => `${String(n)}ms`)}
            subtext="p50 API response"
            accent="#38bdf8"
          />
          <MetricCard
            label="Failed Jobs (24h)"
            value={v(p?.failedJobs)}
            subtext="job error count"
            accent="#f59e0b"
          />
          <MetricCard
            label="Events Emitted (24h)"
            value={v(p?.totalEvents, (n) => n.toLocaleString())}
            subtext="all event types"
            accent="#a78bfa"
          />
        </div>

        <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
          <SystemHealthPanel services={services} />
          <LiveActivityFeed items={activity} title="Platform Activity" />
        </div>

        {queueCards.length > 0 && (
          <>
            <h2 className="mc-section-title">Worker Queue Health</h2>
            <div className="mc-grid-2">
              {queueCards.map((q) => (
                <QueueHealthCard key={q.name} queue={q} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
