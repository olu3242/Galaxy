import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Mission Control — Galaxy',
  description: 'Organization operations dashboard',
};

const DASHBOARDS = [
  {
    href: '/dashboard/super-admin',
    label: 'Super Admin',
    description: 'Platform-level visibility across all tenants',
    accent: '#6366f1',
    icon: '🌐',
    roles: ['super_platform_admin', 'platform_operations'],
  },
  {
    href: '/dashboard/org-admin',
    label: 'Org Admin',
    description: 'Hierarchy, members, roles, delegation, settings',
    accent: '#8b5cf6',
    icon: '🏢',
    roles: ['organization_owner', 'organization_admin'],
  },
  {
    href: '/dashboard/executive',
    label: 'Executive',
    description: 'Strategic KPIs, AI insights, approval status',
    accent: '#0ea5e9',
    icon: '📊',
    roles: ['executive', 'organization_owner'],
  },
  {
    href: '/dashboard/ai-ops',
    label: 'AI Operations',
    description: 'Agent fleet, task queues, lifecycle monitoring',
    accent: '#a78bfa',
    icon: '🤖',
    roles: ['organization_admin', 'executive'],
  },
  {
    href: '/dashboard/security-ops',
    label: 'Security Ops',
    description: 'Authorization, audit, RBAC/ABAC, compliance',
    accent: '#ef4444',
    icon: '🛡',
    roles: ['organization_admin', 'auditor'],
  },
  {
    href: '/dashboard/workflow-ops',
    label: 'Workflow Operations',
    description: 'Active workflows, SLA health, approval chains',
    accent: '#22c55e',
    icon: '⚡',
    roles: ['branch_manager', 'department_manager', 'team_lead'],
  },
  {
    href: '/dashboard/approvals',
    label: 'Approvals',
    description: 'Review and decide on pending approval requests',
    accent: '#f59e0b',
    icon: '✅',
    roles: ['approver', 'manager', 'executive'],
  },
  {
    href: '/dashboard/members',
    label: 'Members',
    description: 'Browse and manage organization members',
    accent: '#38bdf8',
    icon: '👥',
    roles: ['org_admin', 'manager'],
  },
  {
    href: '/dashboard/profile',
    label: 'My Profile',
    description: 'Account details, role, and session management',
    accent: '#a78bfa',
    icon: '👤',
    roles: ['all'],
  },
];

export default function MissionControlHub() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '48px 32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: 'var(--fg)', margin: 0 }}>
            Galaxy Mission Control
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '16px', marginTop: '12px' }}>
            Select your role-specific dashboard
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}
        >
          {DASHBOARDS.map((d) => (
            <Link key={d.href} href={d.href} style={{ textDecoration: 'none' }}>
              <div
                className="mc-card"
                style={{ borderLeft: `4px solid ${d.accent}`, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '28px' }}>{d.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--fg)' }}>
                      {d.label}
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--muted)',
                        marginTop: '4px',
                        lineHeight: 1.5,
                      }}
                    >
                      {d.description}
                    </div>
                    <div
                      style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}
                    >
                      {d.roles.map((r) => (
                        <span
                          key={r}
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: d.accent + '18',
                            color: d.accent,
                            border: `1px solid ${d.accent}33`,
                            fontWeight: 600,
                          }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
