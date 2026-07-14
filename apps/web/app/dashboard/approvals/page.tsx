'use client';

import { useState, useCallback } from 'react';
import { usePendingApprovals, useAllApprovals } from '../../../lib/api';
import { useApiClient } from '../../../lib/api/context';
import { useOrganizationId } from '../../../lib/api/context';
import { useAuth } from '../../../lib/auth/context';

type ApprovalsTab = 'pending' | 'all';

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#6366f1',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
  escalated: '#a78bfa',
};

function timeAgo(date: string) {
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${String(mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${String(hrs)}h ago`;
  return `${String(Math.floor(hrs / 24))}d ago`;
}

function isDue(dueAt: string | undefined): boolean {
  return dueAt != null && new Date(dueAt) < new Date();
}

const ALL_STATUS_FILTERS = ['', 'pending', 'approved', 'rejected', 'escalated'] as const;

export default function ApprovalsPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const { user } = useAuth();
  const [tab, setTab] = useState<ApprovalsTab>('pending');
  const [allStatusFilter, setAllStatusFilter] = useState<string>('');
  const [allPage, setAllPage] = useState(1);

  const { data, isLoading, error, mutate } = usePendingApprovals();
  const {
    data: allData,
    isLoading: allLoading,
    mutate: allMutate,
  } = useAllApprovals(allStatusFilter || undefined, allPage, 20);

  const [deciding, setDeciding] = useState<Record<string, 'approving' | 'rejecting'>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const decide = useCallback(
    async (approvalId: string, decision: 'approved' | 'rejected') => {
      if (!orgId || !user?.id) return;
      setDeciding((prev) => ({
        ...prev,
        [approvalId]: decision === 'approved' ? 'approving' : 'rejecting',
      }));
      try {
        await client.post(`/api/v1/workflow-os/approvals/${approvalId}/decide`, {
          body: {
            organizationId: orgId,
            stepId: approvalId,
            approverId: user.id,
            decision,
            ...(comment[approvalId] ? { comment: comment[approvalId] } : {}),
          },
        });
        await mutate();
        void allMutate();
      } catch {
        // error visible via retry
      } finally {
        setDeciding((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([k]) => k !== approvalId)),
        );
      }
    },
    [client, orgId, user, comment, mutate, allMutate],
  );

  const approvals = data?.data ?? [];
  const pending = approvals.filter((a) => a.status === 'pending');
  const overdue = pending.filter((a) => isDue(a.dueAt));

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
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            Approvals
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
            {isLoading
              ? '…'
              : `${String(pending.length)} pending · ${String(overdue.length)} overdue`}
          </p>
        </div>

        {/* Tab selector */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: 'var(--mc-card)',
            border: '1px solid var(--mc-border)',
            borderRadius: '9px',
            padding: '4px',
            width: 'fit-content',
            marginBottom: '20px',
          }}
        >
          {(['pending', 'all'] as ApprovalsTab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
              }}
              style={{
                padding: '7px 18px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '13px',
                background: tab === t ? 'var(--mc-accent)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--muted)',
                fontWeight: tab === t ? 600 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t === 'pending' ? 'Pending' : 'All Approvals'}
            </button>
          ))}
        </div>

        {/* All approvals tab */}
        {tab === 'all' && (
          <div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {ALL_STATUS_FILTERS.map((s) => (
                <button
                  key={s || 'all'}
                  onClick={() => {
                    setAllStatusFilter(s);
                    setAllPage(1);
                  }}
                  style={{
                    padding: '5px 13px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    border:
                      allStatusFilter === s
                        ? '1px solid var(--mc-accent)'
                        : '1px solid var(--mc-border)',
                    background: allStatusFilter === s ? 'rgba(99,102,241,0.15)' : 'var(--mc-card)',
                    color: allStatusFilter === s ? 'var(--mc-accent)' : 'var(--muted)',
                    fontWeight: allStatusFilter === s ? 600 : 400,
                    textTransform: 'capitalize',
                  }}
                >
                  {s || 'All'}
                </button>
              ))}
            </div>
            {allLoading && (
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
            {!allLoading && (allData?.data ?? []).length === 0 && (
              <div
                style={{
                  color: 'var(--muted)',
                  textAlign: 'center',
                  padding: '40px',
                  fontSize: '14px',
                }}
              >
                No approvals found.
              </div>
            )}
            <div
              style={{
                background: 'var(--mc-card)',
                border: '1px solid var(--mc-border)',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              {(allData?.data ?? []).length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--mc-border)' }}>
                        {['Workflow', 'Requested By', 'Status', 'Priority', 'Due', 'Created'].map(
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
                      {(allData?.data ?? []).map((a) => {
                        const sc = STATUS_COLOR[a.status] ?? 'var(--muted)';
                        const pc = PRIORITY_COLOR[a.priority ?? ''] ?? 'var(--muted)';
                        return (
                          <tr key={a.id} style={{ borderBottom: '1px solid var(--mc-border)' }}>
                            <td
                              style={{ padding: '10px 16px', color: 'var(--fg)', fontWeight: 500 }}
                            >
                              {a.workflowName ?? a.workflowId.slice(0, 8) + '…'}
                            </td>
                            <td
                              style={{
                                padding: '10px 16px',
                                color: 'var(--muted)',
                                fontFamily: 'monospace',
                                fontSize: '12px',
                              }}
                            >
                              {a.requestedBy.slice(0, 10)}…
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: sc,
                                  border: `1px solid ${sc}`,
                                  borderRadius: '4px',
                                  padding: '2px 7px',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {a.status}
                              </span>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              {a.priority && (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: pc,
                                    border: `1px solid ${pc}`,
                                    borderRadius: '4px',
                                    padding: '2px 7px',
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  {a.priority}
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                padding: '10px 16px',
                                color: isDue(a.dueAt) ? '#ef4444' : 'var(--muted)',
                                fontSize: '12px',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {a.dueAt ? new Date(a.dueAt).toLocaleDateString() : '—'}
                            </td>
                            <td
                              style={{
                                padding: '10px 16px',
                                color: 'var(--muted)',
                                fontSize: '12px',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {timeAgo(a.requestedAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pending approvals tab */}
        {tab === 'pending' && (
          <>
            {error && (
              <div
                style={{
                  background: '#ef444418',
                  border: '1px solid #ef444440',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  color: '#f87171',
                  marginBottom: '16px',
                  fontSize: '14px',
                }}
              >
                Failed to load approvals.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: '100px',
                      borderRadius: '12px',
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border)',
                      opacity: 0.6,
                    }}
                  />
                ))
              ) : approvals.length === 0 ? (
                <div
                  style={{
                    padding: '60px',
                    textAlign: 'center',
                    color: 'var(--muted)',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>✓</div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>No pending approvals</div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>
                    All items have been processed.
                  </div>
                </div>
              ) : (
                approvals.map((a) => {
                  const isExpanded = expandedId === a.id;
                  const dec = deciding[a.id];
                  const overdueBadge = isDue(a.dueAt);
                  return (
                    <div
                      key={a.id}
                      style={{
                        background: 'var(--card-bg)',
                        border: `1px solid ${overdueBadge ? '#ef444440' : 'var(--border)'}`,
                        borderRadius: '12px',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ padding: '16px 20px' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '4px',
                                flexWrap: 'wrap',
                              }}
                            >
                              {a.priority && (
                                <span
                                  style={{
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: `${PRIORITY_COLOR[a.priority] ?? '#6366f1'}20`,
                                    color: PRIORITY_COLOR[a.priority] ?? '#6366f1',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}
                                >
                                  {a.priority}
                                </span>
                              )}
                              <span
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  background: `${STATUS_COLOR[a.status] ?? '#64748b'}18`,
                                  color: STATUS_COLOR[a.status] ?? '#64748b',
                                }}
                              >
                                {a.status}
                              </span>
                              {overdueBadge && (
                                <span
                                  style={{
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: '#ef444420',
                                    color: '#ef4444',
                                  }}
                                >
                                  OVERDUE
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
                              {a.workflowName ?? `Approval ${a.id.slice(0, 8)}`}
                            </div>
                            <div
                              style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}
                            >
                              Requested by {a.requestedBy} · {timeAgo(a.requestedAt)}
                              {a.dueAt ? ` · Due ${new Date(a.dueAt).toLocaleDateString()}` : ''}
                            </div>
                          </div>

                          {a.status === 'pending' && (
                            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                              <button
                                onClick={() => {
                                  setExpandedId(isExpanded ? null : a.id);
                                }}
                                style={{
                                  padding: '7px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                  color: 'var(--muted)',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                }}
                              >
                                {isExpanded ? 'Cancel' : 'Comment'}
                              </button>
                              <button
                                onClick={() => {
                                  void decide(a.id, 'rejected');
                                }}
                                disabled={dec != null}
                                style={{
                                  padding: '7px 14px',
                                  borderRadius: '6px',
                                  border: '1px solid #ef444440',
                                  background: dec === 'rejecting' ? '#ef444430' : '#ef444415',
                                  color: '#f87171',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  cursor: dec != null ? 'default' : 'pointer',
                                }}
                              >
                                {dec === 'rejecting' ? '…' : 'Reject'}
                              </button>
                              <button
                                onClick={() => {
                                  void decide(a.id, 'approved');
                                }}
                                disabled={dec != null}
                                style={{
                                  padding: '7px 14px',
                                  borderRadius: '6px',
                                  border: '1px solid #22c55e40',
                                  background: dec === 'approving' ? '#22c55e30' : '#22c55e15',
                                  color: '#4ade80',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  cursor: dec != null ? 'default' : 'pointer',
                                }}
                              >
                                {dec === 'approving' ? '…' : 'Approve'}
                              </button>
                            </div>
                          )}
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: '12px' }}>
                            <textarea
                              placeholder="Add a comment (optional)…"
                              value={comment[a.id] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setComment((prev) => ({ ...prev, [a.id]: val }));
                              }}
                              rows={3}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'rgba(255,255,255,0.03)',
                                color: 'var(--fg)',
                                fontSize: '13px',
                                resize: 'vertical',
                                outline: 'none',
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
