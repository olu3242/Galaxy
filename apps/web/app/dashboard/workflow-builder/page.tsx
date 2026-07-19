'use client';

import { useState } from 'react';
import { useWorkflowDefinitions, useApiClient, useOrganizationId } from '../../../lib/api';
import type { WorkflowDefinition } from '../../../lib/api';
import { useAuth } from '../../../lib/auth/context';

const CATEGORIES = [
  'hr',
  'finance',
  'operations',
  'compliance',
  'communication',
  'custom',
] as const;
type Category = (typeof CATEGORIES)[number];

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  paused: '#f59e0b',
  archived: 'var(--muted)',
};

const DEFAULT_STATES = ['submitted', 'pending_approval', 'approved', 'rejected', 'completed'];
const DEFAULT_TRANSITIONS = [
  { from: 'submitted', to: 'pending_approval', trigger: 'submit' },
  { from: 'pending_approval', to: 'approved', trigger: 'approve' },
  { from: 'pending_approval', to: 'rejected', trigger: 'reject' },
  { from: 'approved', to: 'completed', trigger: 'complete' },
];

function DefCard({
  def,
  onStatusChange,
  selected,
  onSelect,
}: {
  def: WorkflowDefinition;
  onStatusChange: (id: string, status: string) => void;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = STATUS_COLOR[def.status] ?? 'var(--muted)';
  return (
    <div
      onClick={() => {
        onSelect(def.id);
      }}
      style={{
        background: selected ? 'rgba(99,102,241,0.1)' : 'var(--mc-card)',
        border: selected ? '2px solid #6366f1' : '1px solid var(--mc-border)',
        borderRadius: '10px',
        padding: '16px',
        cursor: 'pointer',
        transition: 'border 0.1s',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '6px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>{def.name}</div>
        <span
          style={{
            fontSize: '10px',
            color,
            border: `1px solid ${color}`,
            borderRadius: '4px',
            padding: '2px 7px',
            textTransform: 'capitalize',
          }}
        >
          {def.status}
        </span>
      </div>
      <div
        style={{
          fontSize: '11px',
          color: '#818cf8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '6px',
        }}
      >
        {def.category}
      </div>
      {def.description && (
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>
          {def.description.slice(0, 100)}
          {def.description.length > 100 ? '…' : ''}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
        {def.status !== 'active' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(def.id, 'active');
            }}
            style={{
              fontSize: '11px',
              padding: '3px 9px',
              borderRadius: '5px',
              cursor: 'pointer',
              border: '1px solid #22c55e',
              background: 'transparent',
              color: '#22c55e',
            }}
          >
            Activate
          </button>
        )}
        {def.status === 'active' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(def.id, 'paused');
            }}
            style={{
              fontSize: '11px',
              padding: '3px 9px',
              borderRadius: '5px',
              cursor: 'pointer',
              border: '1px solid #f59e0b',
              background: 'transparent',
              color: '#f59e0b',
            }}
          >
            Pause
          </button>
        )}
        {def.status !== 'archived' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(def.id, 'archived');
            }}
            style={{
              fontSize: '11px',
              padding: '3px 9px',
              borderRadius: '5px',
              cursor: 'pointer',
              border: '1px solid var(--mc-border)',
              background: 'transparent',
              color: 'var(--muted)',
            }}
          >
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

