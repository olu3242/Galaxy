import type { Metadata } from 'next';
import {
  MetricCard,
  QueueHealthCard,
  LiveActivityFeed,
  AIInsightCard,
  AuditTimeline,
} from '../../../components/ui';
import type { QueueStats, ActivityItem, AIInsight, AuditEntry } from '../../../components/ui';

export const metadata: Metadata = {
  title: 'Workflow Ops — Galaxy',
  description: 'Workflow engine monitoring, queue health, and automation governance',
};

const QUEUES: QueueStats[] = [
  { name: 'Approval Queue', waiting: 12, active: 4, completed: 1847, failed: 3, delayed: 2 },
  { name: 'Notification Queue', waiting: 0, active: 1, completed: 9421, failed: 0, delayed: 0 },
  { name: 'Report Queue', waiting: 3, active: 2, completed: 412, failed: 1, delayed: 5 },
  { name: 'Escalation Queue', waiting: 1, active: 0, completed: 298, failed: 2, delayed: 0 },
];

const INSIGHTS: AIInsight[] = [
  {
    id: '1',
    type: 'optimization',
    title: 'Approval bottleneck in Finance division',
    summary:
      '68% of Finance approvals stall at the Treasury head node. Parallel routing to 2 approvers could reduce median approval time from 14h to 4h.',
    confidence: 91,
    impactTier: 3,
    actions: [{ label: 'Auto-route' }, { label: 'View Rules' }],
  },
  {
    id: '2',
    type: 'anomaly',
    title: 'Spike in failed workflow submissions',
    summary:
      '17 failed submissions in the last 2 hours — 14× baseline. All failures originate from the WhatsApp webhook handler for Lagos Branch.',
    confidence: 97,
    impactTier: 2,
    actions: [{ label: 'Investigate' }],
  },
];

const ACTIVITY: ActivityItem[] = [
  {
    id: '1',
    type: 'approval',
    message: 'Purchase order #4821 approved by CFO (₦2.4M)',
    actor: 'CFO Copilot',
    severity: 'success',
    timestamp: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: '2',
    type: 'alert',
    message: 'Workflow #WF-0042 escalated — SLA breach in 30 min',
    severity: 'warn',
    timestamp: new Date(Date.now() - 480_000).toISOString(),
  },
  {
    id: '3',
    type: 'workflow',
    message: 'Monthly payroll workflow triggered for 312 members',
    actor: 'Scheduler',
    severity: 'info',
    timestamp: new Date(Date.now() - 1_800_000).toISOString(),
  },
  {
    id: '4',
    type: 'system',
    message: 'Loop Engine completed 3 workflow optimizations',
    severity: 'success',
    timestamp: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: '5',
    type: 'alert',
    message: '14 webhook submissions failed from Lagos Branch',
    severity: 'error',
    timestamp: new Date(Date.now() - 7_200_000).toISOString(),
  },
];

const AUDIT: AuditEntry[] = [
  {
    id: '1',
    action: 'workflow.rule_modified',
    actor: 'admin@acme.com',
    resource: 'ApprovalRule #88',
    timestamp: new Date(Date.now() - 900_000).toISOString(),
    severity: 'warn',
    detail: 'Escalation threshold changed from 24h to 12h',
  },
  {
    id: '2',
    action: 'workflow.submitted',
    actor: 'WhatsApp / Lagos',
    resource: 'PO #4821',
    timestamp: new Date(Date.now() - 1_200_000).toISOString(),
    severity: 'info',
  },
  {
    id: '3',
    action: 'workflow.auto_approved',
    actor: 'Loop Engine',
    resource: 'Leave Request #LR-339',
    timestamp: new Date(Date.now() - 2_400_000).toISOString(),
    severity: 'info',
    detail: 'Confidence 97% — within auto-approve threshold',
  },
  {
    id: '4',
    action: 'workflow.escalated',
    actor: 'Escalation Engine',
    resource: 'WF-0042',
    timestamp: new Date(Date.now() - 4_800_000).toISOString(),
    severity: 'error',
    detail: 'No approver response after 8h',
  },
];

export default function WorkflowOpsDashboard() {
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
            Workflow Operations
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Queues · Rules · Approvals · Escalations · Automation Governance
          </p>
        </div>

        <div className="mc-grid" style={{ marginBottom: '24px' }}>
          <MetricCard
            label="Active Workflows"
            value="156"
            delta={{ value: 8.4, label: 'WoW' }}
            accent="#6366f1"
          />
          <MetricCard label="Pending Approvals" value="12" subtext="4 overdue" accent="#ef4444" />
          <MetricCard label="Completed Today" value="284" delta={{ value: 12.1, label: 'DoD' }} />
          <MetricCard
            label="Avg Approval Time"
            value="6.2h"
            subtext="target: 4h"
            accent="#f59e0b"
          />
          <MetricCard
            label="Auto-approved"
            value="71%"
            delta={{ value: 5.3, label: 'WoW' }}
            accent="#10b981"
          />
          <MetricCard label="SLA Breaches" value="3" subtext="this week" accent="#ef4444" />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <p className="mc-section-title">Queue Health</p>
          <div className="mc-grid-2">
            {QUEUES.map((q) => (
              <QueueHealthCard key={q.name} queue={q} />
            ))}
          </div>
        </div>

        <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {INSIGHTS.map((i) => (
              <AIInsightCard key={i.id} insight={i} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <LiveActivityFeed items={ACTIVITY} title="Workflow Activity" />
          </div>
        </div>

        <AuditTimeline entries={AUDIT} title="Workflow Audit Trail" />
      </div>
    </main>
  );
}
