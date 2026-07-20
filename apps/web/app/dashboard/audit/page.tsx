'use client';

import { useState } from 'react';
import { useAuditEvents } from '../../../lib/api';
import type { AuditEvent } from '../../../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

const SEVERITY_COLOR: Record<string, string> = {
  info: '#38bdf8',
  warn: '#f59e0b',
  error: '#ef4444',
};

const ACTOR_ICON: Record<string, string> = {
  member: '👤',
  agent: '🤖',
  system: '⚙️',
};

// ─── Audit Entry ──────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);
  const color = SEVERITY_COLOR[entry.severity] ?? '#94a3b8';
  const icon = ACTOR_ICON[entry.actorType] ?? '?';
  const hasMeta = entry.metadata != null && Object.keys(entry.metadata).length > 0;

  return (
    <div
      style={{
        borderBottom: '1px solid var(--mc-border)',
        padding: '12px 16px',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '150px 1fr 100px 120px 24px',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
        }}
      >
        {/* Timestamp */}
        <div
          style={{ color: 'var(--muted)', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}
        >
          {fmtDate(entry.timestamp)}
        </div>

        {/* Actor + Action + Resource */}
        <div>
          <span style={{ marginRight: '6px' }}>{icon}</span>
          <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{entry.action}</span>
          <span style={{ color: 'var(--muted)', marginLeft: '6px' }}>
            {entry.resourceType}:{entry.resourceId.slice(0, 8)}
          </span>
        </div>

        {/* Resource type */}
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#6366f1',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '4px',
            padding: '2px 6px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.resourceType}
        </span>

        {/* Severity */}
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color,
            border: `1px solid ${color}`,
            borderRadius: '4px',
            padding: '2px 6px',
            textAlign: 'center',
            textTransform: 'capitalize',
          }}
        >
          {entry.severity}
        </span>

        {/* Expand button */}
        {hasMeta ? (
          <button
            onClick={() => {
              setExpanded(!expanded);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted)',
              fontSize: '14px',
              lineHeight: 1,
              padding: 0,
            }}
            aria-label={expanded ? 'Collapse metadata' : 'Expand metadata'}
          >
            {expanded ? '▲' : '▼'}
          </button>
        ) : (
          <div />
        )}
      </div>

      {/* Metadata */}
      {expanded && hasMeta && (
        <pre
          style={{
            marginTop: '10px',
            marginLeft: '162px',
            padding: '10px 14px',
            background: 'var(--mc-surface)',
            border: '1px solid var(--mc-border)',
            borderRadius: '6px',
            fontSize: '11px',
            color: 'var(--muted)',
            overflow: 'auto',
            maxHeight: '200px',
          }}
        >
          {JSON.stringify(entry.metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ACTOR_TYPES = ['', 'member', 'agent', 'system'] as const;
const SEVERITY_TYPES = ['', 'info', 'warn', 'error'] as const;
const RESOURCE_TYPES = [
  '',
  'workflow',
  'approval',
  'member',
  'agent',
  'loop',
  'knowledge',
  'broadcast',
] as const;

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [actorFilter, setActorFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const limit = 50;

  const { data, isLoading } = useAuditEvents(limit);
  const allEntries: AuditEvent[] = data?.data ?? [];

  // Client-side filtering
  const filtered = allEntries.filter((e) => {
    if (actorFilter && e.actorType !== actorFilter) return false;
    if (severityFilter && e.severity !== severityFilter) return false;
    if (resourceFilter && !e.resourceType.toLowerCase().includes(resourceFilter.toLowerCase()))
      return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / 20);
  const paged = filtered.slice((page - 1) * 20, page * 20);

  function FilterChips({
    options,
    value,
    onChange,
    label,
  }: {
    options: readonly string[];
    value: string;
    onChange: (v: string) => void;
    label: string;
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span
          style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, marginRight: '2px' }}
        >
          {label}:
        </span>
        {options.map((o) => (
          <button
            key={o}
            onClick={() => {
              onChange(o);
            }}
            style={{
              padding: '3px 10px',
              borderRadius: '6px',
              border: `1px solid ${value === o ? '#6366f1' : 'var(--mc-border)'}`,
              background: value === o ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: value === o ? '#818cf8' : 'var(--muted)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {o === '' ? 'All' : o}
          </button>
        ))}
      </div>
    );
  }

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
        <div style={{ marginBottom: '24px' }}>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--fg)',
              margin: 0,
              letterSpacing: '-0.3px',
            }}
          >
            Audit Log
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Immutable record of all organization events — most recent first
          </p>
        </div>

        {/* Filters */}
        <div
          style={{
            background: 'var(--mc-surface)',
            border: '1px solid var(--card-border)',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <FilterChips
            options={ACTOR_TYPES}
            value={actorFilter}
            onChange={(v) => {
              setActorFilter(v);
              setPage(1);
            }}
            label="Actor"
          />
          <FilterChips
            options={SEVERITY_TYPES}
            value={severityFilter}
            onChange={(v) => {
              setSeverityFilter(v);
              setPage(1);
            }}
            label="Severity"
          />
          <FilterChips
            options={RESOURCE_TYPES}
            value={resourceFilter}
            onChange={(v) => {
              setResourceFilter(v);
              setPage(1);
            }}
            label="Resource"
          />
        </div>

        {/* Table */}
        <div
          style={{
            background: 'var(--mc-surface)',
            border: '1px solid var(--card-border)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '150px 1fr 100px 120px 24px',
              gap: '12px',
              padding: '10px 16px',
              background: 'var(--mc-surface)',
              fontSize: '11px',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              fontWeight: 700,
              borderBottom: '1px solid var(--mc-border)',
            }}
          >
            <span>Timestamp</span>
            <span>Actor · Action · Resource</span>
            <span>Type</span>
            <span>Severity</span>
            <span />
          </div>

          {isLoading && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
              Loading audit log…
            </div>
          )}
          {!isLoading && paged.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
              No entries match your filters.
            </div>
          )}
          {paged.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '12px',
              marginTop: '16px',
              fontSize: '13px',
              color: 'var(--muted)',
            }}
          >
            <button
              onClick={() => {
                setPage(Math.max(1, page - 1));
              }}
              disabled={page <= 1}
              style={{
                padding: '6px 14px',
                border: '1px solid var(--mc-border)',
                borderRadius: '6px',
                background: 'transparent',
                color: page <= 1 ? 'var(--muted)' : 'var(--fg)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              ← Prev
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => {
                setPage(Math.min(totalPages, page + 1));
              }}
              disabled={page >= totalPages}
              style={{
                padding: '6px 14px',
                border: '1px solid var(--mc-border)',
                borderRadius: '6px',
                background: 'transparent',
                color: page >= totalPages ? 'var(--muted)' : 'var(--fg)',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
