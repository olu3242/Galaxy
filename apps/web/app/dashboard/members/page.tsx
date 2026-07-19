'use client';

import { useState } from 'react';
import { useMembers } from '../../../lib/api';

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  suspended: '#ef4444',
  archived: '#64748b',
};

export default function MembersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const limit = 20;

  const { data, isLoading, error } = useMembers(page, limit);
  const members = data?.data ?? [];
  const total = data?.meta.total ?? members.length;
  const totalPages = Math.ceil(total / limit);

  const filtered = search
    ? members.filter(
        (m) =>
          m.displayName.toLowerCase().includes(search.toLowerCase()) ||
          (m.email ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : members;

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
            marginBottom: '32px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
              Members
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '4px 0 0' }}>
              {isLoading ? '…' : `${String(total)} members in this organization`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="search"
              placeholder="Search members…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--card-bg)',
                color: 'var(--fg)',
                fontSize: '14px',
                width: '220px',
                outline: 'none',
              }}
            />
          </div>
        </div>

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
            Failed to load members. The backend may not be running.
          </div>
        )}

        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                {['Name', 'Email', 'Role', 'Status', 'Joined'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} style={{ padding: '14px 16px' }}>
                        <div
                          style={{
                            height: '14px',
                            borderRadius: '4px',
                            background: 'var(--border)',
                            width: `${String(40 + ((i * 13 + j * 17) % 40))}%`,
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: '40px',
                      textAlign: 'center',
                      color: 'var(--muted)',
                      fontSize: '14px',
                    }}
                  >
                    {search ? 'No members match your search.' : 'No members found.'}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr
                    key={m.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: '#6366f122',
                            border: '1px solid #6366f144',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: '#6366f1',
                            flexShrink: 0,
                          }}
                        >
                          {m.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ color: 'var(--fg)', fontSize: '14px', fontWeight: 500 }}>
                          {m.displayName}
                        </span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        color: 'var(--muted)',
                        fontSize: '13px',
                      }}
                    >
                      {m.email ?? '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: '#6366f118',
                          color: '#6366f1',
                        }}
                      >
                        Member
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '13px',
                          color: STATUS_COLOR[m.status] ?? '#64748b',
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: STATUS_COLOR[m.status] ?? '#64748b',
                          }}
                        />
                        {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        color: 'var(--muted)',
                        fontSize: '13px',
                      }}
                    >
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
            }}
          >
            <span style={{ color: 'var(--muted)', fontSize: '13px' }}>
              Page {String(page)} of {String(totalPages)} · {String(total)} total
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                }}
                disabled={page === 1}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg)',
                  color: page === 1 ? 'var(--muted)' : 'var(--fg)',
                  fontSize: '13px',
                  cursor: page === 1 ? 'default' : 'pointer',
                }}
              >
                ← Prev
              </button>
              <button
                onClick={() => {
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
                disabled={page === totalPages}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg)',
                  color: page === totalPages ? 'var(--muted)' : 'var(--fg)',
                  fontSize: '13px',
                  cursor: page === totalPages ? 'default' : 'pointer',
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
