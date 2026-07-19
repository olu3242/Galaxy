'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/auth/context';

export default function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      window.location.href = '/dashboard';
    } catch {
      // error surfaced via useAuth().error
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--gb)',
        display: 'flex',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Left panel — branding */}
      <div
        style={{
          flex: '1 1 55%',
          background: 'linear-gradient(135deg, #0f172a 0%, #161b2e 60%, #1a1040 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '64px',
          borderRight: '1px solid rgba(109,93,252,0.15)',
          position: 'relative',
          overflow: 'hidden',
        }}
        className="login-brand-panel"
      >
        {/* Glow orb */}
        <div
          style={{
            position: 'absolute',
            top: '20%',
            left: '30%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(109,93,252,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '56px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, var(--gv), var(--gv2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 0 24px rgba(109,93,252,0.4)',
              }}
            >
              ✦
            </div>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--gw)',
                fontFamily: 'var(--font-head)',
                letterSpacing: '-0.5px',
              }}
            >
              Galaxy
            </span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(28px, 3vw, 42px)',
              fontWeight: 800,
              color: 'var(--gw)',
              fontFamily: 'var(--font-head)',
              lineHeight: 1.15,
              margin: '0 0 16px',
              letterSpacing: '-1px',
            }}
          >
            Your organization,
            <br />
            <span
              style={{
                background: 'linear-gradient(90deg, var(--gv2), var(--gblue))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              on autopilot.
            </span>
          </h1>

          <p
            style={{
              color: 'var(--gs)',
              fontSize: '15px',
              lineHeight: 1.6,
              maxWidth: '420px',
              margin: '0 0 48px',
            }}
          >
            Submit workflows, approve requests, and run reports — all through WhatsApp. Galaxy
            governs, audits, and continuously improves every operation.
          </p>

          {/* Feature pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {[
              { icon: '⚡', label: 'Workflow Automation' },
              { icon: '🤖', label: 'AI Agents' },
              { icon: '🛡', label: 'Governance & Audit' },
              { icon: '💬', label: 'WhatsApp Native' },
            ].map((f) => (
              <div
                key={f.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  background: 'rgba(109,93,252,0.1)',
                  border: '1px solid rgba(109,93,252,0.2)',
                  fontSize: '12px',
                  color: 'var(--gs)',
                  fontWeight: 500,
                }}
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div
        style={{
          flex: '0 0 420px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 40px',
          background: '#0b1120',
        }}
        className="login-form-panel"
      >
        <div>
          <h2
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--gw)',
              fontFamily: 'var(--font-head)',
              margin: '0 0 6px',
              letterSpacing: '-0.5px',
            }}
          >
            Sign in to Mission Control
          </h2>
          <p style={{ color: 'var(--gm)', fontSize: '14px', margin: '0 0 32px' }}>
            Enter your organization credentials below.
          </p>

          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  color: 'var(--gs)',
                  fontSize: '13px',
                  fontWeight: 500,
                  marginBottom: '7px',
                }}
              >
                Work email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); }}
                placeholder="you@organization.com"
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  background: '#0f172a',
                  color: 'var(--gw)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gv)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#1e293b'; }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  color: 'var(--gs)',
                  fontSize: '13px',
                  fontWeight: 500,
                  marginBottom: '7px',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); }}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '11px 42px 11px 14px',
                    borderRadius: '8px',
                    border: '1px solid #1e293b',
                    background: '#0f172a',
                    color: 'var(--gw)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gv)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#1e293b'; }}
                />
                <button
                  type="button"
                  onClick={() => { setShowPw((v) => !v); }}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--gm)',
                    fontSize: '13px',
                    padding: '2px',
                    lineHeight: 1,
                  }}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: '7px',
                  padding: '10px 12px',
                  color: '#f87171',
                  fontSize: '13px',
                  lineHeight: 1.4,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                background: isLoading
                  ? '#1e293b'
                  : 'linear-gradient(135deg, var(--gv), var(--gv2))',
                color: isLoading ? 'var(--gm)' : '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: isLoading ? 'default' : 'pointer',
                marginTop: '4px',
                boxShadow: isLoading ? 'none' : '0 0 20px rgba(109,93,252,0.3)',
                transition: 'opacity 0.15s',
                fontFamily: 'var(--font-body)',
              }}
            >
              {isLoading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <p
            style={{
              textAlign: 'center',
              color: 'var(--gm)',
              fontSize: '12px',
              marginTop: '24px',
              lineHeight: 1.5,
            }}
          >
            No account?{' '}
            <a
              href="mailto:sales@galaxyos.com"
              style={{ color: 'var(--gv2)', textDecoration: 'none' }}
            >
              Contact your admin
            </a>
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-brand-panel { display: none !important; }
          .login-form-panel  { flex: 1 1 100% !important; padding: 40px 28px !important; }
        }
      `}</style>
    </main>
  );
}
