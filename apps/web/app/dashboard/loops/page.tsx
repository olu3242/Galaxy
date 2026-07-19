'use client';

import { useState } from 'react';
import { useLoopInstances } from '../../../lib/api';
import type { LoopInstance } from '../../../lib/api';
import { useApiClient, useOrganizationId } from '../../../lib/api';

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  verifying: '#38bdf8',
  collecting_feedback: '#a78bfa',
  completed: '#22c55e',
  escalated: '#ef4444',
};

const STATUS_FILTERS = [
  'all',
  'pending',
  'verifying',
  'collecting_feedback',
  'completed',
  'escalated',
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${String(mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${String(hrs)}h ago`;
  return `${String(Math.floor(hrs / 24))}d ago`;
}

function isPastDeadline(deadline: string | null) {
  return deadline !== null && new Date(deadline) < new Date();
}

function LoopRow({
  loop,
  onAction,
}: {
  loop: LoopInstance;
  onAction: (id: string, action: 'complete' | 'escalate') => void;
}) {
  const color = STATUS_COLOR[loop.status] ?? 'var(--muted)';
  const overdue = isPastDeadline(loop.verificationDeadline);
  return (
    <tr style={{ borderBottom: '1px solid var(--mc-border)' }}>
      <td style={{ padding: '10px 16px' }}>
        <div style={{ fontSize: '12px', color: 'var(--fg)', fontFamily: 'monospace' }}>
          {loop.id.slice(0, 8)}…
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
          {loop.workflowInstanceId.slice(0, 8)}…
        </div>
      </td>
      <td style={{ padding: '10px 16px' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color,
            border: `1px solid ${color}`,
            borderRadius: '4px',
            padding: '2px 8px',
            textTransform: 'capitalize',
            whiteSpace: 'nowrap',
          }}
        >
          {loop.status.replace(/_/g, ' ')}
        </span>
      </td>
      <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--muted)' }}>
        {loop.phase ?? '—'}
      </td>
      <td
        style={{
          padding: '10px 16px',
          fontSize: '12px',
          color: overdue ? '#ef4444' : 'var(--muted)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loop.verificationDeadline
          ? overdue
            ? `Overdue (${new Date(loop.verificationDeadline).toLocaleDateString()})`
            : new Date(loop.verificationDeadline).toLocaleDateString()
          : '—'}
      </td>
      <td
        style={{
          padding: '10px 16px',
          fontSize: '12px',
          color: 'var(--muted)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loop.feedbackScore !== null ? `${String(loop.feedbackScore)}/5` : '—'}
      </td>
      <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--muted)' }}>
        {timeAgo(loop.createdAt)}
      </td>
      <td style={{ padding: '10px 16px' }}>
        {(loop.status === 'pending' || loop.status === 'verifying') && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => {
                onAction(loop.id, 'complete');
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
              Complete
            </button>
            <button
              onClick={() => {
                onAction(loop.id, 'escalate');
              }}
              style={{
                fontSize: '11px',
                padding: '3px 9px',
                borderRadius: '5px',
                cursor: 'pointer',
                border: '1px solid #ef4444',
                background: 'transparent',
                color: '#ef4444',
              }}
            >
              Escalate
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function LoopsPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data, isLoading, mutate } = useLoopInstances(
    statusFilter === 'all' ? undefined : statusFilter,
    page,
    20,
  );

  const loops = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const handleAction = async (id: string, action: 'complete' | 'escalate') => {
    if (!orgId) return;
    setActionError(null);
    try {
      if (action === 'complete') {
        await client.post(`/api/v1/loops/${id}/complete`, { body: { organizationId: orgId } });
        setSuccessMsg('Loop marked as completed.');
      } else {
        await client.post(`/api/v1/loops/${id}/escalate`, {
          body: { organizationId: orgId, reason: 'Manually escalated from Mission Control' },
        });
        setSuccessMsg('Loop escalated.');
      }
      void mutate();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch {
      setActionError(`Failed to ${action} loop.`);
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
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            Loop OS
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            {total} loop instances · verification & feedback tracking
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
        {actionError && (
          <div
            style={{
              background: '#ef444422',
              border: '1px solid #ef4444',
              color: '#ef4444',
              borderRadius: '8px',
              padding: '10px 16px',
              marginBottom: '16px',
              fontSize: '13px',
            }}
          >
            {actionError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              style={{
                padding: '5px 13px',
                borderRadius: '20px',
                border:
                  statusFilter === s ? '1px solid var(--mc-accent)' : '1px solid var(--mc-border)',
                background: statusFilter === s ? 'rgba(99,102,241,0.15)' : 'var(--mc-card)',
                color: statusFilter === s ? 'var(--mc-accent)' : 'var(--muted)',
                fontSize: '12px',
                fontWeight: statusFilter === s ? 600 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {isLoading && (
          <div
            style={{
              color: 'var(--muted)',
              textAlign: 'center',
              padding: '40px',
              fontSize: '14px',
            }}
          >
            Loading…
          </div>
        )}

        {!isLoading && loops.length === 0 && (
          <div
            style={{
              color: 'var(--muted)',
              textAlign: 'center',
              padding: '40px',
              fontSize: '14px',
            }}
          >
            No loop instances found.
          </div>
        )}

        {loops.length > 0 && (
          <div
            style={{
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--mc-border)' }}>
                    {['Loop ID', 'Status', 'Phase', 'Deadline', 'Score', 'Created', 'Actions'].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: '10px 16px',
                            textAlign: 'left',
                            color: 'var(--muted)',
                            fontWeight: 600,
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loops.map((loop) => (
                    <LoopRow
                      key={loop.id}
                      loop={loop}
                      onAction={(id, action) => {
                        void handleAction(id, action);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
            <button
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
              }}
              disabled={page === 1}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-card)',
                color: page === 1 ? 'var(--muted)' : 'var(--fg)',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                fontSize: '13px',
              }}
            >
              Prev
            </button>
            <span style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--muted)' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1));
              }}
              disabled={page === totalPages}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-card)',
                color: page === totalPages ? 'var(--muted)' : 'var(--fg)',
                cursor: page === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '13px',
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
