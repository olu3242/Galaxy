'use client';

import { useState } from 'react';
import {
  useDelegations,
  usePolicyRules,
  useMembers,
  useApiClient,
  useOrganizationId,
} from '../../../lib/api';
import type { DelegationRecord, PolicyRule } from '../../../lib/api';

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  revoked: '#ef4444',
  expired: '#f59e0b',
};

function DelegationRow({
  record,
  onRevoke,
}: {
  record: DelegationRecord;
  onRevoke: (id: string) => void;
}) {
  const color = STATUS_COLOR[record.status] ?? 'var(--muted)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--mc-card)',
        border: '1px solid var(--mc-border)',
        borderRadius: '8px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>
            {record.delegatorName ?? record.delegatorId}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>→</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>
            {record.delegateeName ?? record.delegateeId}
          </span>
          <span
            style={{
              fontSize: '10px',
              color,
              border: `1px solid ${color}`,
              borderRadius: '4px',
              padding: '1px 6px',
              textTransform: 'capitalize',
            }}
          >
            {record.status}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '3px' }}>
          {record.scope.map((s) => (
            <span
              key={s}
              style={{
                fontSize: '9px',
                background: 'rgba(99,102,241,0.12)',
                color: '#818cf8',
                borderRadius: '3px',
                padding: '2px 6px',
              }}
            >
              {s}
            </span>
          ))}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
          Created {new Date(record.createdAt).toLocaleDateString()}
          {record.expiresAt ? ` · Expires ${new Date(record.expiresAt).toLocaleDateString()}` : ''}
        </div>
      </div>
      {record.status === 'active' && (
        <button
          onClick={() => {
            onRevoke(record.id);
          }}
          style={{
            padding: '5px 12px',
            borderRadius: '6px',
            border: '1px solid #ef4444',
            background: 'transparent',
            color: '#ef4444',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Revoke
        </button>
      )}
    </div>
  );
}

