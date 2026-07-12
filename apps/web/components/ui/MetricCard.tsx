'use client';

export interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  delta?: { value: number; label?: string };
  accent?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

export function MetricCard({
  label,
  value,
  subtext,
  delta,
  accent = 'var(--accent)',
  icon,
  loading = false,
}: MetricCardProps) {
  const deltaPositive = delta && delta.value >= 0;

  return (
    <div className="mc-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="mc-label">{label}</span>
        {icon && <span style={{ color: accent, opacity: 0.8, fontSize: '18px' }}>{icon}</span>}
      </div>

      {loading ? (
        <div className="mc-skeleton" style={{ height: '40px', width: '60%', marginTop: '8px' }} />
      ) : (
        <span className="mc-value" style={{ color: accent }}>
          {value}
        </span>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px' }}>
        {subtext && <span className="mc-subtext">{subtext}</span>}
        {delta && !loading && (
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: deltaPositive ? '#22c55e' : '#ef4444',
            }}
          >
            {deltaPositive ? '▲' : '▼'} {Math.abs(delta.value)}%
            {delta.label && (
              <span style={{ fontWeight: 400, color: 'var(--muted)' }}> {delta.label}</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
