import type { Metadata } from 'next';
import { MetricCard, AIInsightCard, LiveActivityFeed, AuditTimeline } from '../../../components/ui';
import type { AIInsight, ActivityItem, AuditEntry } from '../../../components/ui';

export const metadata: Metadata = {
  title: 'Executive Dashboard — Galaxy',
  description: 'Strategic operations view for executives',
};

const INSIGHTS: AIInsight[] = [
  {
    id: '1',
    type: 'recommendation',
    title: 'Approval bottleneck in Finance workflows',
    summary:
      '23% of finance approvals are sitting in Tier 2 for >4 hours. Consider delegating to regional managers during peak hours.',
    confidence: 87,
    impactTier: 3,
    actions: [{ label: 'Create Delegation Rule' }, { label: 'View Workflows' }],
  },
  {
    id: '2',
    type: 'forecast',
    title: 'Workflow volume up 40% next quarter',
    summary:
      'Based on onboarding pipeline and seasonal patterns, Q3 will see a significant increase. Scale workers before August.',
    confidence: 74,
    impactTier: 2,
    actions: [{ label: 'View Forecast' }],
  },
  {
    id: '3',
    type: 'risk',
    title: 'Two dormant accounts with elevated permissions',
    summary:
      'Users olu.adeyemo@acme.com and j.smith@acme.com have not logged in for 45 days but hold admin-level roles.',
    confidence: 99,
    impactTier: 4,
    actions: [{ label: 'Suspend Accounts' }, { label: 'Review Permissions' }],
  },
];

const ACTIVITY: ActivityItem[] = [
  {
    id: '1',
    type: 'approval',
    message: 'Procurement workflow approved by CFO',
    actor: 'CFO',
    severity: 'success',
    timestamp: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: '2',
    type: 'agent',
    message: 'COO Copilot generated weekly ops briefing',
    severity: 'info',
    timestamp: new Date(Date.now() - 600_000).toISOString(),
  },
  {
    id: '3',
    type: 'workflow',
    message: 'Board reporting package compiled',
    severity: 'success',
    timestamp: new Date(Date.now() - 1_800_000).toISOString(),
  },
];

const AUDIT: AuditEntry[] = [
  {
    id: '1',
    action: 'approve',
    actor: 'CFO',
    actorType: 'member',
    resource: 'workflow',
    resourceId: 'wf-001',
    status: 'success',
    timestamp: new Date(Date.now() - 120_000).toISOString(),
    correlationId: 'c1234567-0000-0000-0000-000000000000',
  },
  {
    id: '2',
    action: 'delegation.created',
    actor: 'VP Operations',
    actorType: 'member',
    resource: 'delegation',
    status: 'success',
    timestamp: new Date(Date.now() - 3_600_000).toISOString(),
    correlationId: 'c2345678-0000-0000-0000-000000000000',
  },
];

export default function ExecutiveDashboard() {
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
            Executive Dashboard
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Strategic operations · AI-assisted · {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Executive KPIs */}
        <div className="mc-grid" style={{ marginBottom: '24px' }}>
          <MetricCard
            label="Workflows This Month"
            value="1,847"
            delta={{ value: 12.4, label: 'MoM' }}
          />
          <MetricCard
            label="SLA Compliance"
            value="97.3%"
            delta={{ value: 1.2, label: 'vs last month' }}
            accent="#22c55e"
          />
          <MetricCard
            label="Pending Approvals"
            value="14"
            subtext="3 high priority"
            accent="#f59e0b"
          />
          <MetricCard
            label="Active Delegations"
            value="6"
            subtext="2 expiring soon"
            accent="#a78bfa"
          />
          <MetricCard
            label="AI Actions Today"
            value="234"
            subtext="ALICE, MAX, GUARDIAN"
            accent="#38bdf8"
          />
          <MetricCard
            label="Compliance Score"
            value="94%"
            delta={{ value: 2.1, label: 'vs last audit' }}
            accent="#22c55e"
          />
        </div>

        {/* AI Insights */}
        <h2 className="mc-section-title">AI Insights</h2>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}
        >
          {INSIGHTS.map((i) => (
            <AIInsightCard key={i.id} insight={i} />
          ))}
        </div>

        <div className="mc-grid-2">
          <LiveActivityFeed items={ACTIVITY} title="Today's Activity" />
          <AuditTimeline entries={AUDIT} />
        </div>
      </div>
    </main>
  );
}