export default function WorkflowBuilderPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const { user } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('hr');
  const [slaHours, setSlaHours] = useState('24');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data, isLoading, mutate } = useWorkflowDefinitions();
  const definitions = data?.data ?? [];
  const selectedDef = definitions.find((d) => d.id === selectedId) ?? null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await client.post('/api/v1/workflow-os/definitions', {
        body: {
          organizationId: orgId,
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          createdBy: user?.id ?? 'system',
          definition: {
            states: DEFAULT_STATES,
            initialState: 'submitted',
            transitions: DEFAULT_TRANSITIONS,
            slaHours: parseInt(slaHours, 10) || 24,
            requiresApproval,
            approvalLevels: 1,
          },
        },
      });
      setSuccessMsg('Workflow created.');
      setName('');
      setDescription('');
      setShowCreate(false);
      void mutate();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch {
      setCreateError('Failed to create workflow.');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    if (!orgId) return;
    try {
      await client.patch(`/api/v1/workflow-os/definitions/${id}`, {
        body: { organizationId: orgId, status },
      });
      setSuccessMsg(`Workflow ${status}.`);
      void mutate();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch {
      setCreateError('Failed to update workflow status.');
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
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
              Workflow Builder
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
              {definitions.length} workflow definitions
            </p>
          </div>
          <button
            onClick={() => {
              setShowCreate((v) => !v);
              setSelectedId(null);
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
            {showCreate ? 'Cancel' : '+ New Workflow'}
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
          <form
            onSubmit={(e) => {
              void handleCreate(e);
            }}
            style={{
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '10px',
              padding: '20px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fg)' }}>
              New Workflow Definition
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <input
                type="text"
                placeholder="Workflow name *"
                value={name}
                required
                onChange={(e) => {
                  setName(e.target.value);
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
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as Category);
                }}
                style={{
                  padding: '9px 13px',
                  borderRadius: '7px',
                  border: '1px solid var(--mc-border)',
                  background: 'var(--mc-bg)',
                  color: 'var(--fg)',
                  fontSize: '13px',
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              placeholder="Description (optional)"
              value={description}
              rows={2}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              style={{
                padding: '9px 13px',
                borderRadius: '7px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-bg)',
                color: 'var(--fg)',
                fontSize: '13px',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--muted)' }}>SLA Hours</label>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={slaHours}
                  onChange={(e) => {
                    setSlaHours(e.target.value);
                  }}
                  style={{
                    width: '80px',
                    padding: '8px 12px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: 'var(--fg)',
                  cursor: 'pointer',
                  paddingTop: '16px',
                }}
              >
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => {
                    setRequiresApproval(e.target.checked);
                  }}
                />
                Requires Approval
              </label>
            </div>
            {createError && <div style={{ fontSize: '12px', color: '#ef4444' }}>{createError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: '8px 20px',
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
                {creating ? 'Creating…' : 'Create Workflow'}
              </button>
            </div>
          </form>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: selectedDef ? '1fr 1fr' : '1fr 1fr 1fr',
            gap: '16px',
          }}
        >
          {isLoading && (
            <div
              style={{
                color: 'var(--muted)',
                fontSize: '14px',
                gridColumn: '1/-1',
                textAlign: 'center',
                padding: '40px',
              }}
            >
              Loading…
            </div>
          )}
          {!isLoading && definitions.length === 0 && (
            <div
              style={{
                color: 'var(--muted)',
                fontSize: '14px',
                gridColumn: '1/-1',
                textAlign: 'center',
                padding: '40px',
              }}
            >
              No workflow definitions yet. Create one above.
            </div>
          )}
          {definitions.map((def) => (
            <DefCard
              key={def.id}
              def={def}
              selected={selectedId === def.id}
              onSelect={(id) => {
                setSelectedId((prev) => (prev === id ? null : id));
                setShowCreate(false);
              }}
              onStatusChange={(id, status) => {
                void handleStatusChange(id, status);
              }}
            />
          ))}
        </div>

        {selectedDef && (
          <div
            style={{
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '10px',
              padding: '20px',
              marginTop: '20px',
            }}
          >
            <div
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--fg)',
                marginBottom: '12px',
              }}
            >
              {selectedDef.name} — Definition
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--muted)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px',
                  }}
                >
                  States
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {((selectedDef.definition.states as string[] | undefined) ?? []).map((s) => (
                    <span
                      key={s}
                      style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        background:
                          s === (selectedDef.definition.initialState as string)
                            ? 'rgba(99,102,241,0.2)'
                            : 'var(--mc-bg)',
                        color:
                          s === (selectedDef.definition.initialState as string)
                            ? '#818cf8'
                            : 'var(--muted)',
                        border: '1px solid var(--mc-border)',
                      }}
                    >
                      {s}
                      {s === (selectedDef.definition.initialState as string) ? ' (initial)' : ''}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--muted)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px',
                  }}
                >
                  Transitions
                </div>
                {(
                  (selectedDef.definition.transitions as
                    | { from: string; to: string; trigger: string }[]
                    | undefined) ?? []
                ).map((t, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: '12px',
                      color: 'var(--muted)',
                      marginBottom: '4px',
                      fontFamily: 'monospace',
                    }}
                  >
                    {t.from} → {t.to} <span style={{ color: '#818cf8' }}>({t.trigger})</span>
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '20px',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--mc-border)',
              }}
            >
              {[
                {
                  label: 'SLA Hours',
                  value:
                    typeof selectedDef.definition.slaHours === 'number'
                      ? String(selectedDef.definition.slaHours)
                      : '—',
                },
                {
                  label: 'Requires Approval',
                  value: (selectedDef.definition.requiresApproval as boolean) ? 'Yes' : 'No',
                },
                { label: 'Version', value: String(selectedDef.version) },
                { label: 'Category', value: selectedDef.category },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{item.label}</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
