import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mission Control — Galaxy',
  description: 'Organization operations dashboard',
};

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  accent?: string;
}

function StatCard({ label, value, subtext, accent = '#6366f1' }: StatCardProps) {
  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: '12px',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: '32px', fontWeight: 700, color: accent, lineHeight: 1.1 }}>
        {value}
      </span>
      {subtext && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{subtext}</span>}
    </div>
  );
}

interface NavItemProps {
  label: string;
  active?: boolean;
}

function NavItem({ label, active }: NavItemProps) {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderRadius: '8px',
        background: active ? 'var(--nav-active-bg)' : 'transparent',
        color: active ? 'var(--nav-active-color)' : 'var(--muted)',
        fontSize: '14px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      {label}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <style>{`
        :root {
          --card-bg: #ffffff;
          --card-border: #e5e7eb;
          --muted: #6b7280;
          --nav-active-bg: #ede9fe;
          --nav-active-color: #6d28d9;
          --sidebar-bg: #f9fafb;
          --sidebar-border: #e5e7eb;
          --text: #111827;
          --header-bg: #ffffff;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --card-bg: #1f2937;
            --card-border: #374151;
            --muted: #9ca3af;
            --nav-active-bg: #2e1065;
            --nav-active-color: #a78bfa;
            --sidebar-bg: #111827;
            --sidebar-border: #1f2937;
            --text: #f9fafb;
            --header-bg: #1f2937;
          }
        }
        :root[data-theme="light"] {
          --card-bg: #ffffff;
          --card-border: #e5e7eb;
          --muted: #6b7280;
          --nav-active-bg: #ede9fe;
          --nav-active-color: #6d28d9;
          --sidebar-bg: #f9fafb;
          --sidebar-border: #e5e7eb;
          --text: #111827;
          --header-bg: #ffffff;
        }
        :root[data-theme="dark"] {
          --card-bg: #1f2937;
          --card-border: #374151;
          --muted: #9ca3af;
          --nav-active-bg: #2e1065;
          --nav-active-color: #a78bfa;
          --sidebar-bg: #111827;
          --sidebar-border: #1f2937;
          --text: #f9fafb;
          --header-bg: #1f2937;
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: 'var(--text)',
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: '220px',
            flexShrink: 0,
            background: 'var(--sidebar-bg)',
            borderRight: '1px solid var(--sidebar-border)',
            padding: '24px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              padding: '0 4px 20px',
              marginBottom: '8px',
              borderBottom: '1px solid var(--sidebar-border)',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.5px' }}>
              Galaxy
            </span>
            <span
              style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--muted)',
                marginTop: '2px',
              }}
            >
              Mission Control
            </span>
          </div>
          <NavItem label="Overview" active />
          <NavItem label="Workflows" />
          <NavItem label="Loop OS" />
          <NavItem label="People" />
          <NavItem label="Broadcast" />
          <NavItem label="Analytics" />
          <NavItem label="Governance" />
          <NavItem label="Settings" />
        </aside>

        {/* Main */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Header */}
          <header
            style={{
              background: 'var(--header-bg)',
              borderBottom: '1px solid var(--card-border)',
              padding: '16px 32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Overview</h1>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
                Live operations dashboard
              </p>
            </div>
            <div
              style={{
                background: '#6366f1',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + New Workflow
            </div>
          </header>

          {/* Content */}
          <div style={{ padding: '32px', flex: 1, overflowY: 'auto' }}>
            {/* Org Health Score */}
            <section style={{ marginBottom: '32px' }}>
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  margin: '0 0 16px',
                }}
              >
                Org Health
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '16px',
                }}
              >
                <StatCard
                  label="Health Score"
                  value="—"
                  subtext="Connect API to see live score"
                  accent="#6366f1"
                />
                <StatCard
                  label="Active Workflows"
                  value="—"
                  subtext="Pending data"
                  accent="#0ea5e9"
                />
                <StatCard label="SLA Compliance" value="—%" subtext="Last 24h" accent="#10b981" />
                <StatCard
                  label="Loop Completion"
                  value="—%"
                  subtext="Verification rate"
                  accent="#f59e0b"
                />
              </div>
            </section>

            {/* Workflow Summary */}
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }}>
                Active Workflows
              </h2>
              <div
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                      {['Workflow', 'Type', 'Submitted by', 'Status', 'SLA'].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: 'var(--muted)',
                            fontSize: '12px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          padding: '40px',
                          textAlign: 'center',
                          color: 'var(--muted)',
                          fontSize: '14px',
                        }}
                      >
                        No active workflows. Connect the API to see live data.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recent Activity */}
            <section>
              <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }}>
                Recent Activity
              </h2>
              <div
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '12px',
                  padding: '24px',
                  color: 'var(--muted)',
                  fontSize: '14px',
                  textAlign: 'center',
                }}
              >
                Activity feed will appear here once connected to the Galaxy API.
              </div>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}
