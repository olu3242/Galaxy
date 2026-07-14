'use client';

import { useState } from 'react';
import { useTenants, useApiClient } from '../../../lib/api';
import type { TenantSummary } from '../../../lib/api';

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  trial: '#38bdf8',
  suspended: '#ef4444',
};

const PLAN_COLOR: Record<string, string> = {
  enterprise: '#818cf8',
  pro: '#f59e0b',
  starter: '#22c55e',
  free: 'var(--muted)',
};

function TenantRow({
  tenant,
  onSuspend,
  onActivate,
}: {
  tenant: TenantSummary;
  onSuspend: (id: string) => void;
  onActivate: (id: string) => void;
}) {
  const statusColor = STATUS_COLOR[tenant.status] ?? 'var(--muted)';
  const planColor = PLAN_COLOR[tenant.plan] ?? 'var(--muted)';
  return (
    <tr style={{ borderBottom: '1px solid var(--mc-border)' }}>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>{tenant.name}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>
          {tenant.slug}
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span
          style={{
            fontSize: '10px',
            color: planColor,
            border: `1px solid ${planColor}`,
            borderRadius: '4px',
            padding: '2px 7px',
            fontWeight: 600,
            textTransform: 'capitalize',
          }}
        >
          {tenant.plan}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span
          style={{
            fontSize: '10px',
            color: statusColor,
            border: `1px solid ${statusColor}`,
            borderRadius: '4px',
            padding: '2px 7px',
            textTransform: 'capitalize',
          }}
        >
          {tenant.status}
        </span>
      </td>
      <td
        style={{
          padding: '12px 16px',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontSize: '12px',
          color: 'var(--fg)',
        }}
      >
        {String(tenant.memberCount)}
      </td>
      <td
        style={{
          padding: '12px 16px',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontSize: '12px',
          color: 'var(--fg)',
        }}
      >
        {String(tenant.workflowCount)}
      </td>
      <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--muted)' }}>
        {new Date(tenant.createdAt).toLocaleDateString()}
      </td>
      <td style={{ padding: '12px 16px' }}>
        {tenant.status === 'active' || tenant.status === 'trial' ? (
          <button
            onClick={() => {
              onSuspend(tenant.id);
            }}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              border: '1px solid #ef4444',
              background: 'transparent',
              color: '#ef4444',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Suspend
          </button>
        ) : (
          <button
            onClick={() => {
              onActivate(tenant.id);
            }}
            style={{
              padding: '4px 10px',
              borderRadius: '5px',
              border: '1px solid #22c55e',
              background: 'transparent',
              color: '#22c55e',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Activate
          </button>
        )}
      </td>
    </tr>
  );
}

export default function TenantsPage() {
  const client = useApiClient();
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate } = useTenants(page, 20);
  const [search, setSearch] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newPlan, setNewPlan] = useState('starter');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const tenants = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const filtered = search
    ? tenants.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.slug.includes(search.toLowerCase()),
      )
    : tenants;

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
  };

  const handleSuspend = async (id: string) => {
    try {
      await client.put(`/api/v1/admin/tenants/${id}/suspend`, {});
      flash('Tenant suspended.');
      void mutate();
    } catch {
      flash('Failed to suspend tenant.');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await client.put(`/api/v1/admin/tenants/${id}/activate`, {});
      flash('Tenant activated.');
      void mutate();
    } catch {
      flash('Failed to activate tenant.');
    }
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await client.post('/api/v1/admin/tenants', {
        body: { name: newName.trim(), slug: newSlug.trim(), plan: newPlan },
      });
      flash('Tenant created.');
      setNewName('');
      setNewSlug('');
      setShowCreate(false);
      void mutate();
    } catch {
      setCreateError('Failed to create tenant.');
    } finally {
      setCreating(false);
    }
  };

  const PLANS = ['free', 'starter', 'pro', 'enterprise'];

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
              Tenant Management
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
              {total} organizations · cross-tenant monitoring and administration
            </p>
          </div>
          <button
            onClick={() => {
              setShowCreate((v) => !v);
            }}
            style={{
              fontSize: '13px',
              fontWeight: 600,
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--mc-accent)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {showCreate ? 'Cancel' : '+ New Tenant'}
          </button>
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

        {showCreate && (
          <div
            style={{
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '10px',
              padding: '18px',
              marginBottom: '20px',
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
              Create Tenant
            </div>
            <form
              onSubmit={(e) => {
                void handleCreate(e);
              }}
              style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}
            >
              <input
                type="text"
                placeholder="Organization name *"
                value={newName}
                required
                onChange={(e) => {
                  setNewName(e.target.value);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--mc-border)',
                  background: 'var(--mc-bg)',
                  color: 'var(--fg)',
                  fontSize: '13px',
                  minWidth: '200px',
                }}
              />
              <input
                type="text"
                placeholder="Slug (unique identifier) *"
                value={newSlug}
                required
                onChange={(e) => {
                  setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--mc-border)',
                  background: 'var(--mc-bg)',
                  color: 'var(--fg)',
                  fontSize: '13px',
                  minWidth: '180px',
                }}
              />
              <select
                value={newPlan}
                onChange={(e) => {
                  setNewPlan(e.target.value);
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
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {createError && (
                <div style={{ color: '#ef4444', fontSize: '12px', width: '100%' }}>
                  {createError}
                </div>
              )}
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: '8px 18px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'var(--mc-accent)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.7 : 1,
                }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </form>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Search by name or slug…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            style={{
              padding: '8px 13px',
              borderRadius: '8px',
              border: '1px solid var(--mc-border)',
              background: 'var(--mc-bg)',
              color: 'var(--fg)',
              fontSize: '13px',
              flex: 1,
            }}
          />
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {String(filtered.length)} of {String(total)}
          </div>
        </div>

        {isLoading ? (
          <div
            style={{
              color: 'var(--muted)',
              fontSize: '13px',
              textAlign: 'center',
              padding: '48px',
            }}
          >
            Loading…
          </div>
        ) : (
          <div
            style={{
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '10px',
              overflow: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--mc-border)' }}>
                  {[
                    'Organization',
                    'Plan',
                    'Status',
                    'Members',
                    'Workflows',
                    'Created',
                    'Actions',
                  ].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign: i >= 3 && i <= 4 ? 'right' : 'left',
                        fontWeight: 600,
                        color: 'var(--muted)',
                        fontSize: '11px',
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
                {filtered.map((t) => (
                  <TenantRow
                    key={t.id}
                    tenant={t}
                    onSuspend={(id) => {
                      void handleSuspend(id);
                    }}
                    onActivate={(id) => {
                      void handleActivate(id);
                    }}
                  />
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div
                style={{
                  padding: '32px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: '13px',
                }}
              >
                No tenants found.
              </div>
            )}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
            <button
              disabled={page === 1}
              onClick={() => {
                setPage((p) => p - 1);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-card)',
                color: 'var(--fg)',
                fontSize: '12px',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                opacity: page === 1 ? 0.5 : 1,
              }}
            >
              Prev
            </button>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Page {String(page)} of {String(totalPages)}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => {
                setPage((p) => p + 1);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-card)',
                color: 'var(--fg)',
                fontSize: '12px',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
