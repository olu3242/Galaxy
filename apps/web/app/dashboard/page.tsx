'use client';

import Link from 'next/link';
import { useAuth } from '../../lib/auth/context';
import {
  useOrgHealth,
  useWorkflowStats,
  usePendingApprovals,
  useLoopInsights,
  useAIInsights,
  useAuditEvents,
} from '../../lib/api';
import { LiveActivityFeed, AIInsightCard } from '../../components/ui';
import type { ActivityItem, AIInsight } from '../../components/ui';

// ─── Role → primary dashboard mapping ────────────────────────────────────────

const ROLE_DASHBOARD: Record<string, string> = {
  super_platform_admin: '/dashboard/super-admin',
  platform_operations: '/dashboard/super-admin',
  organization_owner: '/dashboard/executive',
  organization_admin: '/dashboard/org-admin',
  executive: '/dashboard/executive',
  branch_manager: '/dashboard/workflow-ops',
  department_manager: '/dashboard/workflow-ops',
  team_lead: '/dashboard/workflow-ops',
  approver: '/dashboard/approvals',
  manager: '/dashboard/approvals',
  auditor: '/dashboard/security-ops',
};

const ROLE_LABEL: Record<string, string> = {
  super_platform_admin: 'Super Admin',
  platform_operations: 'Platform Ops',
  organization_owner: 'Owner',
  organization_admin: 'Admin',
  executive: 'Executive',
  branch_manager: 'Branch Manager',
  department_manager: 'Department Manager',
  team_lead: 'Team Lead',
  approver: 'Approver',
  manager: 'Manager',
  auditor: 'Auditor',
};

// ─── Quick-link grid shown below the hero ────────────────────────────────────

const QUICK_LINKS = [
  { href: '/dashboard/workflow-ops', label: 'Workflows', icon: '⚡', accent: '#22c55e' },
  { href: '/dashboard/approvals', label: 'Approvals', icon: '✅', accent: '#f59e0b' },
  { href: '/dashboard/agents', label: 'Agents', icon: '🤖', accent: '#a78bfa' },
  { href: '/dashboard/loops', label: 'Loops', icon: '🔄', accent: '#38bdf8' },
  { href: '/dashboard/people', label: 'People', icon: '👥', accent: '#0ea5e9' },
  { href: '/dashboard/knowledge', label: 'Knowledge', icon: '📚', accent: '#22c7a9' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: '📊', accent: '#6366f1' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️', accent: '#64748b' },
];

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  accent,
  loading,
}: {
  label: string;
  value: string;
  accent: string;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--mc-surface)',
        border: '1px solid var(--card-border)',
        borderTop: `3px solid ${accent}`,
        borderRadius: '10px',
        padding: '16px 20px',
        minWidth: 0,
      }}
    >
      <div
        className="mc-label"
        style={{ marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase' }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '26px',
          fontWeight: 800,
          color: loading ? 'var(--muted)' : accent,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {loading ? '—' : value}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MissionControlHub() {
  const { user } = useAuth();
  const { data: healthData, isLoading: healthLoading } = useOrgHealth();
  const { data: wfData, isLoading: wfLoading } = useWorkflowStats();
  const { data: approvalsData } = usePendingApprovals();
  const { data: loopData } = useLoopInsights();
  const { data: insightsData } = useAIInsights();
  const { data: auditData } = useAuditEvents(6);

  const role = user?.role ?? '';
  const primaryHref = ROLE_DASHBOARD[role] ?? '/dashboard/workflow-ops';
  const roleLabel = ROLE_LABEL[role] ?? role;
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const h = healthData?.data;
  const wf = wfData?.data;
  const pendingCount = approvalsData?.data.length ?? 0;
  const loopRate = loopData?.data.stats.completionRate;

  const insights: AIInsight[] = (insightsData?.data ?? []).slice(0, 3).map((i) => ({
    id: i.id,
    type: (i.type === 'recommendation' ? 'recommendation' : 'insight') as AIInsight['type'],
    title: i.title,
    summary: i.summary,
    confidence: i.confidence ?? 80,
    impactLevel: i.impactLevel ?? 3,
  }));

  const activity: ActivityItem[] = (auditData?.data ?? []).slice(0, 6).map((a) => ({
    id: a.id,
    type: 'system' as const,
    message: `${a.action}: ${a.resourceType} ${a.resourceId.slice(0, 8)}`,
    severity: (a.severity === 'warn' ? 'warn' : a.severity === 'error' ? 'error' : 'info') as 'info' | 'warn' | 'error' | 'success',
    timestamp: a.timestamp,
  }));

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '40px 32px',
        fontFamily: 'var(--font-body, system-ui)',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '32px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: 'var(--fg)',
                margin: 0,
                fontFamily: 'var(--font-head, system-ui)',
                letterSpacing: '-0.5px',
              }}
            >
              Good {getTimeOfDay()}, {firstName}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '6px 0 0' }}>
              {roleLabel && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '2px 10px',
                    borderRadius: '12px',
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    color: '#818cf8',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginRight: '10px',
                  }}
                >
                  {roleLabel}
                </span>
              )}
              Here&apos;s your organization at a glance.
            </p>
          </div>

          <Link
            href={primaryHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '14px',
              textDecoration: 'none',
              boxShadow: '0 0 20px rgba(99,102,241,0.3)',
              whiteSpace: 'nowrap',
            }}
          >
            Open my dashboard →
          </Link>
        </div>

        {/* ── Stat bar ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '28px',
          }}
        >
          <StatPill
            label="Org Health"
            value={h ? `${String(h.overall)}%` : '—'}
            accent="#22c55e"
            loading={healthLoading}
          />
          <StatPill
            label="Active Workflows"
            value={wf ? String(wf.active) : '—'}
            accent="#6366f1"
            loading={wfLoading}
          />
          <StatPill
            label="Pending Approvals"
            value={String(pendingCount)}
            accent={pendingCount > 0 ? '#f59e0b' : '#22c55e'}
          />
          <StatPill
            label="SLA Breaches"
            value={wf ? String(wf.slaBreaches) : '—'}
            accent={wf && wf.slaBreaches > 0 ? '#ef4444' : '#22c55e'}
            loading={wfLoading}
          />
          <StatPill
            label="Loop Completion"
            value={loopRate != null ? `${String(Math.round(loopRate))}%` : '—'}
            accent="#38bdf8"
            loading={loopData == null}
          />
        </div>

        {/* ── Quick links ── */}
        <h2 className="mc-section-title" style={{ marginBottom: '12px' }}>
          Quick Access
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '10px',
            marginBottom: '32px',
          }}
        >
          {QUICK_LINKS.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '18px 12px',
                borderRadius: '10px',
                background: 'var(--mc-surface)',
                border: '1px solid var(--card-border)',
                textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = q.accent + '60')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--card-border)')}
            >
              <span style={{ fontSize: '22px' }}>{q.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fg)' }}>
                {q.label}
              </span>
            </Link>
          ))}
        </div>

        {/* ── Two-column feed ── */}
        <div className="mc-grid-2">
          <div>
            <h2 className="mc-section-title" style={{ marginBottom: '12px' }}>
              Recent Activity
            </h2>
            <LiveActivityFeed items={activity} title="" />
          </div>

          {insights.length > 0 && (
            <div>
              <h2 className="mc-section-title" style={{ marginBottom: '12px' }}>
                AI Insights
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {insights.map((insight) => (
                  <AIInsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
