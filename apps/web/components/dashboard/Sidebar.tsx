'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth/context';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Mission Control', icon: '🌌', exact: true },
  { href: '/dashboard/executive', label: 'Executive', icon: '📊' },
  { href: '/dashboard/workflow-ops', label: 'Workflow Ops', icon: '⚡' },
  { href: '/dashboard/ai-ops', label: 'AI Operations', icon: '🤖' },
  { href: '/dashboard/org-admin', label: 'Org Admin', icon: '🏢' },
  { href: '/dashboard/security-ops', label: 'Security Ops', icon: '🛡' },
  { href: '/dashboard/super-admin', label: 'Super Admin', icon: '🌐' },
  null,
  { href: '/dashboard/approvals', label: 'Approvals', icon: '✅' },
  { href: '/dashboard/loops', label: 'Loop OS', icon: '🔄' },
  { href: '/dashboard/workflow-builder', label: 'Workflow Builder', icon: '⚙️' },
  { href: '/dashboard/members', label: 'Members', icon: '👥' },
  { href: '/dashboard/broadcast', label: 'Broadcast', icon: '📢' },
  { href: '/dashboard/knowledge', label: 'Knowledge Base', icon: '📚' },
  { href: '/dashboard/people', label: 'People & Attendance', icon: '🧑‍💼' },
  { href: '/dashboard/copilot', label: 'AI Copilot', icon: '💬' },
  { href: '/dashboard/reports', label: 'Reports', icon: '📈' },
  { href: '/dashboard/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/dashboard/integrations', label: 'Integrations', icon: '🔗' },
  { href: '/dashboard/org-structure', label: 'Org Structure', icon: '🏗️' },
  { href: '/dashboard/billing', label: 'Billing', icon: '💳' },
  { href: '/dashboard/whatsapp', label: 'WhatsApp Center', icon: '📲' },
  null,
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  { href: '/dashboard/onboarding', label: 'Setup Wizard', icon: '🚀' },
  { href: '/dashboard/profile', label: 'My Profile', icon: '👤' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname.startsWith(href) && href !== '/dashboard';
  }

  return (
    <aside
      style={{
        width: '220px',
        minHeight: '100vh',
        background: '#0a0f1e',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                flexShrink: 0,
              }}
            >
              ✦
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>
                Galaxy
              </div>
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                Mission Control
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px' }}>
        {NAV_ITEMS.map((item, i) => {
          if (item === null) {
            return (
              <div
                key={i}
                style={{
                  height: '1px',
                  background: 'rgba(255,255,255,0.06)',
                  margin: '6px 8px',
                }}
              />
            );
          }
          const active = isActive(item.href, 'exact' in item ? item.exact : false);
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  marginBottom: '1px',
                  background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: active ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                  transition: 'background 0.1s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{item.icon}</span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: active ? 600 : 400,
                    color: active ? '#e2e8f0' : '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {(user?.email ?? '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '12px',
              color: '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.email ?? '—'}
          </div>
          <div style={{ fontSize: '10px', color: '#475569' }}>{user?.role ?? ''}</div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          style={{
            background: 'none',
            border: 'none',
            color: '#475569',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '2px',
            flexShrink: 0,
          }}
        >
          ↪
        </button>
      </div>
    </aside>
  );
}
