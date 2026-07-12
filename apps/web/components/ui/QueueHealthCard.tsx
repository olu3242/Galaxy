'use client';

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

function pct(n: number, total: number) {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}

export function QueueHealthCard({ queue }: { queue: QueueStats }) {
  const total = queue.waiting + queue.active + queue.completed + queue.failed;
  const health = total === 0 ? 100 : pct(queue.completed, total);
  const healthColor = health >= 90 ? '#22c55e' : health >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="mc-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mc-label">{queue.name}</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: healthColor }}>
          {health}% healthy
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '8px',
          textAlign: 'center',
        }}
      >
        {[
          { label: 'Waiting', value: queue.waiting, color: '#6366f1' },
          { label: 'Active', value: queue.active, color: '#f59e0b' },
          { label: 'Done', value: queue.completed, color: '#22c55e' },
          { label: 'Failed', value: queue.failed, color: '#ef4444' },
          { label: 'Delayed', value: queue.delayed, color: '#94a3b8' },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ height: '4px', background: 'var(--card-border)', borderRadius: '2px' }}>
        <div
          style={{
            height: '100%',
            width: `${health}%`,
            background: healthColor,
            borderRadius: '2px',
            transition: 'width 0.5s ease',
          }}
        />
      </div>
    </div>
  );
}
