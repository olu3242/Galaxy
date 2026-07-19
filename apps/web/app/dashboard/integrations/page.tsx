'use client';

import { useState } from 'react';
import { useIntegrations } from '../../../lib/api';
import type { Integration } from '../../../lib/api';
import { useApiClient, useOrganizationId } from '../../../lib/api';

const CONNECTOR_ICONS: Record<string, string> = {
  whatsapp: '💬',
  slack: '💼',
  google_sheets: '📊',
  zapier: '⚡',
  webhook: '🔗',
  email: '📧',
  sms: '📱',
  hubspot: '🧲',
  salesforce: '☁️',
};

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  inactive: '#f59e0b',
  error: '#ef4444',
};

const AVAILABLE_CONNECTORS = [
  { type: 'webhook', label: 'Webhook', description: 'Send HTTP callbacks to any URL on events' },
  { type: 'slack', label: 'Slack', description: 'Post notifications and alerts to Slack channels' },
  {
    type: 'google_sheets',
    label: 'Google Sheets',
    description: 'Sync data to Google Sheets in real time',
  },
  { type: 'email', label: 'Email', description: 'Send transactional emails via SMTP or SendGrid' },
  { type: 'zapier', label: 'Zapier', description: 'Trigger Zaps from Galaxy workflow events' },
  { type: 'hubspot', label: 'HubSpot', description: 'Sync contacts and deals with HubSpot CRM' },
];

function IntegrationCard({
  integration,
  onToggle,
}: {
  integration: Integration;
  onToggle: (id: string, enable: boolean) => void;
}) {
  const icon = CONNECTOR_ICONS[integration.connectorType] ?? '🔌';
  const color = STATUS_COLOR[integration.status] ?? 'var(--muted)';
  const isActive = integration.status === 'active';
  return (
    <div
      style={{
        background: 'var(--mc-card)',
        border: '1px solid var(--mc-border)',
        borderRadius: '10px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div style={{ fontSize: '28px', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fg)' }}>
            {integration.name}
          </span>
          <span
            style={{
              fontSize: '10px',
              color,
              border: `1px solid ${color}`,
              borderRadius: '4px',
              padding: '1px 7px',
              textTransform: 'capitalize',
            }}
          >
            {integration.status}
          </span>
        </div>
        <div
          style={{
            fontSize: '11px',
            color: '#818cf8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {integration.connectorType.replace(/_/g, ' ')}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
          Added {new Date(integration.createdAt).toLocaleDateString()}
        </div>
      </div>
      <button
        onClick={() => {
          onToggle(integration.id, !isActive);
        }}
        style={{
          padding: '6px 14px',
          borderRadius: '7px',
          border: `1px solid ${isActive ? '#ef4444' : '#22c55e'}`,
          background: 'transparent',
          color: isActive ? '#ef4444' : '#22c55e',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {isActive ? 'Disable' : 'Enable'}
      </button>
    </div>
  );
}

export default function IntegrationsPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const { data, isLoading, mutate } = useIntegrations();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState('webhook');
  const [connName, setConnName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const integrations = data?.connectors ?? [];

  const handleToggle = async (id: string, enable: boolean) => {
    if (!orgId) return;
    try {
      const action = enable ? 'enable' : 'disable';
      await client.put(`/api/v1/integrations/${id}/${action}`, {});
      setSuccessMsg(`Integration ${enable ? 'enabled' : 'disabled'}.`);
      void mutate();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch {
      setAddError('Failed to update integration.');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !connName.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await client.post('/api/v1/integrations', {
        body: {
          name: connName.trim(),
          connectorType: selectedType,
          config: selectedType === 'webhook' ? { url: webhookUrl } : {},
          credentials: apiKey ? { apiKey } : {},
        },
      });
      setSuccessMsg('Integration added.');
      setConnName('');
      setWebhookUrl('');
      setApiKey('');
      setShowAdd(false);
      void mutate();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch {
      setAddError('Failed to add integration.');
    } finally {
      setAdding(false);
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
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
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
              Integrations
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
              {integrations.length} connected · sync Galaxy with your tools
            </p>
          </div>
          <button
            onClick={() => {
              setShowAdd((v) => !v);
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
            {showAdd ? 'Cancel' : '+ Add Integration'}
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

        {showAdd && (
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
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--fg)',
                marginBottom: '14px',
              }}
            >
              Add Integration
            </div>
            {/* Connector picker */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              {AVAILABLE_CONNECTORS.map((c) => (
                <button
                  key={c.type}
                  onClick={() => {
                    setSelectedType(c.type);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border:
                      selectedType === c.type ? '2px solid #6366f1' : '1px solid var(--mc-border)',
                    background: selectedType === c.type ? 'rgba(99,102,241,0.1)' : 'var(--mc-bg)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--fg)',
                  }}
                >
                  <div style={{ fontSize: '18px', marginBottom: '4px' }}>
                    {CONNECTOR_ICONS[c.type] ?? '🔌'}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>{c.label}</div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--muted)',
                      lineHeight: 1.3,
                      marginTop: '2px',
                    }}
                  >
                    {c.description}
                  </div>
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                void handleAdd(e);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <input
                type="text"
                placeholder="Integration name *"
                value={connName}
                required
                onChange={(e) => {
                  setConnName(e.target.value);
                }}
                style={{
                  padding: '9px 13px',
                  borderRadius: '7px',
                  border: '1px solid var(--mc-border)',
                  background: 'var(--mc-bg)',
                  color: 'var(--fg)',
                  fontSize: '13px',
                }}
              />
              {selectedType === 'webhook' && (
                <input
                  type="url"
                  placeholder="Webhook URL"
                  value={webhookUrl}
                  onChange={(e) => {
                    setWebhookUrl(e.target.value);
                  }}
                  style={{
                    padding: '9px 13px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
              )}
              {selectedType !== 'webhook' && (
                <input
                  type="text"
                  placeholder="API Key / Token"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                  }}
                  style={{
                    padding: '9px 13px',
                    borderRadius: '7px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '13px',
                  }}
                />
              )}
              {addError && <div style={{ color: '#ef4444', fontSize: '12px' }}>{addError}</div>}
              <button
                type="submit"
                disabled={adding}
                style={{
                  alignSelf: 'flex-end',
                  padding: '8px 20px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'var(--mc-accent)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: adding ? 'not-allowed' : 'pointer',
                  opacity: adding ? 0.7 : 1,
                }}
              >
                {adding ? 'Adding…' : 'Add Integration'}
              </button>
            </form>
          </div>
        )}

        {isLoading && (
          <div
            style={{
              color: 'var(--muted)',
              textAlign: 'center',
              padding: '40px',
              fontSize: '14px',
            }}
          >
            Loading…
          </div>
        )}

        {!isLoading && integrations.length === 0 && (
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
            No integrations yet. Connect Galaxy to your tools above.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {integrations.map((int) => (
            <IntegrationCard
              key={int.id}
              integration={int}
              onToggle={(id, enable) => {
                void handleToggle(id, enable);
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
