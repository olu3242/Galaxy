'use client';

import {
  MetricCard,
  AuditTimeline,
  PermissionMatrix,
  LiveActivityFeed,
} from '../../../components/ui';
import type { AuditEntry, ActivityItem } from '../../../components/ui';
import { useSecurityMetrics, useAuditEvents, useAlerts, useRoles } from '../../../lib/api';

type AuditSev = 'info' | 'warn' | 'error' | 'success';
type ActSev = 'info' | 'warn' | 'error' | 'success';

function auditSeverity(s: string): AuditSev {
  if (s === 'warn') return 'warn';
  if (s === 'error') return 'error';
  if (s === 'success') return 'success';
  return 'info';
}

function alertSeverity(s: string): ActSev {
  if (s === 'critical' || s === 'error') return 'error';
  if (s === 'warning' || s === 'warn') return 'warn';
  return 'info';
}

export default function SecurityOpsDashboard() {
  const { data: metricsData, isLoading } = useSecurityMetrics();
  const { data: auditData } = useAuditEvents(10);
  const { data: alertsData } = useAlerts(6);
  const { data: rolesData } = useRoles();

  const m = metricsData?.data;
  const mv = (n: number | undefined) => (isLoading ? '…' : n != null ? String(n) : '—');

  const auditEntries: AuditEntry[] = (auditData?.data ?? []).map((e) => ({
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

  const activity: ActivityItem[] = (alertsData?.data ?? []).map((a, i) => ({
    id: String(i),
    type: 'alert' as const,
    message: a.name,
    severity: alertSeverity(a.severity),
    timestamp: a.firedAt,
  }));

  const roles = rolesData?.data ?? [];
  const resources = [
    'workflow',
    'member',
    'audit',
    'billing',
    'analytics',
    'knowledge',
    'delegation',
    'policy',
  ];
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const role of roles) {
    const row: Record<string, boolean> = {};
    for (const resource of resources) {
      row[resource] = (role.permissions ?? []).some(
        (p) => p.includes(resource) || p.includes('*'),
      );
    }
    matrix[role.name] = row;
  }

  const roleNames =
    roles.length > 0 ? roles.map((r) => r.name) : ['Super Admin', 'Org Admin', 'Manager', 'Staff'];

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
          <MetricCard label="Auth Denials (24h)" value={mv(m?.accessDenials)} accent="#ef4444" />
          <MetricCard label="Active ABAC Policies" value={mv(m?.activePolicies)} />
          <MetricCard
            label="Active Delegations"
            value={mv(m?.activeDelegations)}
            accent="#f59e0b"
          />
          <MetricCard
            label="Dormant Accounts"
            value={mv(m?.dormantAccounts)}
            subtext="45+ days inactive"
            accent="#f97316"
          />
          <MetricCard
            label="Compliance Score"
            value={m ? `${String(m.complianceScore)}%` : mv(undefined)}
            accent="#22c55e"
          />
          <MetricCard
            label="RLS Violations"
            value={mv(m?.rlsViolations)}
            subtext="cross-tenant checks"
            accent="#22c55e"
          />
        </div>

        <div className="mc-grid-2" style={{ marginBottom: '24px' }}>
          <AuditTimeline entries={auditEntries} />
          <LiveActivityFeed items={activity} title="Security Events" />
        </div>

        {roles.length > 0 && (
          <PermissionMatrix roles={roleNames} resources={resources} matrix={matrix} />
        )}
      </div>
    </main>
  );
}
