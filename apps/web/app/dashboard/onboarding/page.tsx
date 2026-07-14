'use client';

import { useState } from 'react';
import { useApiClient, useOrganizationId } from '../../../lib/api/context';
import { useAuth } from '../../../lib/auth/context';
import { useMembers, useRoles, useDepartments } from '../../../lib/api';

const STEPS = [
  { id: 'org', label: 'Organization', description: 'Confirm your org details' },
  { id: 'roles', label: 'Roles', description: 'Review default roles' },
  { id: 'members', label: 'Members', description: 'Invite your first members' },
  { id: 'done', label: 'Done', description: "You're all set" },
] as const;

type StepId = (typeof STEPS)[number]['id'];

function StepIndicator({ current, steps }: { current: StepId; steps: typeof STEPS }) {
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '40px' }}>
      {steps.map((step, idx) => {
        const done = idx < currentIdx;
        const active = step.id === current;
        return (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              flex: idx < steps.length - 1 ? 1 : 'none',
            }}
          >
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: done ? '#22c55e' : active ? '#6366f1' : 'rgba(255,255,255,0.08)',
                  border: active ? '2px solid #818cf8' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: done || active ? '#fff' : '#475569',
                  transition: 'all 0.2s',
                }}
              >
                {done ? '✓' : String(idx + 1)}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: active ? '#e2e8f0' : '#475569',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.label}
              </div>
            </div>
            {idx < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '2px',
                  background: done ? '#22c55e' : 'rgba(255,255,255,0.08)',
                  margin: '-18px 8px 0',
                  transition: 'background 0.2s',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const orgId = useOrganizationId();
  const { user } = useAuth();
  const client = useApiClient();

  const [step, setStep] = useState<StepId>('org');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const { data: membersData } = useMembers(1, 5);
  const { data: rolesData } = useRoles();
  const { data: deptsData } = useDepartments();

  const members = membersData?.data ?? [];
  const roles = rolesData?.data ?? [];
  const departments = deptsData?.data ?? [];

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !user?.id) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      await client.post('/api/v1/members', {
        body: {
          organizationId: orgId,
          displayName: inviteName,
          whatsappPhone: invitePhone,
          roleId: inviteRole || null,
          invitedBy: user.id,
        },
      });
      setInviteSuccess(`${inviteName} has been invited.`);
      setInvitePhone('');
      setInviteName('');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--mc-card)',
    border: '1px solid var(--mc-border)',
    borderRadius: '12px',
    padding: '28px',
  };

  const btnPrimary: React.CSSProperties = {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '9px 22px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  };

  const btnSecondary: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    color: '#94a3b8',
    border: '1px solid var(--mc-border)',
    borderRadius: '8px',
    padding: '9px 18px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '40px 32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            Organization Setup
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Complete these steps to get your organization running on Galaxy
          </p>
        </div>

        <StepIndicator current={step} steps={STEPS} />

        {step === 'org' && (
          <div style={cardStyle}>
            <h2
              style={{ fontSize: '16px', fontWeight: 700, color: 'var(--fg)', marginBottom: '8px' }}
            >
              Organization Details
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>
              Your organization is set up and connected to WhatsApp. Here's a summary of what's
              ready.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '28px',
              }}
            >
              {[
                { label: 'Members', value: String(members.length) },
                { label: 'Roles', value: String(roles.length) },
                { label: 'Departments', value: String(departments.length) },
                { label: 'WhatsApp', value: 'Connected' },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--mc-border)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--fg)' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
            <button
              style={btnPrimary}
              onClick={() => {
                setStep('roles');
              }}
            >
              Next: Review Roles →
            </button>
          </div>
        )}

        {step === 'roles' && (
          <div style={cardStyle}>
            <h2
              style={{ fontSize: '16px', fontWeight: 700, color: 'var(--fg)', marginBottom: '8px' }}
            >
              Default Roles
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>
              These roles control what members can do in Galaxy. You can customize them later from
              Settings.
            </p>
            {roles.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>
                No roles found. They will be seeded on first login.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginBottom: '24px',
                }}
              >
                {roles.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--mc-border)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>
                      {r.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {String(r.memberCount ?? 0)} members
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                style={btnSecondary}
                onClick={() => {
                  setStep('org');
                }}
              >
                ← Back
              </button>
              <button
                style={btnPrimary}
                onClick={() => {
                  setStep('members');
                }}
              >
                Next: Invite Members →
              </button>
            </div>
          </div>
        )}

        {step === 'members' && (
          <div style={cardStyle}>
            <h2
              style={{ fontSize: '16px', fontWeight: 700, color: 'var(--fg)', marginBottom: '8px' }}
            >
              Invite Members
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>
              Add members by their WhatsApp phone number. They'll receive a welcome message.
            </p>
            <form
              onSubmit={(e) => {
                void handleInvite(e);
              }}
              style={{ marginBottom: '24px' }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '12px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: 'var(--muted)',
                      marginBottom: '6px',
                    }}
                  >
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => {
                      setInviteName(e.target.value);
                    }}
                    required
                    placeholder="Jane Doe"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--mc-border)',
                      borderRadius: '7px',
                      padding: '8px 10px',
                      color: 'var(--fg)',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: 'var(--muted)',
                      marginBottom: '6px',
                    }}
                  >
                    WhatsApp Phone
                  </label>
                  <input
                    type="tel"
                    value={invitePhone}
                    onChange={(e) => {
                      setInvitePhone(e.target.value);
                    }}
                    required
                    placeholder="+2341234567890"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--mc-border)',
                      borderRadius: '7px',
                      padding: '8px 10px',
                      color: 'var(--fg)',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              {roles.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: 'var(--muted)',
                      marginBottom: '6px',
                    }}
                  >
                    Role (optional)
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => {
                      setInviteRole(e.target.value);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--mc-border)',
                      borderRadius: '7px',
                      padding: '8px 10px',
                      color: 'var(--fg)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  >
                    <option value="" style={{ background: '#0b1120' }}>
                      — Select role —
                    </option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id} style={{ background: '#0b1120' }}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {inviteError && (
                <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '10px' }}>
                  {inviteError}
                </p>
              )}
              {inviteSuccess && (
                <p style={{ color: '#22c55e', fontSize: '13px', marginBottom: '10px' }}>
                  {inviteSuccess}
                </p>
              )}
              <button
                type="submit"
                disabled={inviting}
                style={{ ...btnPrimary, opacity: inviting ? 0.6 : 1 }}
              >
                {inviting ? 'Inviting…' : 'Invite Member'}
              </button>
            </form>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                style={btnSecondary}
                onClick={() => {
                  setStep('roles');
                }}
              >
                ← Back
              </button>
              <button
                style={btnPrimary}
                onClick={() => {
                  setStep('done');
                }}
              >
                Finish Setup →
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 28px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✦</div>
            <h2
              style={{ fontSize: '20px', fontWeight: 800, color: 'var(--fg)', marginBottom: '8px' }}
            >
              Galaxy is live for your organization
            </h2>
            <p
              style={{
                color: 'var(--muted)',
                fontSize: '14px',
                maxWidth: '400px',
                margin: '0 auto 28px',
              }}
            >
              Members can now submit leave requests and workflows via WhatsApp. You'll receive
              approval requests and can track everything from Mission Control.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <a
                href="/dashboard"
                style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}
              >
                Go to Mission Control
              </a>
              <a
                href="/dashboard/broadcast"
                style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}
              >
                Send a Broadcast
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
