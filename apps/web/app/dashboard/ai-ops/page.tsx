import type { Metadata } from 'next';
import { AgentCard, MetricCard, LiveActivityFeed, QueueHealthCard } from '../../../components/ui';
import type { AgentCardProps, ActivityItem, QueueStats } from '../../../components/ui';

export const metadata: Metadata = {
  title: 'AI Operations Center — Galaxy',
  description: 'Real-time agent fleet operations and monitoring',
};

const AGENTS: Omit<AgentCardProps, 'id'>[] = [
  {
    name: 'ALICE',
    fullName: 'Automated Lifecycle Intelligence & Coordination Engine',
    state: 'EXECUTING',
    currentTask: 'Processing workflow wf-4821 approval chain',
    completedToday: 142,
    successRate: 99,
    impactTier: 3,
  },
  {
    name: 'MAX',
    fullName: 'Multi-Agent eXecution Coordinator',
    state: 'THINKING',
    currentTask: 'Routing 3 parallel approval requests',
    completedToday: 87,
    successRate: 97,
    impactTier: 3,
  },
  {
    name: 'GUARDIAN',
    fullName: 'Governance, Compliance & Security Agent',
    state: 'VERIFYING',
    currentTask: 'Auditing permission matrix for org galaxy-fintech',
    completedToday: 56,
    successRate: 100,
    impactTier: 5,
  },
  {
    name: 'ALICE',
    fullName: 'Analytics & Learning Intelligence Engine',
    state: 'IDLE',
    completedToday: 23,
    successRate: 95,
    impactTier: 2,
  },
  {
    name: 'NOVA',
    fullName: 'Notification & Outreach Automation Agent',
    state: 'EXECUTING',
    currentTask: 'Dispatching 14 WhatsApp notifications',
    completedToday: 1204,
    successRate: 99,
    impactTier: 1,
  },
  {
    name: 'SAGE',
    fullName: 'Strategic Analysis & Guidance Engine',
    state: 'COMPLETED',
    completedToday: 18,
    successRate: 94,
    impactTier: 4,
  },
];

const QUEUES: QueueStats[] = [
  { name: 'agent-execution', waiting: 1, active: 5, completed: 1204, failed: 2, delayed: 0 },
  { name: 'workflow-execution', waiting: 3, active: 12, completed: 4821, failed: 7, delayed: 0 },
];

const ACTIVITY: ActivityItem[] = [
  {
    id: '1',
    type: 'agent',
    message: 'GUARDIAN blocked privilege escalation attempt',
    actor: 'GUARDIAN',
    severity: 'warn',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: '2',
    type: 'agent',
    message: 'ALICE completed approval routing for 12 workflows',
    actor: 'ALICE',
    severity: 'success',
    timestamp: new Date(Date.now() - 300_000).toISOString(),
  },
  {
    id: '3',
    type: 'agent',
    message: 'MAX orchestrated 3-agent parallel task',
    actor: 'MAX',
    severity: 'info',
    timestamp: new Date(Date.now() - 600_000).toISOString(),
  },
  {
    id: '4',
    type: 'agent',
    message: 'NOVA sent 500th notification of the day',
    actor: 'NOVA',
    severity: 'success',
    timestamp: new Date(Date.now() - 900_000).toISOString(),
  },
];

export default function AIOpsDashboard() {
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
          <MetricCard label="Agents Active" value="4 / 15" subtext="11 idle" accent="#22c55e" />
          <MetricCard
            label="Tasks Completed (24h)"
            value="1,530"
            delta={{ value: 5.3, label: 'vs yesterday' }}
          />
          <MetricCard label="Avg Success Rate" value="97.3%" accent="#22c55e" />
          <MetricCard
            label="Governance Blocks"
            value="3"
            subtext="all GUARDIAN-caught"
            accent="#f97316"
          />
          <MetricCard label="Avg Task Duration" value="2.4s" accent="#38bdf8" />
          <MetricCard
            label="Memory Ops (24h)"
            value="8,421"
            subtext="episodic + semantic"
            accent="#a78bfa"
          />
        </div>

        <h2 className="mc-section-title">Agent Fleet</h2>
        <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
          {AGENTS.map((agent, i) => (
            <AgentCard key={i} id={String(i)} {...agent} />
          ))}
        </div>

        <div className="mc-grid-2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 className="mc-section-title" style={{ margin: 0 }}>
              Queue Health
            </h2>
            {QUEUES.map((q) => (
              <QueueHealthCard key={q.name} queue={q} />
            ))}
          </div>
          <LiveActivityFeed items={ACTIVITY} title="Agent Activity" />
        </div>
      </div>
    </main>
  );
}
