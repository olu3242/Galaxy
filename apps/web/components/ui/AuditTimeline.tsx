'use client';

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  actorType: 'member' | 'agent' | 'system';
  resource: string;
  resourceId?: string;
  status: 'success' | 'denied' | 'error';
  timestamp: string;
  correlationId: string;
}

const STATUS_COLOR = { success: '#22c55e', denied: '#ef4444', error: '#f97316' };
const ACTOR_ICON = { member: '👤', agent: '🤖', system: '⚙️' };

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="mc-card">
      <span className="mc-label" style={{ display: 'block', marginBottom: '12px' }}>
        Audit Timeline
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {entries.length === 0 && (
          <span className="mc-subtext" style={{ padding: '12px 0', textAlign: 'center' }}>
            No audit entries
          </span>
        )}
        {entries.map((e, i) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              gap: '12px',
              padding: '8px 0',
              borderBottom: i < entries.length - 1 ? '1px solid var(--card-border)' : 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: STATUS_COLOR[e.status],
                  marginTop: '4px',
                }}
              />
              {i < entries.length - 1 && (
                <div
                  style={{
                    width: '1px',
                    flex: 1,
                    background: 'var(--card-border)',
                    marginTop: '4px',
                  }}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', color: 'var(--fg)', fontWeight: 500 }}>
                {ACTOR_ICON[e.actorType]} {e.actor}{' '}
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>→</span>{' '}
                <span style={{ color: STATUS_COLOR[e.status] }}>{e.action}</span>{' '}
                <span style={{ color: 'var(--muted)' }}>{e.resource}</span>
                {e.resourceId && (
                  <span style={{ color: 'var(--muted)', fontSize: '11px' }}>
                    {' '}
                    ({e.resourceId.slice(0, 8)}…)
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                {new Date(e.timestamp).toLocaleString()} · {e.correlationId.slice(0, 8)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
