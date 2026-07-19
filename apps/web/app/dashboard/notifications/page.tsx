'use client';

import { useAlerts, useSystemHealth, useQueueStats, useAuditEvents } from '../../../lib/api';

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#6366f1',
  info: '#38bdf8',
  warn: '#f59e0b',
  error: '#ef4444',
};

const SERVICE_STATUS_COLOR: Record<string, string> = {
  operational: '#22c55e',
  degraded: '#f59e0b',
  down: '#ef4444',
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${String(mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${String(hrs)}h ago`;
  return `${String(Math.floor(hrs / 24))}d ago`;
}

export default function NotificationsPage() {
  const { data: alertsData, isLoading: alertsLoading } = useAlerts(20);
  const { data: healthData, isLoading: healthLoading } = useSystemHealth();
  const { data: queuesData } = useQueueStats();
  const { data: auditData } = useAuditEvents(10);

  const alerts = alertsData?.data ?? [];
  const services = healthData?.data.services ?? [];
  const queues = queuesData?.data ?? [];
  const auditEvents = auditData?.data ?? [];

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' || a.severity === 'high');

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
            Notifications & Platform Health
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            {alertsLoading
              ? '…'
              : `${String(alerts.length)} alerts · ${String(criticalAlerts.length)} critical`}
          </p>
        </div>

        {criticalAlerts.length > 0 && (
          <div
            style={{
              background: '#ef444418',
              border: '1px solid #ef444440',
              borderRadius: '10px',
              padding: '14px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '18px' }}>🔴</div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f87171' }}>
                {String(criticalAlerts.length)} critical alert
                {criticalAlerts.length !== 1 ? 's' : ''} require attention
              </div>
              <div style={{ fontSize: '12px', color: '#f87171', opacity: 0.8, marginTop: '2px' }}>
                {criticalAlerts
                  .slice(0, 2)
                  .map((a) => a.name)
                  .join(' · ')}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '24px',
          }}
        >
          {/* Service Health */}
          <div
            style={{
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '10px',
              padding: '20px',
            }}
          >
            <div
              style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '4px' }}
            >
              Service Health
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '14px' }}>
              Overall:{' '}
              <span
                style={{
                  color: healthData?.data.overall === 'healthy' ? '#22c55e' : '#f59e0b',
                  fontWeight: 600,
                }}
              >
                {healthLoading ? '…' : (healthData?.data.overall ?? 'unknown')}
              </span>
            </div>
            {services.map((svc) => {
              const color = SERVICE_STATUS_COLOR[svc.status] ?? 'var(--muted)';
              return (
                <div
                  key={svc.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--mc-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '13px', color: 'var(--fg)' }}>{svc.name}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      fontSize: '12px',
                      color: 'var(--muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {svc.latencyMs !== undefined && <span>{String(svc.latencyMs)}ms</span>}
                    {svc.uptimePct !== undefined && <span>{String(svc.uptimePct)}% uptime</span>}
                    <span style={{ color }}>{svc.status}</span>
                  </div>
                </div>
              );
            })}
            {services.length === 0 && !healthLoading && (
              <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
                No service data available.
              </div>
            )}
          </div>

          {/* Queue Health */}
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
                marginBottom: '14px',
              }}
            >
              Queue Health
            </div>
            {queues.map((q) => {
              const total = q.pending + q.active + q.completed + q.failed + (q.delayed ?? 0);
              const failRate = total > 0 ? Math.round((q.failed / total) * 100) : 0;
              return (
                <div key={q.name} style={{ marginBottom: '14px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--fg)', fontWeight: 500 }}>
                      {q.name}
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        fontSize: '11px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <span style={{ color: '#38bdf8' }}>{String(q.active)} active</span>
                      <span style={{ color: '#f59e0b' }}>{String(q.pending)} pending</span>
                      {q.failed > 0 && (
                        <span style={{ color: '#ef4444' }}>{String(q.failed)} failed</span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      height: '4px',
                      borderRadius: '2px',
                      background: 'var(--mc-border)',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', height: '100%' }}>
                      <div
                        style={{
                          width:
                            total > 0
                              ? `${String(Math.round((q.completed / total) * 100))}%`
                              : '0%',
                          background: '#22c55e',
                        }}
                      />
                      <div
                        style={{
                          width:
                            total > 0 ? `${String(Math.round((q.active / total) * 100))}%` : '0%',
                          background: '#38bdf8',
                        }}
                      />
                      <div
                        style={{
                          width:
                            total > 0 ? `${String(Math.round((q.pending / total) * 100))}%` : '0%',
                          background: '#f59e0b',
                        }}
                      />
                      <div style={{ width: `${String(failRate)}%`, background: '#ef4444' }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {queues.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
                No queue data available.
              </div>
            )}
          </div>
        </div>

        {/* Alerts */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '12px' }}
          >
            Recent Alerts
          </div>
          {alertsLoading && <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>}
          {!alertsLoading && alerts.length === 0 && (
            <div
              style={{
                background: 'var(--mc-card)',
                border: '1px solid var(--mc-border)',
                borderRadius: '10px',
                padding: '32px',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: '13px',
              }}
            >
              No alerts. All systems operating normally.
            </div>
          )}
          {alerts.length > 0 && (
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
                      {['Alert', 'Severity', 'Fired'].map((h) => (
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
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a) => {
                      const color = SEVERITY_COLOR[a.severity] ?? 'var(--muted)';
                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--mc-border)' }}>
                          <td style={{ padding: '10px 16px', color: 'var(--fg)', fontWeight: 500 }}>
                            {a.name}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                color,
                                border: `1px solid ${color}`,
                                borderRadius: '4px',
                                padding: '2px 7px',
                                textTransform: 'capitalize',
                              }}
                            >
                              {a.severity}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: '10px 16px',
                              color: 'var(--muted)',
                              fontSize: '12px',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {timeAgo(a.firedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Recent Audit Events */}
        <div>
          <div
            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '12px' }}
          >
            Recent Audit Events
          </div>
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
                    {['Action', 'Actor', 'Resource', 'Severity', 'When'].map((h) => (
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
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)' }}
                      >
                        No audit events.
                      </td>
                    </tr>
                  )}
                  {auditEvents.map((e) => {
                    const color = SEVERITY_COLOR[e.severity] ?? 'var(--muted)';
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid var(--mc-border)' }}>
                        <td style={{ padding: '10px 16px', color: 'var(--fg)', fontWeight: 500 }}>
                          {e.action}
                        </td>
                        <td
                          style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: '12px' }}
                        >
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--mc-bg)',
                              border: '1px solid var(--mc-border)',
                              marginRight: '6px',
                              textTransform: 'capitalize',
                            }}
                          >
                            {e.actorType}
                          </span>
                          <span style={{ fontFamily: 'monospace' }}>{e.actorId.slice(0, 8)}…</span>
                        </td>
                        <td
                          style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: '12px' }}
                        >
                          {e.resourceType}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              color,
                              border: `1px solid ${color}`,
                              borderRadius: '4px',
                              padding: '2px 7px',
                            }}
                          >
                            {e.severity}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: '10px 16px',
                            color: 'var(--muted)',
                            fontSize: '12px',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {timeAgo(e.timestamp)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
