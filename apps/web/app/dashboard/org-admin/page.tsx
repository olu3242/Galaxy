import type { Metadata } from 'next';
import {
  MetricCard,
  OrganizationTree,
  LiveActivityFeed,
  AIInsightCard,
} from '../../../components/ui';
import type { OrgNode, ActivityItem, AIInsight } from '../../../components/ui';

export const metadata: Metadata = {
  title: 'Organization Admin — Galaxy',
  description: 'Organizational hierarchy, members, and configuration',
};

const ORG_TREE: OrgNode = {
  id: 'root',
  name: 'Acme Corp',
  level: 'organization',
  code: 'ACME',
  memberCount: 847,
  children: [
    {
      id: 'd1',
      name: 'Operations',
      level: 'division',
      code: 'OPS',
      memberCount: 312,
      children: [
        {
          id: 'r1',
          name: 'North Region',
          level: 'region',
          memberCount: 164,
          children: [
            { id: 'b1', name: 'Lagos Branch', level: 'branch', memberCount: 82 },
            { id: 'b2', name: 'Abuja Branch', level: 'branch', memberCount: 82 },
          ],
        },
        { id: 'r2', name: 'South Region', level: 'region', memberCount: 148 },
      ],
    },
    {
      id: 'd2',
      name: 'Finance',
      level: 'division',
      code: 'FIN',
      memberCount: 124,
      children: [
        { id: 'dept1', name: 'Accounts', level: 'department', memberCount: 48 },
        { id: 'dept2', name: 'Treasury', level: 'department', memberCount: 76 },
      ],
    },
    {
      id: 'd3',
      name: 'Technology',
      level: 'division',
      code: 'TECH',
      memberCount: 411,
      children: [
        {
          id: 'dept3',
          name: 'Engineering',
          level: 'department',
          memberCount: 200,
          children: [
            { id: 't1', name: 'Platform Team', level: 'team', memberCount: 12 },
            { id: 't2', name: 'Mobile Team', level: 'team', memberCount: 8 },
          ],
        },
        { id: 'dept4', name: 'Data & AI', level: 'department', memberCount: 211 },
      ],
    },
  ],
};

const INSIGHTS: AIInsight[] = [
  {
    id: '1',
    type: 'optimization',
    title: 'North Region spans too many approval tiers',
    summary:
      'Lagos Branch workflows pass through 4 approval tiers on average. Restructuring to 2 tiers could cut approval time by 60%.',
    confidence: 82,
    impactTier: 3,
    actions: [{ label: 'Restructure Rules' }],
  },
];

const ACTIVITY: ActivityItem[] = [
  {
    id: '1',
    type: 'member',
    message: '3 new members onboarded to Lagos Branch',
    severity: 'success',
    timestamp: new Date(Date.now() - 300_000).toISOString(),
  },
  {
    id: '2',
    type: 'approval',
    message: 'Org hierarchy updated: new South Region branch added',
    severity: 'info',
    timestamp: new Date(Date.now() - 1_200_000).toISOString(),
  },
  {
    id: '3',
    type: 'workflow',
    message: 'Monthly org report compiled by COO Copilot',
    severity: 'info',
    timestamp: new Date(Date.now() - 3_600_000).toISOString(),
  },
];

export default function OrgAdminDashboard() {
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
          <MetricCard label="Total Members" value="847" delta={{ value: 3.2, label: 'MoM' }} />
          <MetricCard label="Active Roles" value="18" subtext="3 custom, 15 system" />
          <MetricCard
            label="Org Nodes"
            value="24"
            subtext="7 divisions, 17 below"
            accent="#8b5cf6"
          />
          <MetricCard
            label="Active Workflows"
            value="156"
            delta={{ value: 8.4, label: 'WoW' }}
            accent="#f59e0b"
          />
          <MetricCard
            label="Pending Invitations"
            value="7"
            subtext="expires in 48h"
            accent="#38bdf8"
          />
          <MetricCard label="Open Approvals" value="12" subtext="4 overdue" accent="#ef4444" />
        </div>

        <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
          <OrganizationTree root={ORG_TREE} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <AIInsightCard insight={INSIGHTS[0]!} />
            <LiveActivityFeed items={ACTIVITY} title="Org Activity" />
          </div>
        </div>
      </div>
    </main>
  );
}
