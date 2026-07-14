'use client';

import { useState, useRef, useEffect } from 'react';
import { useApiClient, useOrganizationId } from '../../../lib/api';

type Intent = 'submit_workflow' | 'approve' | 'reject' | 'query_status' | 'unknown';

interface ParsedMessage {
  id: string;
  phone: string;
  text: string;
  detectedIntent: Intent;
  confidence: number;
  timestamp: string;
  overrideIntent?: Intent;
}

const INTENT_COLOR: Record<Intent, string> = {
  submit_workflow: '#6366f1',
  approve: '#22c55e',
  reject: '#ef4444',
  query_status: '#38bdf8',
  unknown: '#f59e0b',
};

const INTENT_LABELS: Record<Intent, string> = {
  submit_workflow: 'Submit Workflow',
  approve: 'Approve',
  reject: 'Reject',
  query_status: 'Query Status',
  unknown: 'Unknown',
};

const ALL_INTENTS: Intent[] = ['submit_workflow', 'approve', 'reject', 'query_status', 'unknown'];

function MessageCard({
  msg,
  onOverride,
}: {
  msg: ParsedMessage;
  onOverride: (id: string, intent: Intent) => void;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const color = INTENT_COLOR[msg.overrideIntent ?? msg.detectedIntent];
  const label = INTENT_LABELS[msg.overrideIntent ?? msg.detectedIntent];
  const pct = Math.round(msg.confidence * 100);

  return (
    <div
      style={{
        background: 'var(--mc-card)',
        border: '1px solid var(--mc-border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)' }}>{msg.phone}</span>
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '10px',
              color,
              border: `1px solid ${color}`,
              borderRadius: '4px',
              padding: '2px 7px',
              fontWeight: 600,
            }}
          >
            {label}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{pct}%</span>
          {msg.overrideIntent && (
            <span
              style={{
                fontSize: '10px',
                color: '#f59e0b',
                border: '1px solid #f59e0b',
                borderRadius: '4px',
                padding: '2px 5px',
              }}
            >
              overridden
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--fg)',
          lineHeight: 1.5,
          background: 'var(--mc-bg)',
          borderRadius: '6px',
          padding: '8px 10px',
        }}
      >
        {msg.text}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--mc-border)' }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: '2px',
              background: color,
              width: `${String(pct)}%`,
              transition: 'width 0.3s',
            }}
          />
        </div>
        <button
          onClick={() => {
            setShowOverride((v) => !v);
          }}
          style={{
            fontSize: '10px',
            color: '#818cf8',
            background: 'transparent',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '4px',
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          Override
        </button>
      </div>
      {showOverride && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {ALL_INTENTS.map((intent) => (
            <button
              key={intent}
              onClick={() => {
                onOverride(msg.id, intent);
                setShowOverride(false);
              }}
              style={{
                fontSize: '10px',
                padding: '3px 10px',
                borderRadius: '4px',
                border: `1px solid ${INTENT_COLOR[intent]}`,
                background: 'transparent',
                color: INTENT_COLOR[intent],
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {INTENT_LABELS[intent]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WhatsAppCommandCenter() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [filterIntent, setFilterIntent] = useState<Intent | 'all'>('all');
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!orgId) return;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    const url = `${baseUrl}/api/v1/events/stream?organizationId=${encodeURIComponent(orgId)}`;
    const es = new EventSource(url);

    es.addEventListener('galaxy', (ev: MessageEvent<string>) => {
      let event: {
        type?: string;
        id?: string;
        payload?: Record<string, unknown>;
        timestamp?: string;
      } = {};
      try {
        event = JSON.parse(ev.data) as typeof event;
      } catch {
        return;
      }
      if (event.type !== 'whatsapp.message.received') return;
      const payload = event.payload ?? {};
      const rawPhone = payload.phone;
      const rawText = payload.text;
      const msg: ParsedMessage = {
        id: event.id ?? String(Date.now()),
        phone: typeof rawPhone === 'string' ? rawPhone : 'unknown',
        text: typeof rawText === 'string' ? rawText : '',
        detectedIntent: (payload.intent as Intent | undefined) ?? 'unknown',
        confidence: Number(payload.confidence ?? 0.5),
        timestamp: event.timestamp ?? new Date().toISOString(),
      };
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        if (ids.has(msg.id)) return prev;
        return [msg, ...prev].slice(0, 100);
      });
    });

    es.onerror = () => {
      /* EventSource auto-reconnects */
    };
    return () => {
      es.close();
    };
  }, [orgId]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0 });
  }, [messages.length]);

  const handleOverride = (id: string, intent: Intent) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, overrideIntent: intent } : m)));
  };

  const handleSendTest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgId || !testPhone.trim() || !testMsg.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await client.post('/api/v1/communication/whatsapp/send', {
        body: { organizationId: orgId, to: testPhone.trim(), message: testMsg.trim() },
      });
      setTestMsg('');
    } catch {
      setSendError('Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const displayed =
    filterIntent === 'all'
      ? messages
      : messages.filter((m) => (m.overrideIntent ?? m.detectedIntent) === filterIntent);

  const intentCounts = ALL_INTENTS.reduce<Record<string, number>>((acc, intent) => {
    acc[intent] = messages.filter((m) => (m.overrideIntent ?? m.detectedIntent) === intent).length;
    return acc;
  }, {});

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
            WhatsApp Command Center
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Live message log · intent classification · override panel
          </p>
        </div>

        {/* Intent summary cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          {ALL_INTENTS.map((intent) => (
            <button
              key={intent}
              onClick={() => {
                setFilterIntent(filterIntent === intent ? 'all' : intent);
              }}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border:
                  filterIntent === intent
                    ? `2px solid ${INTENT_COLOR[intent]}`
                    : '1px solid var(--mc-border)',
                background:
                  filterIntent === intent ? `${INTENT_COLOR[intent]}18` : 'var(--mc-card)',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--fg)',
              }}
            >
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: INTENT_COLOR[intent],
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(intentCounts[intent] ?? 0)}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--muted)',
                  marginTop: '2px',
                  lineHeight: 1.3,
                }}
              >
                {INTENT_LABELS[intent]}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
          {/* Message feed */}
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '10px',
              }}
            >
              {filterIntent === 'all' ? 'All Messages' : INTENT_LABELS[filterIntent]} ·{' '}
              {displayed.length}
            </div>
            <div
              ref={feedRef}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '600px',
                overflowY: 'auto',
              }}
            >
              {displayed.length === 0 && (
                <div
                  style={{
                    color: 'var(--muted)',
                    fontSize: '13px',
                    textAlign: 'center',
                    padding: '48px',
                    background: 'var(--mc-card)',
                    border: '1px solid var(--mc-border)',
                    borderRadius: '10px',
                  }}
                >
                  No messages yet. Messages arrive via WhatsApp webhook in real time.
                </div>
              )}
              {displayed.map((msg) => (
                <MessageCard key={msg.id} msg={msg} onOverride={handleOverride} />
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Send test message */}
            <div
              style={{
                background: 'var(--mc-card)',
                border: '1px solid var(--mc-border)',
                borderRadius: '10px',
                padding: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--fg)',
                  marginBottom: '12px',
                }}
              >
                Send Test Message
              </div>
              <form
                onSubmit={(e) => {
                  void handleSendTest(e);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <input
                  type="text"
                  placeholder="+234..."
                  value={testPhone}
                  onChange={(e) => {
                    setTestPhone(e.target.value);
                  }}
                  style={{
                    padding: '8px 11px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '12px',
                  }}
                />
                <textarea
                  placeholder="Message text…"
                  value={testMsg}
                  rows={3}
                  onChange={(e) => {
                    setTestMsg(e.target.value);
                  }}
                  style={{
                    padding: '8px 11px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '12px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
                {sendError && <div style={{ color: '#ef4444', fontSize: '11px' }}>{sendError}</div>}
                <button
                  type="submit"
                  disabled={sending || !testPhone || !testMsg}
                  style={{
                    padding: '7px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--mc-accent)',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: sending ? 'not-allowed' : 'pointer',
                    opacity: sending || !testPhone || !testMsg ? 0.6 : 1,
                  }}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </form>
            </div>

            {/* Legend */}
            <div
              style={{
                background: 'var(--mc-card)',
                border: '1px solid var(--mc-border)',
                borderRadius: '10px',
                padding: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--fg)',
                  marginBottom: '10px',
                }}
              >
                Intent Legend
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ALL_INTENTS.map((intent) => (
                  <div key={intent} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: INTENT_COLOR[intent],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {INTENT_LABELS[intent]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
