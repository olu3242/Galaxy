'use client';

import {
  MetricCard,
  QueueHealthCard,
  LiveActivityFeed,
  AIInsightCard,
  AuditTimeline,
} from '../../../components/ui';
import type { QueueStats, ActivityItem, AIInsight, AuditEntry } from '../../../components/ui';
import {
  useWorkflowStats,
  useQueueStats,
  useAIInsights,
  useAuditEvents,
  usePendingApprovals,
} from '../../../lib/api';

type AuditSev = 'info' | 'warn' | 'error' | 'success';
type ActSev = 'info' | 'warn' | 'error' | 'success';

function auditSev(s: string): AuditSev {
  if (s === 'warn') return 'warn';
  if (s === 'error') return 'error';
  return 'info';
}

function actSev(s: string): ActSev {
  if (s === 'warn') return 'warn';
  if (s === 'error') return 'error';
  return 'info';
}

export default function WorkflowOpsDashboard() {
  const { data: statsData, isLoading } = useWorkflowStats();
  const { data: queuesData } = useQueueStats();
  const { data: insightsData } = useAIInsights();
  const { data: auditData } = useAuditEvents(6);
  const { data: approvalsData } = usePendingApprovals();

  const s = statsData?.data;
  const mv = (val: string | number | undefined) =>
    isLoading ? '…' : val != null ? String(val) : '—';

  const pendingCount = approvalsData?.data.length ?? 0;
  const overdue =
    approvalsData?.data.filter((a) => a.dueAt != null && new Date(a.dueAt) < new Date()).length ??
    0;

  const queueCards: QueueStats[] = (queuesData?.data ?? []).map((q) => ({
    name: q.name,
    waiting: q.pending,
    active: q.active,
    completed: q.completed,
    failed: q.failed,
    delayed: q.delayed ?? 0,
  }));

  const insights: AIInsight[] = (insightsData?.data ?? []).slice(0, 3).map((i) => ({
    id: i.id,
    type: i.type as AIInsight['type'],
    title: i.title,
    summary: i.summary,
    confidence: i.confidence,
    impactTier: Math.min(5, Math.max(1, Math.round(i.impactLevel))) as 1 | 2 | 3 | 4 | 5,
  }));

  const activity: ActivityItem[] = (auditData?.data ?? []).map((e) => ({
    id: e.id,
    type: e.actorType === 'agent' ? ('agent' as const) : ('workflow' as const),
    message: `${e.action} on ${e.resourceType}`,
    actor: e.actorId,
    severity: actSev(e.severity),
    timestamp: e.timestamp,
  }));

  const auditEntries: AuditEntry[] = (auditData?.data ?? []).slice(0, 4).map((e) => ({
    id: e.id,
    action: e.action,
    actor: e.actorId,
    actorType: e.actorType,
    resource: e.resourceType,
    resourceId: e.resourceId,
    severity: auditSev(e.severity),
    timestamp: e.timestamp,
    correlationId: e.correlationId,
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
            Workflow Operations
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Queues · Rules · Approvals · Escalations · Automation Governance
          </p>
        </div>

        <div className="mc-grid" style={{ marginBottom: '24px' }}>
          <MetricCard label="Active Workflows" value={mv(s?.active)} accent="#6366f1" />
          <MetricCard
            label="Pending Approvals"
            value={String(pendingCount)}
            {...(overdue > 0 ? { subtext: `${String(overdue)} overdue` } : {})}
            accent="#ef4444"
          />
          <MetricCard label="Completed Today" value={mv(s?.completed)} />
          <MetricCard
            label="Avg Approval Time"
            value={s ? `${s.avgDurationHours.toFixed(1)}h` : mv(undefined)}
            subtext="target: 4h"
            accent="#f59e0b"
          />
          <MetricCard
            label="Auto-approved"
            value={s ? `${(s.autoApprovalRate * 100).toFixed(0)}%` : mv(undefined)}
            accent="#10b981"
          />
          <MetricCard
            label="SLA Breaches"
            value={mv(s?.slaBreaches)}
            subtext="this period"
            accent="#ef4444"
          />
        </div>

        {queueCards.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <p className="mc-section-title">Queue Health</p>
            <div className="mc-grid-2">
              {queueCards.map((q) => (
                <QueueHealthCard key={q.name} queue={q} />
              ))}
            </div>
          </div>
        )}

        <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {insights.map((i) => (
              <AIInsightCard key={i.id} insight={i} />
            ))}
          </div>
          <LiveActivityFeed items={activity} title="Workflow Activity" />
        </div>

        <AuditTimeline entries={auditEntries} title="Workflow Audit Trail" />
      </div>
    </main>
  );
}
