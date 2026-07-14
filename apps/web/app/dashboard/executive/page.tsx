'use client';

import { MetricCard, AIInsightCard, LiveActivityFeed, AuditTimeline } from '../../../components/ui';
import type { AIInsight, ActivityItem, AuditEntry } from '../../../components/ui';
import {
  useKPIs,
  useOrgHealth,
  useLoopInsights,
  useAIInsights,
  useAIRecommendations,
  useRiskSignals,
  usePendingApprovals,
  useAuditEvents,
} from '../../../lib/api';

type AuditSev = 'info' | 'warn' | 'error' | 'success';
type ActSev = 'info' | 'warn' | 'error' | 'success';

function auditSeverity(s: string): AuditSev {
  if (s === 'warn') return 'warn';
  if (s === 'error') return 'error';
  if (s === 'success') return 'success';
  return 'info';
}

function actSeverity(s: string): ActSev {
  if (s === 'warn') return 'warn';
  if (s === 'error') return 'error';
  return 'info';
}

export default function ExecutiveDashboard() {
  const { data: kpisData, isLoading: kpisLoading } = useKPIs();
  const { data: orgHealthData } = useOrgHealth();
  const { data: loopData } = useLoopInsights();
  const { data: insightsData } = useAIInsights();
  const { data: recsData } = useAIRecommendations();
  const { data: risksData } = useRiskSignals();
  const { data: approvalsData } = usePendingApprovals();
  const { data: auditData } = useAuditEvents(5);

  const kpis = kpisData?.data ?? [];
  const kv = (name: string) => {
    if (kpisLoading) return '…';
    const k = kpis.find((kk) => kk.name === name);
    return k ? String(k.value) : '—';
  };

  const allInsights: AIInsight[] = [
    ...(insightsData?.data ?? []),
    ...(recsData?.data ?? []),
    ...(risksData?.data ?? []).map((r) => ({
      id: r.id,
      type: 'risk' as const,
      title: r.description,
      summary: `Severity: ${r.severity}. Type: ${r.type}.`,
      confidence: 95,
      impactLevel: r.severity === 'critical' ? 5 : r.severity === 'high' ? 4 : 3,
    })),
  ]
    .slice(0, 4)
    .map((i) => ({
      id: i.id,
      type: i.type as AIInsight['type'],
      title: i.title,
      summary: i.summary,
      confidence: i.confidence,
      impactTier: Math.min(5, Math.max(1, Math.round(i.impactLevel))) as 1 | 2 | 3 | 4 | 5,
    }));

  const pendingCount = approvalsData?.data.length ?? 0;
  const highPriority =
    approvalsData?.data.filter((a) => a.priority === 'high' || a.priority === 'critical').length ??
    0;

  const activity: ActivityItem[] = (auditData?.data ?? []).slice(0, 6).map((e) => ({
    id: e.id,
    type:
      e.actorType === 'agent'
        ? ('agent' as const)
        : e.resourceType === 'approval'
          ? ('approval' as const)
          : ('workflow' as const),
    message: `${e.action} on ${e.resourceType} ${e.resourceId}`,
    actor: e.actorId,
    severity: actSeverity(e.severity),
    timestamp: e.timestamp,
  }));

  const auditEntries: AuditEntry[] = (auditData?.data ?? []).slice(0, 5).map((e) => ({
    id: e.id,
    action: e.action,
    actor: e.actorId,
    actorType: e.actorType,
    resource: e.resourceType,
    resourceId: e.resourceId,
    severity: auditSeverity(e.severity),
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
            Executive Dashboard
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Strategic operations · AI-assisted · {new Date().toLocaleDateString()}
          </p>
        </div>

        <div className="mc-grid" style={{ marginBottom: '24px' }}>
          <MetricCard label="Workflows This Month" value={kv('workflows_monthly')} />
          <MetricCard label="SLA Compliance" value={kv('sla_compliance')} accent="#22c55e" />
          <MetricCard
            label="Pending Approvals"
            value={String(pendingCount)}
            {...(highPriority > 0 ? { subtext: `${String(highPriority)} high priority` } : {})}
            accent="#f59e0b"
          />
          <MetricCard
            label="Org Health Score"
            value={
              orgHealthData?.data.overall !== undefined
                ? `${String(orgHealthData.data.overall)}%`
                : '…'
            }
            {...(orgHealthData?.data.workflowMetrics
              ? {
                  subtext: `${String(orgHealthData.data.workflowMetrics.slaBreaches)} SLA breaches`,
                }
              : {})}
            accent={
              (orgHealthData?.data.overall ?? 100) >= 80
                ? '#22c55e'
                : (orgHealthData?.data.overall ?? 100) >= 60
                  ? '#f59e0b'
                  : '#ef4444'
            }
          />
          <MetricCard
            label="Risk Signals"
            value={String(risksData?.data.length ?? 0)}
            subtext="active signals"
            accent="#ef4444"
          />
          <MetricCard label="AI Actions Today" value={kv('ai_actions_today')} accent="#38bdf8" />
          <MetricCard label="Compliance Score" value={kv('compliance_score')} accent="#22c55e" />
        </div>

        {allInsights.length > 0 && (
          <>
            <h2 className="mc-section-title">AI Insights</h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '24px',
              }}
            >
              {allInsights.map((i) => (
                <AIInsightCard key={i.id} insight={i} />
              ))}
            </div>
          </>
        )}

        <div className="mc-grid-2">
          <LiveActivityFeed items={activity} title="Today's Activity" />
          <AuditTimeline entries={auditEntries} />
        </div>

        {(loopData?.data.stats.total ?? 0) > 0 && (
          <>
            <h2 className="mc-section-title" style={{ marginTop: '24px' }}>
              Loop OS — Learning Insights
            </h2>
            <div className="mc-grid" style={{ marginBottom: '16px' }}>
              <MetricCard
                label="Loop Completion Rate"
                value={`${String(loopData?.data.stats.completionRate ?? 0)}%`}
                accent="#22c55e"
              />
              <MetricCard
                label="Avg Feedback Score"
                value={
                  loopData?.data.stats.avgFeedbackScore !== null &&
                  loopData?.data.stats.avgFeedbackScore !== undefined
                    ? `${String(loopData.data.stats.avgFeedbackScore)}/5`
                    : '—'
                }
                accent="#6366f1"
              />
              <MetricCard label="Total Loops" value={String(loopData?.data.stats.total ?? 0)} />
              <MetricCard
                label="Escalated"
                value={String(loopData?.data.stats.escalated ?? 0)}
                accent="#ef4444"
              />
            </div>
            {(loopData?.data.insights.length ?? 0) > 0 && (
              <div
                style={{
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '10px',
                  padding: '16px 20px',
                  marginBottom: '24px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '10px',
                  }}
                >
                  Latest AI-Generated Insights
                </div>
                {loopData?.data.insights.slice(0, 2).map((insight) => (
                  <div
                    key={insight.id}
                    style={{
                      marginBottom: '12px',
                      paddingBottom: '12px',
                      borderBottom: '1px solid var(--mc-border)',
                    }}
                  >
                    <div style={{ fontSize: '13px', color: 'var(--fg)', marginBottom: '4px' }}>
                      {insight.summary}
                    </div>
                    {insight.recommendations.slice(0, 2).map((rec, i) => (
                      <div
                        key={i}
                        style={{ fontSize: '12px', color: 'var(--muted)', paddingLeft: '12px' }}
                      >
                        · {rec}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
