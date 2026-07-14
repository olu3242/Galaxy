'use client';

import { useState, useRef, useEffect } from 'react';
import { useApiClient, useOrganizationId } from '../../../lib/api';

type CopilotRole = 'executive' | 'operations' | 'hr' | 'finance' | 'compliance';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const ROLES: { key: CopilotRole; label: string; description: string }[] = [
  {
    key: 'executive',
    label: 'Executive',
    description: 'Strategy, org health, high-level insights',
  },
  { key: 'operations', label: 'Operations', description: 'Workflows, queues, system performance' },
  { key: 'hr', label: 'HR', description: 'People, attendance, leaves, onboarding' },
  { key: 'finance', label: 'Finance', description: 'Expenses, budgets, approvals' },
  { key: 'compliance', label: 'Compliance', description: 'Policies, audits, governance' },
];

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '12px',
      }}
    >
      {!isUser && (
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            flexShrink: 0,
            marginRight: '8px',
            marginTop: '2px',
          }}
        >
          ✦
        </div>
      )}
      <div
        style={{
          maxWidth: '72%',
          padding: '10px 14px',
          borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          background: isUser ? 'var(--mc-accent)' : 'var(--mc-card)',
          border: isUser ? 'none' : '1px solid var(--mc-border)',
          color: isUser ? '#fff' : 'var(--fg)',
          fontSize: '13px',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}
      >
        {msg.content}
        <div
          style={{
            fontSize: '10px',
            color: isUser ? 'rgba(255,255,255,0.6)' : 'var(--muted)',
            marginTop: '4px',
            textAlign: 'right',
          }}
        >
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export default function CopilotPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const [role, setRole] = useState<CopilotRole>('executive');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleRoleChange = (r: CopilotRole) => {
    setRole(r);
    setMessages([]);
    setError(null);
  };

  const handleSend = async () => {
    const query = input.trim();
    if (!query || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const raw = await client.post(`/api/v1/copilots/${role}`, {
        body: { query, organizationId: orgId },
      });
      const res = raw as { answer?: string; response?: string; message?: string };
      const answer = res.answer ?? res.response ?? res.message ?? 'No response received.';
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setError('Failed to get a response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const currentRole = ROLES.find((r) => r.key === role);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          maxWidth: '860px',
          margin: '0 auto',
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            AI Copilot
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Ask anything about your organization
          </p>
        </div>

        {/* Role selector */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: '20px',
          }}
        >
          {ROLES.map((r) => (
            <button
              key={r.key}
              onClick={() => {
                handleRoleChange(r.key);
              }}
              title={r.description}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border:
                  role === r.key ? '1px solid var(--mc-accent)' : '1px solid var(--mc-border)',
                background: role === r.key ? 'rgba(99,102,241,0.15)' : 'var(--mc-card)',
                color: role === r.key ? 'var(--mc-accent)' : 'var(--muted)',
                fontSize: '12px',
                fontWeight: role === r.key ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Chat area */}
        <div
          style={{
            flex: 1,
            background: 'var(--mc-card)',
            border: '1px solid var(--mc-border)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '480px',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--mc-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#22c55e',
              }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>
              {currentRole?.label} Copilot
            </span>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              · {currentRole?.description}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 16px',
            }}
          >
            {messages.length === 0 && !loading && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '200px',
                  gap: '12px',
                  color: 'var(--muted)',
                }}
              >
                <div style={{ fontSize: '32px' }}>✦</div>
                <div style={{ fontSize: '14px', textAlign: 'center' }}>
                  Ask me anything about your {currentRole?.label.toLowerCase()} operations.
                  <br />
                  <span style={{ fontSize: '12px' }}>
                    Press Enter to send · Shift+Enter for new line
                  </span>
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {loading && (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    flexShrink: 0,
                  }}
                >
                  ✦
                </div>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '14px 14px 14px 4px',
                    background: 'var(--mc-bg)',
                    border: '1px solid var(--mc-border)',
                    color: 'var(--muted)',
                    fontSize: '13px',
                  }}
                >
                  Thinking…
                </div>
              </div>
            )}
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#ef444422',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  fontSize: '13px',
                  marginBottom: '12px',
                }}
              >
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--mc-border)',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-end',
            }}
          >
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Ask the ${currentRole?.label ?? ''} Copilot…`}
              rows={2}
              disabled={loading}
              style={{
                flex: 1,
                padding: '9px 13px',
                borderRadius: '8px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-bg)',
                color: 'var(--fg)',
                fontSize: '13px',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                opacity: loading ? 0.6 : 1,
              }}
            />
            <button
              onClick={() => {
                void handleSend();
              }}
              disabled={!input.trim() || loading}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--mc-accent)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                opacity: !input.trim() || loading ? 0.5 : 1,
                flexShrink: 0,
                alignSelf: 'flex-end',
              }}
            >
              Send
            </button>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
            }}
            style={{
              marginTop: '10px',
              alignSelf: 'flex-end',
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Clear conversation
          </button>
        )}
      </div>
    </main>
  );
}
