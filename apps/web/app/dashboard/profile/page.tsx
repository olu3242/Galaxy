'use client';

import { useAuth } from '../../../lib/auth/context';
import { useApiQuery } from '../../../lib/api';

interface MeResponse {
  data: {
    id: string;
    name: string;
    email: string;
    role: string;
    organizationId: string;
  };
}

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  super_admin: { label: 'Super Admin', color: '#ef4444' },
  org_admin: { label: 'Org Admin', color: '#f97316' },
  manager: { label: 'Manager', color: '#f59e0b' },
  staff: { label: 'Staff', color: '#6366f1' },
  viewer: { label: 'Viewer', color: '#64748b' },
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label
        style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}
      >
        {label}
      </label>
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--fg)',
          fontSize: '14px',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { data: meData, isLoading } = useApiQuery<MeResponse>('/api/v1/auth/me');

  const profile = meData?.data;
  const role = profile?.role ?? user?.role ?? '';
  const badge = ROLE_BADGE[role] ?? { label: role, color: '#6366f1' };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            My Profile
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Account details and session information
          </p>
        </div>

        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            overflow: 'hidden',
          }}
        >
          {/* Avatar header */}
          <div
            style={{
              padding: '32px',
              background: 'linear-gradient(135deg, #6366f115, #8b5cf615)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                fontWeight: 800,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {isLoading ? '…' : (profile?.name ?? user?.name ?? '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--fg)',
                  marginBottom: '4px',
                }}
              >
                {isLoading ? '…' : (profile?.name ?? user?.name ?? '—')}
              </div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: `${badge.color}20`,
                  color: badge.color,
                }}
              >
                {badge.label}
              </span>
            </div>
          </div>

          {/* Fields */}
          <div
            style={{
              padding: '24px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <Field
              label="Email address"
              value={isLoading ? '…' : (profile?.email ?? user?.email ?? '—')}
            />
            <Field label="Member ID" value={isLoading ? '…' : (profile?.id ?? user?.id ?? '—')} />
            <Field
              label="Organization ID"
              value={isLoading ? '…' : (profile?.organizationId ?? user?.organizationId ?? '—')}
            />
            <Field label="Role" value={badge.label} />
          </div>

          {/* Logout */}
          <div
            style={{
              padding: '16px 32px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={logout}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #ef444440',
                background: '#ef444412',
                color: '#f87171',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
