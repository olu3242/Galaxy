'use client';

import { useBillingPlans, useSubscription, useInvoices, useOrganizationId } from '../../../lib/api';
import type { BillingPlan, Subscription } from '../../../lib/api';

function PlanCard({
  plan,
  current,
  onSelect,
}: {
  plan: BillingPlan;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      style={{
        background: current ? 'rgba(99,102,241,0.08)' : 'var(--mc-card)',
        border: current ? '2px solid #6366f1' : '1px solid var(--mc-border)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        position: 'relative',
      }}
    >
      {current && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            fontSize: '10px',
            background: '#6366f1',
            color: '#fff',
            borderRadius: '4px',
            padding: '2px 8px',
            fontWeight: 700,
          }}
        >
          CURRENT
        </div>
      )}
      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--fg)' }}>{plan.name}</div>
      <div
        style={{
          fontSize: '24px',
          fontWeight: 800,
          color: current ? '#818cf8' : 'var(--fg)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        ${String(plan.priceMonthly)}
        <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--muted)' }}>/mo</span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5 }}>
        {plan.description}
      </div>
      <ul
        style={{
          margin: 0,
          padding: '0 0 0 16px',
          fontSize: '11px',
          color: 'var(--muted)',
          lineHeight: 1.7,
        }}
      >
        {(plan.features ?? []).map((f) => (
          <li key={f} style={{ color: 'var(--fg)' }}>
            {f}
          </li>
        ))}
      </ul>
      {!current && (
        <button
          onClick={onSelect}
          style={{
            marginTop: '4px',
            padding: '8px',
            borderRadius: '7px',
            border: 'none',
            background: 'var(--mc-accent)',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Upgrade
        </button>
      )}
    </div>
  );
}

function SubscriptionStatus({ sub }: { sub: Subscription }) {
  const statusColor =
    sub.status === 'active' ? '#22c55e' : sub.status === 'past_due' ? '#ef4444' : '#f59e0b';
  return (
    <div
      style={{
        background: 'var(--mc-card)',
        border: '1px solid var(--mc-border)',
        borderRadius: '10px',
        padding: '20px',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '14px' }}>
        Current Subscription
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Status', value: sub.status, color: statusColor },
          { label: 'Plan', value: sub.planId, color: 'var(--fg)' },
          { label: 'Seats', value: String(sub.seats), color: 'var(--fg)' },
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
                fontSize: '14px',
                fontWeight: 700,
                color: item.color,
                textTransform: 'capitalize',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}
      >
        <div
          style={{
            background: 'var(--mc-bg)',
            border: '1px solid var(--mc-border)',
            borderRadius: '8px',
            padding: '12px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
            Period Start
          </div>
          <div style={{ fontSize: '13px', color: 'var(--fg)' }}>
            {new Date(sub.currentPeriodStart).toLocaleDateString()}
          </div>
        </div>
        <div
          style={{
            background: 'var(--mc-bg)',
            border: '1px solid var(--mc-border)',
            borderRadius: '8px',
            padding: '12px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Renews</div>
          <div style={{ fontSize: '13px', color: 'var(--fg)' }}>
            {new Date(sub.currentPeriodEnd).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const orgId = useOrganizationId();
  const { data: plansData, isLoading: plansLoading } = useBillingPlans();
  const { data: subData, isLoading: subLoading } = useSubscription(orgId ?? '');
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices(orgId ?? '', 10);

  const plans = plansData?.plans ?? [];
  const sub = subData?.subscription ?? null;
  const invoices = invoicesData?.invoices ?? [];

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
            Billing
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Manage your subscription plan and view invoices
          </p>
        </div>

        {subLoading ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '24px' }}>
            Loading subscription…
          </div>
        ) : sub ? (
          <div style={{ marginBottom: '24px' }}>
            <SubscriptionStatus sub={sub} />
          </div>
        ) : null}

        <div style={{ marginBottom: '28px' }}>
          <div
            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '14px' }}
          >
            Available Plans
          </div>
          {plansLoading ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading plans…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  current={sub?.planId === plan.id}
                  onSelect={() => {
                    /* TODO: handle plan upgrade */
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div
            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '12px' }}
          >
            Invoice History
          </div>
          {invoicesLoading ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>
          ) : invoices.length === 0 ? (
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
              No invoices yet.
            </div>
          ) : (
            <div
              style={{
                background: 'var(--mc-card)',
                border: '1px solid var(--mc-border)',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--mc-border)' }}>
                    {['Date', 'Amount', 'Status', 'PDF'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 16px',
                          textAlign: 'left',
                          fontWeight: 600,
                          color: 'var(--muted)',
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
                  {invoices.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--mc-border)' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--fg)' }}>
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          color: 'var(--fg)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        ${String(inv.amountDue / 100)}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            color: inv.status === 'paid' ? '#22c55e' : '#f59e0b',
                            border: `1px solid ${inv.status === 'paid' ? '#22c55e' : '#f59e0b'}`,
                            borderRadius: '4px',
                            padding: '2px 7px',
                            textTransform: 'capitalize',
                          }}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {inv.pdfUrl ? (
                          <a
                            href={inv.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#818cf8', fontSize: '11px' }}
                          >
                            Download
                          </a>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
