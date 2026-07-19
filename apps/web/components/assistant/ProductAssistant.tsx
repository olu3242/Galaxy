'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { QUICK_ACTIONS } from '../../lib/assistant/types';
import type { ChatMessage, LeadData } from '../../lib/assistant/types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function generateSessionId(): string {
  if (typeof window === 'undefined') return generateId();
  const stored = sessionStorage.getItem('gx-assistant-session');
  if (stored) return stored;
  const id = generateId();
  sessionStorage.setItem('gx-assistant-session', id);
  return id;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm the Galaxy Product Assistant 👋\n\nI can help you understand how Galaxy works, whether it's right for your organization, pricing, and how to get started. What would you like to know?",
  timestamp: new Date().toISOString(),
};

interface EscalationBannerProps {
  onContact: () => void;
}

function EscalationBanner({ onContact }: EscalationBannerProps) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #6366f118, #8b5cf618)',
        border: '1px solid #6366f140',
        borderRadius: '10px',
        padding: '12px 16px',
        margin: '8px 0',
        fontSize: '13px',
        color: '#e2e8f0',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '4px', color: '#a5b4fc' }}>
        Connect with a Specialist
      </div>
      <div style={{ marginBottom: '10px', color: '#94a3b8' }}>
        A Galaxy specialist can answer detailed questions about enterprise deployments, compliance,
        custom integrations, and pricing.
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <a
          href="mailto:sales@galaxyos.com"
          style={{
            background: '#6366f1',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Email Sales
        </a>
        <button
          onClick={onContact}
          style={{
            background: 'transparent',
            border: '1px solid #6366f140',
            color: '#a5b4fc',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Book a Demo
        </button>
      </div>
    </div>
  );
}

interface DemoFormProps {
  onSubmit: (data: Partial<LeadData> & { preferredDate?: string }) => void;
  onCancel: () => void;
}

function DemoForm({ onSubmit, onCancel }: DemoFormProps) {
  const [form, setForm] = useState({ name: '', email: '', company: '', industry: '', country: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '8px 10px',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px',
        margin: '8px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '14px', color: '#e2e8f0', marginBottom: '4px' }}>
        Book a Galaxy Demo
      </div>
      {(['name', 'email', 'company', 'industry', 'country'] as const).map((field) => (
        <input
          key={field}
          required={field === 'name' || field === 'email'}
          type={field === 'email' ? 'email' : 'text'}
          placeholder={
            field === 'name'
              ? 'Your name *'
              : field === 'email'
                ? 'Work email *'
                : field === 'company'
                  ? 'Organization name'
                  : field === 'industry'
                    ? 'Industry (e.g. NGO, Church, School)'
                    : 'Country'
          }
          value={form[field]}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, [field]: e.target.value }));
          }}
          style={inputStyle}
        />
      ))}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          type="submit"
          style={{
            flex: 1,
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Request Demo
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: '1px solid #334155',
            color: '#94a3b8',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ProductAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEscalation, setShowEscalation] = useState(false);
  const [showDemoForm, setShowDemoForm] = useState(false);
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [sessionId] = useState(() => generateSessionId());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [messages, open]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      setShowEscalation(false);

      try {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
          },
          body: JSON.stringify({ messages: history, sessionId }),
        });

        const data = (await res.json()) as { content?: string; requiresEscalation?: boolean };
        const content = data.content ?? "I'm unable to respond right now. Please try again.";

        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        if (data.requiresEscalation) {
          setShowEscalation(true);
        }

        // Auto-show demo form if user mentioned demo
        if (/\bdemo\b/i.test(text) && !demoSubmitted) {
          setShowDemoForm(true);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content:
              "Sorry, I'm having trouble connecting. Please email us at sales@galaxyos.com or try again shortly.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, sessionId, demoSubmitted],
  );

  const handleDemoSubmit = (data: Partial<LeadData>) => {
    setShowDemoForm(false);
    setDemoSubmitted(true);
    const name = data.name ?? 'there';
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: 'assistant',
        content: `Thanks, ${name}! Your demo request has been received. A Galaxy specialist will reach out to ${data.email ?? 'you'} within 1 business day to schedule your session. Is there anything else you'd like to know about Galaxy in the meantime?`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-label="Open Galaxy Product Assistant"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 1000,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 24px #6366f140',
          fontSize: '22px',
          transition: 'transform 0.2s',
        }}
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Chat window */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: '92px',
            right: '24px',
            zIndex: 1000,
            width: '360px',
            maxHeight: '580px',
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
              }}
            >
              ✦
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>
                Galaxy Assistant
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                Product Specialist · Online
              </div>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              minHeight: 0,
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '9px 12px',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background:
                      msg.role === 'user' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#1e293b',
                    color: '#e2e8f0',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '9px 14px',
                    background: '#1e293b',
                    borderRadius: '12px 12px 12px 2px',
                    color: '#94a3b8',
                    fontSize: '18px',
                    letterSpacing: '2px',
                  }}
                >
                  •••
                </div>
              </div>
            )}

            {showEscalation && (
              <EscalationBanner
                onContact={() => {
                  setShowEscalation(false);
                  setShowDemoForm(true);
                }}
              />
            )}

            {showDemoForm && !demoSubmitted && (
              <DemoForm
                onSubmit={handleDemoSubmit}
                onCancel={() => {
                  setShowDemoForm(false);
                }}
              />
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick actions — only show at start */}
          {messages.length <= 1 && (
            <div
              style={{
                padding: '0 12px 8px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
              }}
            >
              {QUICK_ACTIONS.slice(0, 4).map((action) => (
                <button
                  key={action.label}
                  onClick={() => {
                    void sendMessage(action.prompt);
                  }}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    padding: '5px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              placeholder="Ask about Galaxy..."
              disabled={loading}
              style={{
                flex: 1,
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#e2e8f0',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              onClick={() => {
                void sendMessage(input);
              }}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? '#1e293b' : '#6366f1',
                border: 'none',
                borderRadius: '8px',
                width: '34px',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: loading || !input.trim() ? 'default' : 'pointer',
                color: loading || !input.trim() ? '#475569' : '#fff',
                fontSize: '14px',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
              aria-label="Send message"
            >
              ➤
            </button>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '6px 12px',
              fontSize: '10px',
              color: '#475569',
              textAlign: 'center',
              borderTop: '1px solid #1e293b',
            }}
          >
            Galaxy AI · Public product questions only · Not for internal use
          </div>
        </div>
      )}
    </>
  );
}
