'use client';

import { useState } from 'react';
import { useBroadcasts } from '../../../lib/api';
import { useApiClient, useOrganizationId } from '../../../lib/api/context';
import { useAuth } from '../../../lib/auth/context';

const TARGET_TYPES = ['all', 'department', 'team', 'role', 'custom'] as const;
type TargetType = (typeof TARGET_TYPES)[number];

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'sent'
      ? '#22c55e'
      : status === 'failed'
        ? '#ef4444'
        : status === 'draft'
          ? '#64748b'
          : '#f59e0b';
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '999px',
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {status}
    </span>
  );
}

export default function BroadcastPage() {
  const orgId = useOrganizationId();
  const { user } = useAuth();
  const client = useApiClient();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data, mutate } = useBroadcasts();
  const broadcasts = data?.data ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !user?.id) return;
    setError(null);
    setSuccessMsg(null);
    setSending(true);
    try {
      await client.post('/api/v1/broadcasts', {
        body: {
          organizationId: orgId,
          title,
          content,
          targetType,
          sentBy: user.id,
        },
      });
      setTitle('');
      setContent('');
      setTargetType('all');
      setSuccessMsg('Broadcast created. You can send it from the list below.');
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create broadcast');
    } finally {
      setSending(false);
    }
  }

  async function handleSend(broadcastId: string) {
    if (!orgId || !user?.id) return;
    setSending(true);
    setError(null);
    try {
      await client.post(`/api/v1/broadcasts/${broadcastId}/send`, {
        body: { organizationId: orgId, actorId: user.id },
      });
      setSuccessMsg('Broadcast sent to all active members via WhatsApp.');
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  }

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
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            Broadcast
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            Send WhatsApp messages to all or filtered organization members
          </p>
        </div>

        {/* Composer */}
        <div
          style={{
            background: 'var(--mc-card)',
            border: '1px solid var(--mc-border)',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '32px',
          }}
        >
          <h2
            style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fg)', marginBottom: '16px' }}
          >
            New Broadcast
          </h2>
          <form
            onSubmit={(e) => {
              void handleCreate(e);
            }}
          >
            <div style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--muted)',
                  marginBottom: '6px',
                }}
              >
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                required
                placeholder="e.g. Public Holiday Notice"
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: 'var(--fg)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--muted)',
                  marginBottom: '6px',
                }}
              >
                Message
              </label>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                }}
                required
                rows={4}
                placeholder="Type your message here…"
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: 'var(--fg)',
                  fontSize: '13px',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--muted)',
                  marginBottom: '6px',
                }}
              >
                Audience
              </label>
              <select
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value as TargetType);
                }}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: 'var(--fg)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t} value={t} style={{ background: '#0b1120' }}>
                    {t === 'all' ? 'All members' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
            )}
            {successMsg && (
              <p style={{ color: '#22c55e', fontSize: '13px', marginBottom: '12px' }}>
                {successMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              style={{
                background: sending ? 'rgba(99,102,241,0.4)' : '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? 'Working…' : 'Create Broadcast'}
            </button>
          </form>
        </div>

        {/* Broadcast list */}
        <h2
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--fg)',
            marginBottom: '12px',
          }}
        >
          Recent Broadcasts
        </h2>
        {broadcasts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>No broadcasts yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {broadcasts.map((b) => (
              <div
                key={b.id}
                style={{
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '10px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '13px',
                      color: 'var(--fg)',
                      marginBottom: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.title}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.content.slice(0, 80)}
                    {b.content.length > 80 ? '…' : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                    Audience: {b.targetType} · Sent: {b.sentCount} · Failed: {b.failedCount}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  <StatusBadge status={b.status} />
                  {b.status === 'draft' && (
                    <button
                      onClick={() => {
                        void handleSend(b.id);
                      }}
                      disabled={sending}
                      style={{
                        background: '#6366f1',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '7px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: sending ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Send
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
