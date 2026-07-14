'use client';

import { useState } from 'react';
import { useRoles, useFeatureFlags, useApiClient, useOrganizationId } from '../../../lib/api';
import type { RoleDefinition, FeatureFlag } from '../../../lib/api';

function RoleRow({ role }: { role: RoleDefinition }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--mc-bg)',
        border: '1px solid var(--mc-border)',
        borderRadius: '8px',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>{role.name}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
          {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
        </div>
      </div>
      {role.isSystem && (
        <span
          style={{
            fontSize: '10px',
            color: '#818cf8',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: '4px',
            padding: '2px 7px',
          }}
        >
          System
        </span>
      )}
    </div>
  );
}

function FlagRow({
  flag,
  onToggle,
}: {
  flag: FeatureFlag;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--mc-bg)',
        border: '1px solid var(--mc-border)',
        borderRadius: '8px',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>{flag.key}</div>
        {flag.description && (
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            {flag.description}
          </div>
        )}
      </div>
      <button
        onClick={() => {
          onToggle(flag.key, !flag.enabled);
        }}
        style={{
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          border: 'none',
          background: flag.enabled ? '#6366f1' : 'var(--mc-border)',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: flag.enabled ? '23px' : '3px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const { data: rolesData, isLoading: rolesLoading, mutate: mutateRoles } = useRoles();
  const { data: flagsData, isLoading: flagsLoading, mutate: mutateFlags } = useFeatureFlags();

  const roles = rolesData?.data ?? [];
  const flags = flagsData?.flags ?? [];

  const [showRoleForm, setShowRoleForm] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [rolePerms, setRolePerms] = useState('');
  const [addingRole, setAddingRole] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [tab, setTab] = useState<'roles' | 'flags' | 'org'>('roles');
  const [orgName, setOrgName] = useState('');
  const [orgTimezone, setOrgTimezone] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
  };

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !roleName.trim()) return;
    setAddingRole(true);
    setRoleError(null);
    try {
      const permissions = rolePerms
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      await client.post('/api/v1/identity/roles', {
        body: { organizationId: orgId, name: roleName.trim(), permissions },
      });
      flash('Role created.');
      setRoleName('');
      setRolePerms('');
      setShowRoleForm(false);
      void mutateRoles();
    } catch {
      setRoleError('Failed to create role.');
    } finally {
      setAddingRole(false);
    }
  };

  const handleFlagToggle = async (key: string, enabled: boolean) => {
    if (!orgId) return;
    try {
      await client.put(`/api/v1/governance/feature-flags/${key}`, {
        body: { organizationId: orgId, enabled },
      });
      flash(`Feature flag ${enabled ? 'enabled' : 'disabled'}.`);
      void mutateFlags();
    } catch {
      flash('Failed to update flag.');
    }
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setSavingOrg(true);
    try {
      await client.put(`/api/v1/identity/organizations/${orgId}`, {
        body: { name: orgName || undefined, timezone: orgTimezone || undefined },
      });
      flash('Organization updated.');
    } catch {
      flash('Failed to update organization.');
    } finally {
      setSavingOrg(false);
    }
  };

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px',
    borderRadius: '7px',
    border: 'none',
    background: active ? 'var(--mc-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--muted)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  });

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            Settings
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Roles · feature flags · organization profile
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
            gap: '4px',
            marginBottom: '20px',
            background: 'var(--mc-card)',
            border: '1px solid var(--mc-border)',
            borderRadius: '9px',
            padding: '4px',
            width: 'fit-content',
          }}
        >
          <button
            style={TAB_STYLE(tab === 'roles')}
            onClick={() => {
              setTab('roles');
            }}
          >
            Roles
          </button>
          <button
            style={TAB_STYLE(tab === 'flags')}
            onClick={() => {
              setTab('flags');
            }}
          >
            Feature Flags
          </button>
          <button
            style={TAB_STYLE(tab === 'org')}
            onClick={() => {
              setTab('org');
            }}
          >
            Org Profile
          </button>
        </div>

        {tab === 'roles' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {roles.length} roles
              </span>
              <button
                onClick={() => {
                  setShowRoleForm((v) => !v);
                }}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--mc-accent)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {showRoleForm ? 'Cancel' : '+ New Role'}
              </button>
            </div>

            {showRoleForm && (
              <form
                onSubmit={(e) => {
                  void handleAddRole(e);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginBottom: '14px',
                  padding: '14px',
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '8px',
                }}
              >
                <input
                  type="text"
                  placeholder="Role name *"
                  value={roleName}
                  required
                  onChange={(e) => {
                    setRoleName(e.target.value);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
                <input
                  type="text"
                  placeholder="Permissions (comma-separated)"
                  value={rolePerms}
                  onChange={(e) => {
                    setRolePerms(e.target.value);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
                {roleError && <div style={{ color: '#ef4444', fontSize: '12px' }}>{roleError}</div>}
                <button
                  type="submit"
                  disabled={addingRole}
                  style={{
                    alignSelf: 'flex-end',
                    padding: '7px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--mc-accent)',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: addingRole ? 'not-allowed' : 'pointer',
                    opacity: addingRole ? 0.7 : 1,
                  }}
                >
                  {addingRole ? 'Creating…' : 'Create Role'}
                </button>
              </form>
            )}

            {rolesLoading ? (
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '13px',
                  padding: '24px 0',
                  textAlign: 'center',
                }}
              >
                Loading…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {roles.map((role: RoleDefinition) => (
                  <RoleRow key={role.id} role={role} />
                ))}
                {roles.length === 0 && (
                  <div
                    style={{
                      color: 'var(--muted)',
                      fontSize: '13px',
                      textAlign: 'center',
                      padding: '32px',
                    }}
                  >
                    No roles defined.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'flags' && (
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '12px',
              }}
            >
              {flags.length} flags
            </div>
            {flagsLoading ? (
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '13px',
                  padding: '24px 0',
                  textAlign: 'center',
                }}
              >
                Loading…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {flags.map((flag) => (
                  <FlagRow
                    key={flag.key}
                    flag={flag}
                    onToggle={(k, en) => {
                      void handleFlagToggle(k, en);
                    }}
                  />
                ))}
                {flags.length === 0 && (
                  <div
                    style={{
                      color: 'var(--muted)',
                      fontSize: '13px',
                      textAlign: 'center',
                      padding: '32px',
                    }}
                  >
                    No feature flags configured.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'org' && (
          <div
            style={{
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '10px',
              padding: '20px',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--fg)',
                marginBottom: '16px',
              }}
            >
              Organization Profile
            </div>
            <form
              onSubmit={(e) => {
                void handleSaveOrg(e);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Organization Name</label>
                <input
                  type="text"
                  placeholder="Your organization name"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                  }}
                  style={{
                    padding: '9px 13px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Timezone</label>
                <input
                  type="text"
                  placeholder="e.g. Africa/Lagos"
                  value={orgTimezone}
                  onChange={(e) => {
                    setOrgTimezone(e.target.value);
                  }}
                  style={{
                    padding: '9px 13px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={savingOrg}
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 20px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'var(--mc-accent)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: savingOrg ? 'not-allowed' : 'pointer',
                  opacity: savingOrg ? 0.7 : 1,
                }}
              >
                {savingOrg ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
