'use client';

import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../../lib/auth/context';
import { ApiProvider } from '../../lib/api/context';
import { Sidebar } from '../../components/dashboard/Sidebar';

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, token } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/login';
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0b1120',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
        }}
      >
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <ApiProvider
      baseUrl={process.env.NEXT_PUBLIC_API_URL ?? ''}
      token={token}
      organizationId={user?.organizationId ?? null}
      onUnauthorized={() => {
        window.location.href = '/login';
      }}
    >
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>{children}</div>
      </div>
    </ApiProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardGuard>{children}</DashboardGuard>
    </AuthProvider>
  );
}
