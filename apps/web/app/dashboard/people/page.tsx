'use client';

import { useState } from 'react';
import { useAttendance, useMembers } from '../../../lib/api';

function formatDuration(checkIn: string, checkOut: string | null): string {
  if (!checkOut) return 'Active';
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h)}h ${String(m)}m`;
}

export default function PeoplePage() {
  const [attendancePage, setAttendancePage] = useState(1);
  const [membersPage, setMembersPage] = useState(1);
  const [tab, setTab] = useState<'attendance' | 'members'>('attendance');

  const { data: attendanceData, isLoading: attLoading } = useAttendance(attendancePage, 20);
  const { data: membersData, isLoading: membLoading } = useMembers(membersPage, 20);

  const records = attendanceData?.data ?? [];
  const members = membersData?.data ?? [];
  const attTotal = attendanceData?.meta.total ?? 0;
  const membTotal = membersData?.meta.total ?? 0;
  const attPages = Math.max(1, Math.ceil(attTotal / 20));
  const membPages = Math.max(1, Math.ceil(membTotal / 20));

  const tabStyle = (active: boolean) => ({
    padding: '8px 20px',
    borderRadius: '7px',
    border: 'none',
    background: active ? 'var(--mc-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--muted)',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
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
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            People & Attendance
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            {membTotal} members · {attTotal} attendance records
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: 'var(--mc-card)',
            border: '1px solid var(--mc-border)',
            borderRadius: '9px',
            padding: '4px',
            width: 'fit-content',
            marginBottom: '24px',
          }}
        >
          <button
            style={tabStyle(tab === 'attendance')}
            onClick={() => {
              setTab('attendance');
            }}
          >
            Attendance
          </button>
          <button
            style={tabStyle(tab === 'members')}
            onClick={() => {
              setTab('members');
            }}
          >
            Members
          </button>
        </div>

        {tab === 'attendance' && (
          <>
            {attLoading && (
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
            {!attLoading && records.length === 0 && (
              <div
                style={{
                  color: 'var(--muted)',
                  textAlign: 'center',
                  padding: '40px',
                  fontSize: '14px',
                }}
              >
                No attendance records yet. Members check in via WhatsApp.
              </div>
            )}
            {records.length > 0 && (
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
                        {['Member', 'Check In', 'Check Out', 'Duration', 'Source'].map((h) => (
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
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--mc-border)' }}>
                          <td style={{ padding: '10px 16px', color: 'var(--fg)', fontWeight: 500 }}>
                            {r.displayName}
                          </td>
                          <td
                            style={{
                              padding: '10px 16px',
                              color: 'var(--muted)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {new Date(r.checkInAt).toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: '10px 16px',
                              color: 'var(--muted)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {r.checkOutAt ? new Date(r.checkOutAt).toLocaleString() : '—'}
                          </td>
                          <td
                            style={{
                              padding: '10px 16px',
                              color: r.checkOutAt ? 'var(--muted)' : '#22c55e',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatDuration(r.checkInAt, r.checkOutAt)}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: 'var(--mc-bg)',
                                color: 'var(--muted)',
                                border: '1px solid var(--mc-border)',
                                textTransform: 'capitalize',
                              }}
                            >
                              {r.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {attPages > 1 && (
              <div
                style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}
              >
                <button
                  onClick={() => {
                    setAttendancePage((p) => Math.max(1, p - 1));
                  }}
                  disabled={attendancePage === 1}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-card)',
                    color: attendancePage === 1 ? 'var(--muted)' : 'var(--fg)',
                    cursor: attendancePage === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Prev
                </button>
                <span style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--muted)' }}>
                  {attendancePage} / {attPages}
                </span>
                <button
                  onClick={() => {
                    setAttendancePage((p) => Math.min(attPages, p + 1));
                  }}
                  disabled={attendancePage === attPages}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-card)',
                    color: attendancePage === attPages ? 'var(--muted)' : 'var(--fg)',
                    cursor: attendancePage === attPages ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'members' && (
          <>
            {membLoading && (
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
            {!membLoading && members.length === 0 && (
              <div
                style={{
                  color: 'var(--muted)',
                  textAlign: 'center',
                  padding: '40px',
                  fontSize: '14px',
                }}
              >
                No members found.
              </div>
            )}
            {members.length > 0 && (
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
                        {['Name', 'Email', 'WhatsApp', 'Status', 'Joined'].map((h) => (
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
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => {
                        const statusColor =
                          m.status === 'active'
                            ? '#22c55e'
                            : m.status === 'suspended'
                              ? '#f59e0b'
                              : '#ef4444';
                        return (
                          <tr key={m.id} style={{ borderBottom: '1px solid var(--mc-border)' }}>
                            <td
                              style={{ padding: '10px 16px', color: 'var(--fg)', fontWeight: 500 }}
                            >
                              {m.displayName}
                            </td>
                            <td style={{ padding: '10px 16px', color: 'var(--muted)' }}>
                              {m.email ?? '—'}
                            </td>
                            <td
                              style={{
                                padding: '10px 16px',
                                color: 'var(--muted)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {m.whatsappPhone ?? '—'}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  color: statusColor,
                                  border: `1px solid ${statusColor}`,
                                  textTransform: 'capitalize',
                                }}
                              >
                                {m.status}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: '10px 16px',
                                color: 'var(--muted)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {new Date(m.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {membPages > 1 && (
              <div
                style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}
              >
                <button
                  onClick={() => {
                    setMembersPage((p) => Math.max(1, p - 1));
                  }}
                  disabled={membersPage === 1}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-card)',
                    color: membersPage === 1 ? 'var(--muted)' : 'var(--fg)',
                    cursor: membersPage === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Prev
                </button>
                <span style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--muted)' }}>
                  {membersPage} / {membPages}
                </span>
                <button
                  onClick={() => {
                    setMembersPage((p) => Math.min(membPages, p + 1));
                  }}
                  disabled={membersPage === membPages}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-card)',
                    color: membersPage === membPages ? 'var(--muted)' : 'var(--fg)',
                    cursor: membersPage === membPages ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
