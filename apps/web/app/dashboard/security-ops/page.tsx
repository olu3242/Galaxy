import type { Metadata } from 'next';
import {
  MetricCard,
  AuditTimeline,
  PermissionMatrix,
  LiveActivityFeed,
} from '../../../components/ui';
import type { AuditEntry, ActivityItem } from '../../../components/ui';

export const metadata: Metadata = {
  title: 'Security Operations — Galaxy',
  description: 'Authorization, audit, and compliance operations center',
};

const AUDIT_ENTRIES: AuditEntry[] = [
  {
    id: '1',
    action: 'authorization.denied',
    actor: 'j.doe@acme.com',
    actorType: 'member',
    resource: 'workflow',
    resourceId: 'wf-9932',
    status: 'denied',
    timestamp: new Date(Date.now() - 120_000).toISOString(),
    correlationId: 'c1234567-0000-0000-0000-000000000001',
  },
  {
    id: '2',
    action: 'delegation.created',
    actor: 'VP Ops',
    actorType: 'member',
    resource: 'delegation',
    status: 'success',
    timestamp: new Date(Date.now() - 600_000).toISOString(),
    correlationId: 'c2345678-0000-0000-0000-000000000002',
  },
  {
    id: '3',
    action: 'agent.permission.denied',
    actor: 'ATLAS',
    actorType: 'agent',
    resource: 'billing',
    status: 'denied',
    timestamp: new Date(Date.now() - 1_200_000).toISOString(),
    correlationId: 'c3456789-0000-0000-0000-000000000003',
  },
  {
    id: '4',
    action: 'user.authentication.failed',
    actor: 'unknown@external.com',
    actorType: 'member',
    resource: 'organization',
    status: 'error',
    timestamp: new Date(Date.now() - 1_800_000).toISOString(),
    correlationId: 'c4567890-0000-0000-0000-000000000004',
  },
];

const ACTIVITY: ActivityItem[] = [
  {
    id: '1',
    type: 'alert',
    message: 'Dormant account login attempt detected',
    severity: 'error',
    timestamp: new Date(Date.now() - 90_000).toISOString(),
  },
  {
    id: '2',
    type: 'agent',
    message: 'GUARDIAN ran permission analytics report',
    severity: 'info',
    timestamp: new Date(Date.now() - 300_000).toISOString(),
  },
  {
    id: '3',
    type: 'approval',
    message: 'ABAC policy updated: restrict billing write to CFO role',
    severity: 'warn',
    timestamp: new Date(Date.now() - 900_000).toISOString(),
  },
  {
    id: '4',
    type: 'system',
    message: 'Cross-tenant isolation check passed',
    severity: 'success',
    timestamp: new Date(Date.now() - 1_800_000).toISOString(),
  },
];

const ROLES = ['Super Admin', 'Org Admin', 'Manager', 'Staff', 'AI Agent'];
const RESOURCES = [
  'workflow',
  'member',
  'audit',
  'billing',
  'analytics',
  'knowledge',
  'delegation',
  'policy',
];
const MATRIX: Record<string, Record<string, boolean>> = {
  'Super Admin': {
    workflow: true,
    member: true,
    audit: true,
    billing: true,
    analytics: true,
    knowledge: true,
    delegation: true,
    policy: true,
  },
  'Org Admin': {
    workflow: true,
    member: true,
    audit: true,
    billing: false,
    analytics: true,
    knowledge: true,
    delegation: true,
    policy: true,
  },
  Manager: {
    workflow: true,
    member: true,
    audit: false,
    billing: false,
    analytics: true,
    knowledge: true,
    delegation: false,
    policy: false,
  },
  Staff: {
    workflow: true,
    member: false,
    audit: false,
    billing: false,
    analytics: false,
    knowledge: true,
    delegation: false,
    policy: false,
  },
  'AI Agent': {
    workflow: true,
    member: false,
    audit: false,
    billing: false,
    analytics: true,
    knowledge: true,
    delegation: false,
    policy: false,
  },
};

export default function SecurityOpsDashboard() {
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
            Security Operations
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Authorization · Audit · Compliance · RBAC/ABAC
          </p>
        </div>

        <div className="mc-grid" style={{ marginBottom: '24px' }}>
          <MetricCard
            label="Auth Denials (24h)"
            value="7"
            subtext="3 agent, 4 member"
            accent="#ef4444"
          />
          <MetricCard label="Active ABAC Policies" value="23" subtext="2 deny, 21 allow" />
          <MetricCard
            label="Active Delegations"
            value="6"
            subtext="1 expiring today"
            accent="#f59e0b"
          />
          <MetricCard
            label="Dormant Accounts"
            value="2"
            subtext="45+ days inactive"
            accent="#f97316"
          />
          <MetricCard
            label="Compliance Score"
            value="94%"
            delta={{ value: 2.1, label: 'vs last audit' }}
            accent="#22c55e"
          />
          <MetricCard
            label="RLS Violations"
            value="0"
            subtext="cross-tenant checks pass"
            accent="#22c55e"
          />
        </div>

        <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
          <AuditTimeline entries={AUDIT_ENTRIES} />
          <LiveActivityFeed items={ACTIVITY} title="Security Events" />
        </div>

        <PermissionMatrix roles={ROLES} resources={RESOURCES} matrix={MATRIX} />
      </div>
    </main>
  );
}