function PolicyRow({
  rule,
  onToggle,
}: {
  rule: PolicyRule;
  onToggle: (id: string, active: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--mc-card)',
        border: '1px solid var(--mc-border)',
        borderRadius: '8px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>{rule.name}</span>
          <span
            style={{
              fontSize: '10px',
              color: rule.effect === 'allow' ? '#22c55e' : '#ef4444',
              border: `1px solid ${rule.effect === 'allow' ? '#22c55e' : '#ef4444'}`,
              borderRadius: '4px',
              padding: '1px 6px',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {rule.effect}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
          {rule.subject} · {rule.resource} · {rule.action}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
          Priority {String(rule.priority)}
        </div>
      </div>
      <button
        onClick={() => {
          onToggle(rule.id, !rule.active);
        }}
        style={{
          width: '40px',
          height: '22px',
          borderRadius: '11px',
          border: 'none',
          background: rule.active ? '#6366f1' : 'var(--mc-border)',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: rule.active ? '21px' : '3px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  );
}

export default function DelegationPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const [tab, setTab] = useState<'delegations' | 'policies'>('delegations');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const {
    data: delegationsData,
    isLoading: dLoading,
    mutate: mutateDelegations,
  } = useDelegations(statusFilter);
  const { data: policiesData, isLoading: pLoading, mutate: mutatePolicies } = usePolicyRules();
  const { data: membersData } = useMembers();

  const delegations = delegationsData?.data ?? [];
  const policies = policiesData?.data ?? [];
  const members = membersData?.data ?? [];

  const [showDelegateForm, setShowDelegateForm] = useState(false);
  const [delegateeId, setDelegateeId] = useState('');
  const [scope, setScope] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [policyEffect, setPolicyEffect] = useState<'allow' | 'deny'>('allow');
  const [policySubject, setPolicySubject] = useState('');
  const [policyResource, setPolicyResource] = useState('');
  const [policyAction, setPolicyAction] = useState('');
  const [policyPriority, setPolicyPriority] = useState('10');
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
  };

  const handleDelegate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgId || !delegateeId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await client.post('/api/v1/identity/delegations', {
        body: {
          organizationId: orgId,
          delegateeId,
          scope: scope
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          reason: reason || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        },
      });
      flash('Delegation created.');
      setDelegateeId('');
      setScope('');
      setReason('');
      setExpiresAt('');
      setShowDelegateForm(false);
      void mutateDelegations();
    } catch {
      setFormError('Failed to create delegation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await client.put(`/api/v1/identity/delegations/${id}/revoke`, {});
      flash('Delegation revoked.');
      void mutateDelegations();
    } catch {
      flash('Failed to revoke delegation.');
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgId || !policyName.trim() || !policySubject || !policyResource || !policyAction) return;
    setCreatingPolicy(true);
    setPolicyError(null);
    try {
      await client.post('/api/v1/governance/policies', {
        body: {
          organizationId: orgId,
          name: policyName.trim(),
          effect: policyEffect,
          subject: policySubject,
          resource: policyResource,
          action: policyAction,
          priority: Number(policyPriority),
        },
      });
      flash('Policy created.');
      setPolicyName('');
      setPolicySubject('');
      setPolicyResource('');
      setPolicyAction('');
      setShowPolicyForm(false);
      void mutatePolicies();
    } catch {
      setPolicyError('Failed to create policy.');
    } finally {
      setCreatingPolicy(false);
    }
  };

  const handlePolicyToggle = async (id: string, active: boolean) => {
    try {
      await client.put(`/api/v1/governance/policies/${id}`, { body: { active } });
      flash(`Policy ${active ? 'enabled' : 'disabled'}.`);
      void mutatePolicies();
    } catch {
      flash('Failed to update policy.');
    }
  };

  const TAB: (t: 'delegations' | 'policies') => React.CSSProperties = (t) => ({
    padding: '7px 16px',
    borderRadius: '7px',
    border: 'none',
    background: tab === t ? 'var(--mc-accent)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--muted)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  });

  const STATUS_FILTERS = [undefined, 'active', 'revoked', 'expired'];

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            Delegation & Policy
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Authority delegation · ABAC policy rules · access governance
          </p>
        </div>

        {successMsg && (
          <div
            style={{
              background: '#22c55e22',
              border: '1px solid #22c55e',
              color: '#22c55e',
              borderRadius: '8px',
              padding: '10px 16px',
              marginBottom: '16px',
              fontSize: '13px',
            }}
          >
            {successMsg}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '4px',
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '9px',
              padding: '4px',
            }}
          >
            <button
              style={TAB('delegations')}
              onClick={() => {
                setTab('delegations');
              }}
            >
              Delegations
            </button>
            <button
              style={TAB('policies')}
              onClick={() => {
                setTab('policies');
              }}
            >
              Policies
            </button>
          </div>
          <button
            onClick={() => {
              if (tab === 'delegations') {
                setShowDelegateForm((v) => !v);
              } else {
                setShowPolicyForm((v) => !v);
              }
            }}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              padding: '7px 16px',
              borderRadius: '7px',
              border: 'none',
              background: 'var(--mc-accent)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {tab === 'delegations'
              ? showDelegateForm
                ? 'Cancel'
                : '+ Delegate'
              : showPolicyForm
                ? 'Cancel'
                : '+ Add Policy'}
          </button>
        </div>

        {tab === 'delegations' && (
          <>
            {showDelegateForm && (
              <div
                style={{
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '10px',
                  padding: '18px',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--fg)',
                    marginBottom: '12px',
                  }}
                >
                  Create Delegation
                </div>
                <form
                  onSubmit={(e) => {
                    void handleDelegate(e);
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                >
                  <select
                    value={delegateeId}
                    required
                    onChange={(e) => {
                      setDelegateeId(e.target.value);
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '7px',
                      border: '1px solid var(--mc-border)',
                      background: 'var(--mc-bg)',
                      color: 'var(--fg)',
                      fontSize: '13px',
                    }}
                  >
                    <option value="">Select delegatee *</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Scope (comma-separated, e.g. approve:hr,view:reports)"
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value);
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '7px',
                      border: '1px solid var(--mc-border)',
                      background: 'var(--mc-bg)',
                      color: 'var(--fg)',
                      fontSize: '13px',
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid var(--mc-border)',
                        background: 'var(--mc-bg)',
                        color: 'var(--fg)',
                        fontSize: '13px',
                      }}
                    />
                    <input
                      type="date"
                      placeholder="Expires at (optional)"
                      value={expiresAt}
                      onChange={(e) => {
                        setExpiresAt(e.target.value);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid var(--mc-border)',
                        background: 'var(--mc-bg)',
                        color: 'var(--fg)',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                  {formError && (
                    <div style={{ color: '#ef4444', fontSize: '12px' }}>{formError}</div>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      alignSelf: 'flex-end',
                      padding: '7px 18px',
                      borderRadius: '7px',
                      border: 'none',
                      background: 'var(--mc-accent)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? 'Creating…' : 'Create'}
                  </button>
                </form>
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s ?? 'all'}
                  onClick={() => {
                    setStatusFilter(s);
                  }}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${statusFilter === s ? 'var(--mc-accent)' : 'var(--mc-border)'}`,
                    background: statusFilter === s ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: statusFilter === s ? '#818cf8' : 'var(--muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {s ?? 'All'}
                </button>
              ))}
            </div>

            {dLoading ? (
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '13px',
                  textAlign: 'center',
                  padding: '32px',
                }}
              >
                Loading…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {delegations.map((d) => (
                  <DelegationRow
                    key={d.id}
                    record={d}
                    onRevoke={(id) => {
                      void handleRevoke(id);
                    }}
                  />
                ))}
                {delegations.length === 0 && (
                  <div
                    style={{
                      color: 'var(--muted)',
                      fontSize: '13px',
                      textAlign: 'center',
                      padding: '32px',
                      background: 'var(--mc-card)',
                      border: '1px solid var(--mc-border)',
                      borderRadius: '10px',
                    }}
                  >
                    No delegations found.
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'policies' && (
          <>
            {showPolicyForm && (
              <div
                style={{
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '10px',
                  padding: '18px',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--fg)',
                    marginBottom: '12px',
                  }}
                >
                  Add Policy Rule
                </div>
                <form
                  onSubmit={(e) => {
                    void handleCreatePolicy(e);
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Policy name *"
                      value={policyName}
                      required
                      onChange={(e) => {
                        setPolicyName(e.target.value);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid var(--mc-border)',
                        background: 'var(--mc-bg)',
                        color: 'var(--fg)',
                        fontSize: '13px',
                      }}
                    />
                    <select
                      value={policyEffect}
                      onChange={(e) => {
                        setPolicyEffect(e.target.value as 'allow' | 'deny');
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid var(--mc-border)',
                        background: 'var(--mc-bg)',
                        color: 'var(--fg)',
                        fontSize: '13px',
                      }}
                    >
                      <option value="allow">Allow</option>
                      <option value="deny">Deny</option>
                    </select>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr 80px',
                      gap: '10px',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Subject *"
                      value={policySubject}
                      required
                      onChange={(e) => {
                        setPolicySubject(e.target.value);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid var(--mc-border)',
                        background: 'var(--mc-bg)',
                        color: 'var(--fg)',
                        fontSize: '13px',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Resource *"
                      value={policyResource}
                      required
                      onChange={(e) => {
                        setPolicyResource(e.target.value);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid var(--mc-border)',
                        background: 'var(--mc-bg)',
                        color: 'var(--fg)',
                        fontSize: '13px',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Action *"
                      value={policyAction}
                      required
                      onChange={(e) => {
                        setPolicyAction(e.target.value);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid var(--mc-border)',
                        background: 'var(--mc-bg)',
                        color: 'var(--fg)',
                        fontSize: '13px',
                      }}
                    />
                    <input
                      type="number"
                      placeholder="Priority"
                      value={policyPriority}
                      onChange={(e) => {
                        setPolicyPriority(e.target.value);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid var(--mc-border)',
                        background: 'var(--mc-bg)',
                        color: 'var(--fg)',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                  {policyError && (
                    <div style={{ color: '#ef4444', fontSize: '12px' }}>{policyError}</div>
                  )}
                  <button
                    type="submit"
                    disabled={creatingPolicy}
                    style={{
                      alignSelf: 'flex-end',
                      padding: '7px 18px',
                      borderRadius: '7px',
                      border: 'none',
                      background: 'var(--mc-accent)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: creatingPolicy ? 'not-allowed' : 'pointer',
                      opacity: creatingPolicy ? 0.7 : 1,
                    }}
                  >
                    {creatingPolicy ? 'Creating…' : 'Add Policy'}
                  </button>
                </form>
              </div>
            )}

            {pLoading ? (
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '13px',
                  textAlign: 'center',
                  padding: '32px',
                }}
              >
                Loading…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {policies.map((p) => (
                  <PolicyRow
                    key={p.id}
                    rule={p}
                    onToggle={(id, active) => {
                      void handlePolicyToggle(id, active);
                    }}
                  />
                ))}
                {policies.length === 0 && (
                  <div
                    style={{
                      color: 'var(--muted)',
                      fontSize: '13px',
                      textAlign: 'center',
                      padding: '32px',
                      background: 'var(--mc-card)',
                      border: '1px solid var(--mc-border)',
                      borderRadius: '10px',
                    }}
                  >
                    No policy rules defined.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
