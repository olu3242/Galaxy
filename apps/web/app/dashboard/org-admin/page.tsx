'use client';

import {
  MetricCard,
  OrganizationTree,
  LiveActivityFeed,
  AIInsightCard,
} from '../../../components/ui';
import type { OrgNode, ActivityItem, AIInsight } from '../../../components/ui';
import {
  useMembers,
  useDepartments,
  useWorkflows,
  usePendingApprovals,
  useAIInsights,
  useAuditEvents,
} from '../../../lib/api';

function buildTree(
  depts: {
    id: string;
    name: string;
    parentDepartmentId?: string | undefined;
    memberCount?: number | undefined;
  }[],
): OrgNode | null {
  if (depts.length === 0) return null;
  const map = new Map<string, OrgNode>();
  const roots: OrgNode[] = [];
  for (const d of depts) {
    const node: OrgNode = {
      id: d.id,
      name: d.name,
      level: 'department',
      ...(d.memberCount != null ? { memberCount: d.memberCount } : {}),
    };
    map.set(d.id, node);
  }
  for (const d of depts) {
    const node = map.get(d.id);
    if (!node) continue;
    if (d.parentDepartmentId) {
      const parent = map.get(d.parentDepartmentId);
      if (parent) {
        parent.children ??= [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }
  if (roots.length === 1) return roots[0] ?? null;
  return { id: 'root', name: 'Organization', level: 'organization', children: roots };
}

type ActSev = 'info' | 'warn' | 'error' | 'success';

function toActivitySeverity(s: string): ActSev {
  if (s === 'error') return 'error';
  if (s === 'warn') return 'warn';
  return 'info';
}

export default function OrgAdminDashboard() {
  const { data: membersData, isLoading: membersLoading } = useMembers(1, 1);
  const { data: deptsData } = useDepartments();
  const { data: workflowsData } = useWorkflows('active');
  const { data: approvalsData } = usePendingApprovals();
  const { data: insightsData } = useAIInsights();
  const { data: auditData } = useAuditEvents(5);

  const totalMembers = membersData?.meta.total;
  const departments = deptsData?.data ?? [];
  const activeWorkflows = workflowsData?.data.length ?? 0;
  const pendingApprovals = approvalsData?.data.length ?? 0;
  const overdue =
    approvalsData?.data.filter((a) => a.dueAt != null && new Date(a.dueAt) < new Date()).length ??
    0;

  const tree = buildTree(departments);

  const insights: AIInsight[] = (insightsData?.data ?? []).slice(0, 2).map((i) => ({
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
    severity: toActivitySeverity(e.severity),
    timestamp: e.timestamp,
  }));

  const mv = (n: number | undefined, loading: boolean) =>
    loading ? '…' : n != null ? String(n) : '—';

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
            Organization Admin
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Hierarchy · Members · Roles · Delegation · Settings
          </p>
        </div>

        <div className="mc-grid" style={{ marginBottom: '24px' }}>
          <MetricCard label="Total Members" value={mv(totalMembers, membersLoading)} />
          <MetricCard
            label="Departments"
            value={mv(departments.length, false)}
            subtext="organizational units"
          />
          <MetricCard
            label="Org Nodes"
            value={mv(departments.length, false)}
            subtext="all levels"
            accent="#8b5cf6"
          />
          <MetricCard
            label="Active Workflows"
            value={mv(activeWorkflows, false)}
            accent="#f59e0b"
          />
          <MetricCard
            label="Pending Approvals"
            value={mv(pendingApprovals, false)}
            {...(overdue > 0 ? { subtext: `${String(overdue)} overdue` } : {})}
            accent="#ef4444"
          />
          <MetricCard
            label="AI Insights"
            value={mv(insightsData?.data.length, false)}
            subtext="recommendations available"
            accent="#38bdf8"
          />
        </div>

        <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
          {tree ? (
            <OrganizationTree root={tree} />
          ) : (
            <div
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '32px',
                color: 'var(--muted)',
                textAlign: 'center',
              }}
            >
              Loading organizational structure…
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {insights.map((i) => (
              <AIInsightCard key={i.id} insight={i} />
            ))}
            <LiveActivityFeed items={activity} title="Org Activity" />
          </div>
        </div>
      </div>
    </main>
  );
}
