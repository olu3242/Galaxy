'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/auth/context';

export default function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      window.location.href = '/dashboard';
    } catch {
      // error is surfaced via useAuth().error
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#e2e8f0',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0b1120',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          padding: '40px 32px',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              margin: '0 auto 16px',
            }}
          >
            ✦
          </div>
          <h1 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 700, margin: 0 }}>Galaxy</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '6px 0 0' }}>
            Sign in to Mission Control
          </p>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <div>
            <label
              style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}
            >
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              placeholder="you@organization.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}
            >
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                background: '#ef444418',
                border: '1px solid #ef444440',
                borderRadius: '6px',
                padding: '10px 12px',
                color: '#f87171',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              background: isLoading ? '#334155' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: isLoading ? 'default' : 'pointer',
              marginTop: '8px',
            }}
          >
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: '12px', marginTop: '24px' }}>
          Need an account?{' '}
          <a href="mailto:sales@galaxyos.com" style={{ color: '#6366f1', textDecoration: 'none' }}>
            Contact your admin
          </a>
        </p>
      </div>
    </main>
  );
}
