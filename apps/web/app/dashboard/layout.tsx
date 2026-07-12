'use client';

import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../../lib/auth/context';
import { ApiProvider } from '../../lib/api/context';

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
      {children}
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
