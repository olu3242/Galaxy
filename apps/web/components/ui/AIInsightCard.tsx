'use client';

export type InsightType = 'recommendation' | 'anomaly' | 'forecast' | 'risk' | 'optimization';

export interface AIInsight {
  id: string;
  type: InsightType;
  title: string;
  summary: string;
  confidence: number;
  impactTier?: 1 | 2 | 3 | 4 | 5;
  actions?: { label: string; onClick?: () => void }[];
}

const TYPE_COLOR: Record<InsightType, string> = {
  recommendation: '#6366f1',
  anomaly: '#f97316',
  forecast: '#38bdf8',
  risk: '#ef4444',
  optimization: '#22c55e',
};

const TYPE_ICON: Record<InsightType, string> = {
  recommendation: '💡',
  anomaly: '⚠️',
  forecast: '📈',
  risk: '🛡',
  optimization: '⚡',
};

export function AIInsightCard({ insight }: { insight: AIInsight }) {
  const color = TYPE_COLOR[insight.type];

  return (
    <div className="mc-card" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '18px', flexShrink: 0 }}>{TYPE_ICON[insight.type]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
              {insight.title}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color,
                flexShrink: 0,
                padding: '2px 6px',
                background: color + '18',
                borderRadius: '4px',
                border: `1px solid ${color}33`,
              }}
            >
              {insight.confidence}% confidence
            </span>
          </div>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--muted)',
              margin: '4px 0 0',
              lineHeight: 1.5,
            }}
          >
            {insight.summary}
          </p>
          {insight.actions && insight.actions.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              {insight.actions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${color}55`,
                    background: color + '15',
                    color,
                    cursor: 'pointer',
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
