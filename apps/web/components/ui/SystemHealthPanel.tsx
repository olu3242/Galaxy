'use client';

export interface SystemService {
  name: string;
  status: 'operational' | 'degraded' | 'outage' | 'maintenance';
  latencyMs?: number;
  uptimePct?: number;
}

const STATUS_COLOR = {
  operational: '#22c55e',
  degraded: '#f59e0b',
  outage: '#ef4444',
  maintenance: '#6366f1',
};

const STATUS_DOT = {
  operational: '●',
  degraded: '◐',
  outage: '○',
  maintenance: '◑',
};

export function SystemHealthPanel({ services }: { services: SystemService[] }) {
  const allOk = services.every((s) => s.status === 'operational');
  const anyDown = services.some((s) => s.status === 'outage');
  const overallColor = anyDown ? '#ef4444' : allOk ? '#22c55e' : '#f59e0b';
  const overallLabel = anyDown
    ? 'Partial Outage'
    : allOk
      ? 'All Systems Operational'
      : 'Degraded Performance';

  return (
    <div className="mc-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <span className="mc-label">System Health</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: overallColor }}>
          {overallLabel}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {services.map((s) => (
          <div
            key={s.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '13px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ color: STATUS_COLOR[s.status], fontSize: '10px' }}>
                {STATUS_DOT[s.status]}
              </span>
              <span style={{ color: 'var(--fg)' }}>{s.name}</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', color: 'var(--muted)', fontSize: '12px' }}>
              {s.latencyMs !== undefined && <span>{s.latencyMs}ms</span>}
              {s.uptimePct !== undefined && (
                <span style={{ color: s.uptimePct >= 99 ? '#22c55e' : '#f59e0b' }}>
                  {s.uptimePct}% uptime
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
