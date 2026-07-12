import type { Metadata } from 'next';
import {
  MetricCard,
  SystemHealthPanel,
  LiveActivityFeed,
  QueueHealthCard,
} from '../../../components/ui';
import type { SystemService, ActivityItem, QueueStats } from '../../../components/ui';

export const metadata: Metadata = {
  title: 'Super Admin Mission Control — Galaxy',
  description: 'Platform-level operations and tenant management',
};

const SERVICES: SystemService[] = [
  { name: 'API Gateway', status: 'operational', latencyMs: 24, uptimePct: 99.98 },
  { name: 'Worker Fleet', status: 'operational', latencyMs: 12, uptimePct: 99.95 },
  { name: 'PostgreSQL', status: 'operational', latencyMs: 8, uptimePct: 99.99 },
  { name: 'Redis', status: 'operational', latencyMs: 2, uptimePct: 99.99 },
  { name: 'Event Bus', status: 'operational', latencyMs: 15, uptimePct: 99.97 },
  { name: 'WhatsApp Gateway', status: 'operational', latencyMs: 142, uptimePct: 99.9 },
];

const QUEUES: QueueStats[] = [
  { name: 'workflow-execution', waiting: 3, active: 12, completed: 4821, failed: 7, delayed: 0 },
  { name: 'agent-execution', waiting: 1, active: 5, completed: 1204, failed: 2, delayed: 0 },
  { name: 'notification-dispatch', waiting: 8, active: 3, completed: 9423, failed: 1, delayed: 2 },
  { name: 'loop-learning', waiting: 0, active: 1, completed: 312, failed: 0, delayed: 0 },
];

const ACTIVITY: ActivityItem[] = [
  {
    id: '1',
    type: 'system',
    message: 'Migration 075 applied to prod',
    severity: 'success',
    timestamp: new Date(Date.now() - 300_000).toISOString(),
  },
  {
    id: '2',
    type: 'alert',
    message: 'Tenant galaxy-fintech approaching queue limit',
    severity: 'warn',
    timestamp: new Date(Date.now() - 600_000).toISOString(),
  },
  {
    id: '3',
    type: 'agent',
    message: 'GUARDIAN blocked unauthorized delegation request',
    severity: 'warn',
    timestamp: new Date(Date.now() - 900_000).toISOString(),
  },
  {
    id: '4',
    type: 'workflow',
    message: '5000th workflow completed today',
    severity: 'success',
    timestamp: new Date(Date.now() - 1_200_000).toISOString(),
  },
];

export default function SuperAdminDashboard() {
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

        {/* Platform KPIs */}
        <div className="mc-grid" style={{ marginBottom: '24px' }}>
          <MetricCard
            label="Active Tenants"
            value="127"
            subtext="+3 this week"
            delta={{ value: 2.4, label: 'WoW' }}
          />
          <MetricCard
            label="Total Workflows Today"
            value="5,213"
            subtext="across all orgs"
            delta={{ value: 8.1, label: 'vs yesterday' }}
          />
          <MetricCard label="Active Workers" value="24" subtext="8 queues" accent="#22c55e" />
          <MetricCard
            label="Avg Latency"
            value="24ms"
            subtext="p50 API response"
            accent="#38bdf8"
          />
          <MetricCard
            label="Failed Jobs (24h)"
            value="10"
            subtext="0.19% error rate"
            accent="#f59e0b"
          />
          <MetricCard
            label="Events Emitted (24h)"
            value="98,421"
            subtext="all event types"
            accent="#a78bfa"
          />
        </div>

        <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
          <SystemHealthPanel services={SERVICES} />
          <LiveActivityFeed items={ACTIVITY} title="Platform Activity" />
        </div>

        <h2 className="mc-section-title">Worker Queue Health</h2>
        <div className="mc-grid-2">
          {QUEUES.map((q) => (
            <QueueHealthCard key={q.name} queue={q} />
          ))}
        </div>
      </div>
    </main>
  );
}
