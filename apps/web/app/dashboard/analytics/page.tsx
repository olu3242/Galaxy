'use client';

import { useState } from 'react';
import {
  useKpiDefinitions,
  useKpiTimeseries,
  useApiClient,
  useOrganizationId,
} from '../../../lib/api';
import type { KpiDefinition, MetricDataPoint } from '../../../lib/api';

const TREND_ICON: Record<string, string> = { up: '↑', down: '↓', flat: '→' };
const TREND_COLOR: Record<string, string> = { up: '#22c55e', down: '#ef4444', flat: '#f59e0b' };

function Sparkline({ data, color = '#6366f1' }: { data: MetricDataPoint[]; color?: string }) {
  if (data.length < 2)
    return (
      <div
        style={{
          height: '48px',
          color: 'var(--muted)',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        Insufficient data
      </div>
    );
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 200;
  const H = 48;
  const pts = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((d.value - min) / range) * (H - 8) - 4;
      return `${String(x)},${String(y)}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={pts.split(' ').at(-1)?.split(',')[0] ?? '0'}
        cy={pts.split(' ').at(-1)?.split(',')[1] ?? '0'}
        r="3"
        fill={color}
      />
    </svg>
  );
}

function KpiCard({
  kpi,
  selected,
  onSelect,
}: {
  kpi: KpiDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const trend = kpi.trend ?? 'flat';
  const trendColor = TREND_COLOR[trend];
  const trendIcon = TREND_ICON[trend];
  const pct =
    kpi.target && kpi.current != null ? Math.min(100, (kpi.current / kpi.target) * 100) : null;

  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        background: selected ? 'rgba(99,102,241,0.1)' : 'var(--mc-card)',
        border: selected ? '2px solid #6366f1' : '1px solid var(--mc-border)',
        borderRadius: '10px',
        padding: '16px',
        cursor: 'pointer',
        color: 'var(--fg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '8px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)' }}>{kpi.name}</div>
        <span style={{ fontSize: '12px', color: trendColor, fontWeight: 700 }}>{trendIcon}</span>
      </div>
      {kpi.current != null && (
        <div
          style={{
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--fg)',
            fontVariantNumeric: 'tabular-nums',
            marginBottom: '4px',
          }}
        >
          {String(kpi.current)}
          {kpi.unit ? (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 400,
                color: 'var(--muted)',
                marginLeft: '2px',
              }}
            >
              {kpi.unit}
            </span>
          ) : null}
        </div>
      )}
      {pct !== null && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
              vs target {String(kpi.target)}
              {kpi.unit ?? ''}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: pct >= 100 ? '#22c55e' : 'var(--muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(Math.round(pct))}%
            </span>
          </div>
          <div style={{ height: '4px', borderRadius: '2px', background: 'var(--mc-border)' }}>
            <div
              style={{
                height: '100%',
                borderRadius: '2px',
                background: pct >= 100 ? '#22c55e' : '#6366f1',
                width: `${String(Math.min(100, pct))}%`,
                transition: 'width 0.4s',
              }}
            />
          </div>
        </div>
      )}
      {kpi.description && (
        <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px', lineHeight: 1.4 }}>
          {kpi.description}
        </div>
      )}
    </button>
  );
}

function TimeseriesPanel({
  kpi,
  days,
  onDaysChange,
}: {
  kpi: KpiDefinition;
  days: number;
  onDaysChange: (d: number) => void;
}) {
  const { data, isLoading } = useKpiTimeseries(kpi.id, days);
  const points = data?.data ?? [];

  return (
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
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '16px',
        }}
      >
        <div>
          <div
            style={{ fontSize: '15px', fontWeight: 800, color: 'var(--fg)', marginBottom: '2px' }}
          >
            {kpi.name}
          </div>
          {kpi.description && (
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{kpi.description}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => {
                onDaysChange(d);
              }}
              style={{
                padding: '3px 9px',
                borderRadius: '5px',
                border: `1px solid ${days === d ? '#6366f1' : 'var(--mc-border)'}`,
                background: days === d ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: days === d ? '#818cf8' : 'var(--muted)',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {String(d)}d
            </button>
          ))}
        </div>
      </div>

      {kpi.current != null && (
        <div
          style={{
            display: 'flex',
            gap: '24px',
            marginBottom: '20px',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--mc-border)',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '2px' }}>
              Current
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: 'var(--fg)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(kpi.current)}
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 400,
                  color: 'var(--muted)',
                  marginLeft: '3px',
                }}
              >
                {kpi.unit ?? ''}
              </span>
            </div>
          </div>
          {kpi.target != null && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '2px' }}>
                Target
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: 'var(--muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(kpi.target)}
                <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '3px' }}>
                  {kpi.unit ?? ''}
                </span>
              </div>
            </div>
          )}
          {kpi.trend && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '2px' }}>
                Trend
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: TREND_COLOR[kpi.trend] }}>
                {TREND_ICON[kpi.trend]}
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div
          style={{
            color: 'var(--muted)',
            fontSize: '13px',
            padding: '32px 0',
            textAlign: 'center',
          }}
        >
          Loading timeseries…
        </div>
      ) : points.length > 0 ? (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
            Last {String(days)} days
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: '400px' }}>
              <Sparkline data={points} color="#6366f1" />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                  {points[0] ? new Date(points[0].timestamp).toLocaleDateString() : ''}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                  {(() => {
                    const last = points.at(-1);
                    return last ? new Date(last.timestamp).toLocaleDateString() : '';
                  })()}
                </span>
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginTop: '16px',
            }}
          >
            {[
              { label: 'Min', value: Math.min(...points.map((p) => p.value)) },
              {
                label: 'Avg',
                value: Math.round(points.reduce((s, p) => s + p.value, 0) / points.length),
              },
              { label: 'Max', value: Math.max(...points.map((p) => p.value)) },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: 'var(--mc-bg)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '2px' }}>
                  {stat.label}
                </div>
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--fg)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {String(stat.value)}
                  {kpi.unit ?? ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            color: 'var(--muted)',
            fontSize: '13px',
            textAlign: 'center',
            padding: '32px 0',
          }}
        >
          No timeseries data for this period.
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const { data, isLoading, mutate } = useKpiDefinitions();
  const [selectedKpi, setSelectedKpi] = useState<KpiDefinition | null>(null);
  const [days, setDays] = useState(30);

  const [showCreate, setShowCreate] = useState(false);
  const [kpiName, setKpiName] = useState('');
  const [kpiDesc, setKpiDesc] = useState('');
  const [kpiFormula, setKpiFormula] = useState('');
  const [kpiUnit, setKpiUnit] = useState('');
  const [kpiTarget, setKpiTarget] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const kpis = data?.data ?? [];
  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgId || !kpiName.trim() || !kpiFormula.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await client.post('/api/v1/analytics/kpis', {
        body: {
          organizationId: orgId,
          name: kpiName.trim(),
          description: kpiDesc || undefined,
          formula: kpiFormula.trim(),
          unit: kpiUnit || undefined,
          target: kpiTarget ? Number(kpiTarget) : undefined,
        },
      });
      flash('KPI created.');
      setKpiName('');
      setKpiDesc('');
      setKpiFormula('');
      setKpiUnit('');
      setKpiTarget('');
      setShowCreate(false);
      void mutate();
    } catch {
      setCreateError('Failed to create KPI.');
    } finally {
      setCreating(false);
    }
  };

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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
              Analytics
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
              {kpis.length} KPIs · custom metrics, timeseries, and trend tracking
            </p>
          </div>
          <button
            onClick={() => {
              setShowCreate((v) => !v);
            }}
            style={{
              fontSize: '13px',
              fontWeight: 600,
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--mc-accent)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {showCreate ? 'Cancel' : '+ New KPI'}
          </button>
        </div>

        {successMsg && (
          <div
            style={{
              background: '#22c55e22',
              border: '1px solid #22c55e',
              color: '#22c55e',
              borderRadius: '8px',
              padding: '10px 16px',
              marginBottom: '16px',
              fontSize: '13px',
            }}
          >
            {successMsg}
          </div>
        )}

        {showCreate && (
          <div
            style={{
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '10px',
              padding: '20px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--fg)',
                marginBottom: '12px',
              }}
            >
              Define KPI
            </div>
            <form
              onSubmit={(e) => {
                void handleCreate(e);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="KPI name *"
                  value={kpiName}
                  required
                  onChange={(e) => {
                    setKpiName(e.target.value);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={kpiDesc}
                  onChange={(e) => {
                    setKpiDesc(e.target.value);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
              </div>
              <input
                type="text"
                placeholder="Formula * (e.g. completed_workflows / total_workflows * 100)"
                value={kpiFormula}
                required
                onChange={(e) => {
                  setKpiFormula(e.target.value);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--mc-border)',
                  background: 'var(--mc-bg)',
                  color: 'var(--fg)',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Unit (e.g. %, hours, count)"
                  value={kpiUnit}
                  onChange={(e) => {
                    setKpiUnit(e.target.value);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
                <input
                  type="number"
                  placeholder="Target value (optional)"
                  value={kpiTarget}
                  onChange={(e) => {
                    setKpiTarget(e.target.value);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
              </div>
              {createError && (
                <div style={{ color: '#ef4444', fontSize: '12px' }}>{createError}</div>
              )}
              <button
                type="submit"
                disabled={creating}
                style={{
                  alignSelf: 'flex-end',
                  padding: '8px 20px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'var(--mc-accent)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.7 : 1,
                }}
              >
                {creating ? 'Creating…' : 'Create KPI'}
              </button>
            </form>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px' }}>
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '10px',
              }}
            >
              KPIs
            </div>
            {isLoading ? (
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '13px',
                  textAlign: 'center',
                  padding: '32px',
                }}
              >
                Loading…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {kpis.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    kpi={kpi}
                    selected={selectedKpi?.id === kpi.id}
                    onSelect={() => {
                      setSelectedKpi(kpi);
                    }}
                  />
                ))}
                {kpis.length === 0 && (
                  <div
                    style={{
                      color: 'var(--muted)',
                      fontSize: '13px',
                      textAlign: 'center',
                      padding: '32px',
                      background: 'var(--mc-card)',
                      border: '1px solid var(--mc-border)',
                      borderRadius: '10px',
                    }}
                  >
                    No KPIs defined yet.
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            {selectedKpi ? (
              <TimeseriesPanel kpi={selectedKpi} days={days} onDaysChange={setDays} />
            ) : (
              <div
                style={{
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '10px',
                  padding: '48px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: '13px',
                }}
              >
                Select a KPI to view timeseries and details.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
