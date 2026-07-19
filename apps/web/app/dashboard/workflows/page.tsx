'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useWorkflowDefinitions,
  useAllApprovals,
  useWorkflowStats,
} from '../../../lib/api';
import type { WorkflowDefinition, ApprovalItem } from '../../../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  paused: '#f59e0b',
  archived: '#94a3b8',
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
  escalated: '#a78bfa',
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Workflow row ──────────────────────────────────────────────────────────────

function WorkflowRow({ wf }: { wf: WorkflowDefinition }) {
  const color = STATUS_COLOR[wf.status] ?? 'var(--muted)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 60px 120px',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--mc-border)',
        fontSize: '13px',
      }}
    >
      <div>
        <div style={{ fontWeight: 600, color: 'var(--fg)' }}>{wf.name}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
          {wf.category} · v{String(wf.version)}
        </div>
      </div>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color,
          border: `1px solid ${color}`,
          borderRadius: '4px',
          padding: '2px 8px',
          textAlign: 'center',
          textTransform: 'capitalize',
        }}
      >
        {wf.status}
      </span>
      <div style={{ color: 'var(--muted)', textAlign: 'right' }}>v{String(wf.version)}</div>
      <div style={{ color: 'var(--muted)', fontSize: '11px', textAlign: 'right' }}>
        {fmtDate(wf.updatedAt)}
      </div>
    </div>
  );
}

// ─── Approval row ─────────────────────────────────────────────────────────────

function ApprovalRow({ ap }: { ap: ApprovalItem }) {
  const color = STATUS_COLOR[ap.status] ?? 'var(--muted)';
  const isOverdue = ap.dueAt != null && new Date(ap.dueAt) < new Date();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 120px',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--mc-border)',
        fontSize: '13px',
      }}
    >
      <div>
        <div style={{ fontWeight: 600, color: 'var(--fg)' }}>
          {ap.workflowName ?? ap.workflowId.slice(0, 16)}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
          Requested by {ap.requestedBy.slice(0, 12)} · {fmtDate(ap.requestedAt)}
        </div>
        {isOverdue && (
          <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px', fontWeight: 600 }}>
            Overdue
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color,
          border: `1px solid ${color}`,
          borderRadius: '4px',
          padding: '2px 8px',
          textAlign: 'center',
          textTransform: 'capitalize',
        }}
      >
        {ap.status}
      </span>
      <div style={{ color: 'var(--muted)', fontSize: '11px', textAlign: 'right' }}>
        {ap.dueAt ? fmtDate(ap.dueAt) : '—'}
      </div>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div
      style={{
        background: 'var(--mc-surface)',
        border: '1px solid var(--card-border)',
        borderTop: `3px solid ${accent}`,
        borderRadius: '10px',
        padding: '14px 18px',
        minWidth: 0,
      }}
    >
      <div
        style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '24px',
          fontWeight: 800,
          color: accent,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'definitions' | 'approvals';

export default function WorkflowsPage() {
  const [tab, setTab] = useState<Tab>('definitions');
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('');

  const { data: wfData, isLoading: wfLoading } = useWorkflowDefinitions(statusFilter || undefined);
  const { data: apData, isLoading: apLoading } = useAllApprovals(approvalStatus || undefined, 1, 50);
  const { data: statsData } = useWorkflowStats();

  const stats = statsData?.data;
  const workflows: WorkflowDefinition[] = wfData?.data ?? [];
  const approvals: ApprovalItem[] = apData?.data ?? [];

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px',
    border: 'none',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: active ? 700 : 400,
    color: active ? '#6366f1' : 'var(--muted)',
  });

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '36px 32px',
        fontFamily: 'var(--font-body, system-ui)',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '22px',
                fontWeight: 800,
                color: 'var(--fg)',
                margin: 0,
                letterSpacing: '-0.3px',
              }}
            >
              Workflow Operations
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
              Manage workflow definitions and approval queues
            </p>
          </div>
          <Link
            href="/dashboard/workflow-builder"
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              textDecoration: 'none',
            }}
          >
            + New Workflow
          </Link>
        </div>

        {/* Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <StatPill label="Active" value={stats?.active ?? '—'} accent="#22c55e" />
          <StatPill label="Pending" value={stats?.pending ?? '—'} accent="#f59e0b" />
          <StatPill label="Completed" value={stats?.completed ?? '—'} accent="#6366f1" />
          <StatPill label="SLA Breaches" value={stats?.slaBreaches ?? '—'} accent={stats && stats.slaBreaches > 0 ? '#ef4444' : '#22c55e'} />
          <StatPill
            label="Auto-Approval"
            value={stats ? `${String(Math.round(stats.autoApprovalRate * 100))}%` : '—'}
            accent="#38bdf8"
          />
        </div>

        {/* Tabs */}
        <div
          style={{
            background: 'var(--mc-surface)',
            border: '1px solid var(--card-border)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--mc-border)',
              padding: '0 8px',
              gap: '4px',
            }}
          >
            <button style={tabStyle(tab === 'definitions')} onClick={() => { setTab('definitions'); }}>
              Definitions ({workflows.length})
            </button>
            <button style={tabStyle(tab === 'approvals')} onClick={() => { setTab('approvals'); }}>
              Approvals ({approvals.length})
            </button>
          </div>

          {/* Filter bar */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--mc-border)',
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            {tab === 'definitions' ? (
              <>
                {(['', 'active', 'paused', 'archived'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); }}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${statusFilter === s ? '#6366f1' : 'var(--mc-border)'}`,
                      background: statusFilter === s ? 'rgba(99,102,241,0.12)' : 'transparent',
                      color: statusFilter === s ? '#818cf8' : 'var(--muted)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {s === '' ? 'All' : s}
                  </button>
                ))}
              </>
            ) : (
              <>
                {(['', 'pending', 'approved', 'rejected', 'escalated'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setApprovalStatus(s); }}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${approvalStatus === s ? '#6366f1' : 'var(--mc-border)'}`,
                      background: approvalStatus === s ? 'rgba(99,102,241,0.12)' : 'transparent',
                      color: approvalStatus === s ? '#818cf8' : 'var(--muted)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {s === '' ? 'All' : s}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Table header */}
          {tab === 'definitions' ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 60px 120px',
                  gap: '12px',
                  padding: '8px 16px',
                  background: 'var(--mc-surface)',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  fontWeight: 700,
                  borderBottom: '1px solid var(--mc-border)',
                }}
              >
                <span>Name</span>
                <span>Status</span>
                <span style={{ textAlign: 'right' }}>Ver</span>
                <span style={{ textAlign: 'right' }}>Updated</span>
              </div>
              {wfLoading && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                  Loading workflows…
                </div>
              )}
              {!wfLoading && workflows.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                  No workflows found.
                </div>
              )}
              {workflows.map((wf) => (
                <WorkflowRow key={wf.id} wf={wf} />
              ))}
            </>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 120px',
                  gap: '12px',
                  padding: '8px 16px',
                  background: 'var(--mc-surface)',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  fontWeight: 700,
                  borderBottom: '1px solid var(--mc-border)',
                }}
              >
                <span>Workflow</span>
                <span>Status</span>
                <span style={{ textAlign: 'right' }}>Due</span>
              </div>
              {apLoading && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                  Loading approvals…
                </div>
              )}
              {!apLoading && approvals.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                  No approvals found.
                </div>
              )}
              {approvals.map((ap) => (
                <ApprovalRow key={ap.id} ap={ap} />
              ))}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
