'use client';

import { useState } from 'react';
import {
  useWorkflowStats,
  useSecurityMetrics,
  useComplianceReports,
  useApiClient,
  useOrganizationId,
} from '../../../lib/api';
import type { ComplianceReport } from '../../../lib/api';
import { useAuth } from '../../../lib/auth/context';

function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{label}</span>
        <span style={{ fontSize: '12px', color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
          {String(value)}
        </span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', background: 'var(--mc-border)' }}>
        <div
          style={{
            height: '100%',
            borderRadius: '3px',
            background: color,
            width: `${String(pct)}%`,
            transition: 'width 0.5s',
          }}
        />
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: ComplianceReport }) {
  return (
    <div
      style={{
        background: 'var(--mc-card)',
        border: '1px solid var(--mc-border)',
        borderRadius: '10px',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>
            Compliance Report
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            {new Date(report.periodStart).toLocaleDateString()} —{' '}
            {new Date(report.periodEnd).toLocaleDateString()}
          </div>
        </div>
        <span
          style={{
            fontSize: '10px',
            background: 'rgba(99,102,241,0.15)',
            color: '#818cf8',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '4px',
            padding: '2px 8px',
            fontWeight: 600,
          }}
        >
          Generated
        </span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
        By {report.generatedBy} · {new Date(report.createdAt).toLocaleDateString()}
      </div>
      {Object.keys(report.summary).length > 0 && (
        <div style={{ marginTop: '4px' }}>
          {Object.entries(report.summary)
            .slice(0, 3)
            .map(([k, v]) => (
              <div
                key={k}
                style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', gap: '8px' }}
              >
                <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{k}:</span>
                <span>{String(v)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const { data: wfStats } = useWorkflowStats();
  const { data: secData } = useSecurityMetrics();
  const { data: reportsData, mutate } = useComplianceReports(10);

  const wf = wfStats?.data;
  const sec = secData?.data;
  const reports = reportsData?.data ?? [];

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !user?.id || !periodStart || !periodEnd) return;
    setGenerating(true);
    setGenError(null);
    try {
      await client.post('/api/v1/governance/reports', {
        body: {
          organizationId: orgId,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
          generatedBy: user.id,
        },
      });
      setSuccessMsg('Report generated successfully.');
      setPeriodStart('');
      setPeriodEnd('');
      void mutate();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 4000);
    } catch {
      setGenError('Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const totalWf = (wf?.active ?? 0) + (wf?.pending ?? 0) + (wf?.completed ?? 0);

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
            Analytics & Reports
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Workflow performance · security posture · compliance history
          </p>
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '28px',
          }}
        >
          {/* Workflow Stats */}
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
                marginBottom: '16px',
              }}
            >
              Workflow Performance
            </div>
            {wf ? (
              <>
                <StatBar label="Active" value={wf.active} max={totalWf || 1} color="#38bdf8" />
                <StatBar label="Pending" value={wf.pending} max={totalWf || 1} color="#f59e0b" />
                <StatBar
                  label="Completed"
                  value={wf.completed}
                  max={totalWf || 1}
                  color="#22c55e"
                />
                <StatBar
                  label="SLA Breaches"
                  value={wf.slaBreaches}
                  max={Math.max(wf.slaBreaches, 10)}
                  color="#ef4444"
                />
                <div
                  style={{
                    display: 'flex',
                    gap: '20px',
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--mc-border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Avg Duration</div>
                    <div
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: 'var(--fg)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {String(wf.avgDurationHours)}h
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Auto-approval Rate
                    </div>
                    <div
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: '#22c55e',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {String(wf.autoApprovalRate)}%
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>
            )}
          </div>

          {/* Security Posture */}
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
                marginBottom: '16px',
              }}
            >
              Security Posture
            </div>
            {sec ? (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  {[
                    { label: 'Access Denials (30d)', value: sec.accessDenials, color: '#ef4444' },
                    { label: 'Active Policies', value: sec.activePolicies, color: '#22c55e' },
                    { label: 'Active Delegations', value: sec.activeDelegations, color: '#38bdf8' },
                    { label: 'Dormant Accounts', value: sec.dormantAccounts, color: '#f59e0b' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        background: 'var(--mc-bg)',
                        border: '1px solid var(--mc-border)',
                        borderRadius: '8px',
                        padding: '12px',
                      }}
                    >
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 700,
                          color: item.color,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {String(item.value)}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: 'var(--mc-bg)',
                    borderRadius: '8px',
                    border: '1px solid var(--mc-border)',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                      Compliance Score
                    </div>
                    <div
                      style={{ height: '8px', borderRadius: '4px', background: 'var(--mc-border)' }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '4px',
                          background:
                            sec.complianceScore >= 80
                              ? '#22c55e'
                              : sec.complianceScore >= 60
                                ? '#f59e0b'
                                : '#ef4444',
                          width: `${String(sec.complianceScore)}%`,
                          transition: 'width 0.5s',
                        }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '20px',
                      fontWeight: 800,
                      color: sec.complianceScore >= 80 ? '#22c55e' : '#f59e0b',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {String(sec.complianceScore)}%
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>
            )}
          </div>
        </div>

        {/* Generate Report */}
        <div
          style={{
            background: 'var(--mc-card)',
            border: '1px solid var(--mc-border)',
            borderRadius: '10px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '14px' }}
          >
            Generate Compliance Report
          </div>
          <form
            onSubmit={(e) => {
              void handleGenerate(e);
            }}
            style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Period Start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                }}
                required
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Period End</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                }}
                required
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
            <button
              type="submit"
              disabled={generating}
              style={{
                padding: '8px 20px',
                borderRadius: '7px',
                border: 'none',
                background: 'var(--mc-accent)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: generating ? 'not-allowed' : 'pointer',
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? 'Generating…' : 'Generate'}
            </button>
            {genError && <div style={{ fontSize: '12px', color: '#ef4444' }}>{genError}</div>}
          </form>
        </div>

        {/* Report History */}
        <div>
          <div
            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '12px' }}
          >
            Report History
          </div>
          {reports.length === 0 && (
            <div
              style={{
                color: 'var(--muted)',
                fontSize: '13px',
                textAlign: 'center',
                padding: '32px',
              }}
            >
              No reports generated yet.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
