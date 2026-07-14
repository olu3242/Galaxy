'use client';

import { useState } from 'react';
import { useWaTemplates, useApiClient, useOrganizationId } from '../../../lib/api';
import type { WaTemplate } from '../../../lib/api';

const STATUS_COLOR: Record<string, string> = {
  APPROVED: '#22c55e',
  PENDING: '#f59e0b',
  REJECTED: '#ef4444',
};

const CATEGORY_ICON: Record<string, string> = {
  UTILITY: '🔧',
  MARKETING: '📣',
  AUTHENTICATION: '🔐',
};

const CATEGORIES: WaTemplate['category'][] = ['UTILITY', 'MARKETING', 'AUTHENTICATION'];
const LANGUAGES = ['en', 'en_US', 'fr', 'es', 'pt_BR', 'ar', 'yo', 'ha', 'ig'];

function TemplateCard({
  template,
  onSelect,
  selected,
}: {
  template: WaTemplate;
  onSelect: () => void;
  selected: boolean;
}) {
  const color = STATUS_COLOR[template.status] ?? 'var(--muted)';
  const icon = CATEGORY_ICON[template.category] ?? '💬';
  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        background: selected ? 'rgba(99,102,241,0.1)' : 'var(--mc-card)',
        border: selected ? '2px solid #6366f1' : '1px solid var(--mc-border)',
        borderRadius: '10px',
        padding: '14px 16px',
        cursor: 'pointer',
        color: 'var(--fg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{icon}</span>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{template.name}</span>
        </div>
        <span
          style={{
            fontSize: '10px',
            color,
            border: `1px solid ${color}`,
            borderRadius: '4px',
            padding: '1px 6px',
            flexShrink: 0,
          }}
        >
          {template.status}
        </span>
      </div>
      <div
        style={{
          fontSize: '10px',
          color: '#818cf8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '6px',
        }}
      >
        {template.category} · {template.language}
      </div>
      <div
        style={{
          fontSize: '11px',
          color: 'var(--muted)',
          lineHeight: 1.4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {template.body}
      </div>
    </button>
  );
}

function TemplateDetail({ template }: { template: WaTemplate }) {
  const color = STATUS_COLOR[template.status] ?? 'var(--muted)';
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
            {template.name}
          </div>
          <div style={{ fontSize: '11px', color: '#818cf8' }}>
            {template.category} · {template.language}
          </div>
        </div>
        <span
          style={{
            fontSize: '10px',
            color,
            border: `1px solid ${color}`,
            borderRadius: '4px',
            padding: '2px 8px',
            fontWeight: 600,
          }}
        >
          {template.status}
        </span>
      </div>

      {template.header && (
        <div style={{ marginBottom: '12px' }}>
          <div
            style={{
              fontSize: '10px',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
            }}
          >
            Header
          </div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--fg)',
              background: 'var(--mc-bg)',
              borderRadius: '6px',
              padding: '8px 12px',
            }}
          >
            {template.header}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '12px' }}>
        <div
          style={{
            fontSize: '10px',
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '4px',
          }}
        >
          Body
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--fg)',
            background: 'var(--mc-bg)',
            borderRadius: '6px',
            padding: '12px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {template.body}
        </div>
      </div>

      {template.footer && (
        <div style={{ marginBottom: '12px' }}>
          <div
            style={{
              fontSize: '10px',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
            }}
          >
            Footer
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--muted)',
              background: 'var(--mc-bg)',
              borderRadius: '6px',
              padding: '8px 12px',
            }}
          >
            {template.footer}
          </div>
        </div>
      )}

      {template.buttons && template.buttons.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '10px',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '6px',
            }}
          >
            Buttons
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {template.buttons.map((btn, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  background: 'var(--mc-bg)',
                  borderRadius: '6px',
                  border: '1px solid var(--mc-border)',
                }}
              >
                <span style={{ fontSize: '10px', color: '#818cf8', textTransform: 'uppercase' }}>
                  {btn.type}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--fg)', fontWeight: 600 }}>
                  {btn.text}
                </span>
                {btn.value && (
                  <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: 'auto' }}>
                    {btn.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TemplatesPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const { data, isLoading, mutate } = useWaTemplates();
  const [selected, setSelected] = useState<WaTemplate | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState<WaTemplate['category'] | 'ALL'>('ALL');

  const [tName, setTName] = useState('');
  const [tCategory, setTCategory] = useState<WaTemplate['category']>('UTILITY');
  const [tLanguage, setTLanguage] = useState('en');
  const [tHeader, setTHeader] = useState('');
  const [tBody, setTBody] = useState('');
  const [tFooter, setTFooter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const allTemplates = data?.data ?? [];
  const templates =
    filterCategory === 'ALL'
      ? allTemplates
      : allTemplates.filter((t) => t.category === filterCategory);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgId || !tName.trim() || !tBody.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await client.post('/api/v1/communication/templates', {
        body: {
          organizationId: orgId,
          name: tName.trim(),
          category: tCategory,
          language: tLanguage,
          header: tHeader || undefined,
          body: tBody.trim(),
          footer: tFooter || undefined,
        },
      });
      flash('Template submitted for approval.');
      setTName('');
      setTHeader('');
      setTBody('');
      setTFooter('');
      setShowForm(false);
      void mutate();
    } catch {
      setFormError('Failed to create template.');
    } finally {
      setSubmitting(false);
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
      <div style={{ maxWidth: '1050px', margin: '0 auto' }}>
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
              WhatsApp Templates
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
              {allTemplates.length} templates · manage approved message templates for WhatsApp
              Business API
            </p>
          </div>
          <button
            onClick={() => {
              setShowForm((v) => !v);
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
            {showForm ? 'Cancel' : '+ New Template'}
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

        {showForm && (
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
                marginBottom: '14px',
              }}
            >
              Create Template
            </div>
            <form
              onSubmit={(e) => {
                void handleCreate(e);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Template name *"
                  value={tName}
                  required
                  onChange={(e) => {
                    setTName(e.target.value);
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
                <select
                  value={tCategory}
                  onChange={(e) => {
                    setTCategory(e.target.value as WaTemplate['category']);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={tLanguage}
                  onChange={(e) => {
                    setTLanguage(e.target.value);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="Header (optional)"
                value={tHeader}
                onChange={(e) => {
                  setTHeader(e.target.value);
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
              <textarea
                placeholder="Body text * (use {{1}}, {{2}} for variables)"
                value={tBody}
                required
                rows={4}
                onChange={(e) => {
                  setTBody(e.target.value);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--mc-border)',
                  background: 'var(--mc-bg)',
                  color: 'var(--fg)',
                  fontSize: '13px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <input
                type="text"
                placeholder="Footer (optional)"
                value={tFooter}
                onChange={(e) => {
                  setTFooter(e.target.value);
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
              {formError && <div style={{ color: '#ef4444', fontSize: '12px' }}>{formError}</div>}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  alignSelf: 'flex-end',
                  padding: '8px 20px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'var(--mc-accent)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Submitting…' : 'Submit for Approval'}
              </button>
            </form>
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {(['ALL', ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setFilterCategory(cat);
              }}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                border: `1px solid ${filterCategory === cat ? '#6366f1' : 'var(--mc-border)'}`,
                background: filterCategory === cat ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: filterCategory === cat ? '#818cf8' : 'var(--muted)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {cat === 'ALL' ? 'All' : cat}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
          <div>
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
                {templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    selected={selected?.id === t.id}
                    onSelect={() => {
                      setSelected(t);
                    }}
                  />
                ))}
                {templates.length === 0 && (
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
                    No templates yet.
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            {selected ? (
              <TemplateDetail template={selected} />
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
                Select a template to preview.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
