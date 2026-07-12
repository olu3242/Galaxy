'use client';

import { useEffect, useRef } from 'react';

export interface ActivityItem {
  id: string;
  type: 'workflow' | 'agent' | 'approval' | 'member' | 'alert' | 'system';
  message: string;
  actor?: string;
  timestamp: string;
  severity?: 'info' | 'warn' | 'error' | 'success';
}

const SEVERITY_COLOR: Record<string, string> = {
  info: '#6366f1',
  warn: '#f59e0b',
  error: '#ef4444',
  success: '#22c55e',
};

const TYPE_ICON: Record<string, string> = {
  workflow: '⚡',
  agent: '🤖',
  approval: '✅',
  member: '👤',
  alert: '🔔',
  system: '⚙️',
};

export interface LiveActivityFeedProps {
  items: ActivityItem[];
  maxItems?: number;
  title?: string;
}

export function LiveActivityFeed({
  items,
  maxItems = 20,
  title = 'Live Activity',
}: LiveActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length]);

  const visible = items.slice(-maxItems);

  return (
    <div className="mc-card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <span className="mc-label" style={{ marginBottom: '12px' }}>
        {title}
      </span>
      <div
        style={{
          overflowY: 'auto',
          maxHeight: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {visible.length === 0 && (
          <span className="mc-subtext" style={{ padding: '16px 0', textAlign: 'center' }}>
            No activity yet
          </span>
        )}
        {visible.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              padding: '6px 8px',
              borderRadius: '6px',
              borderLeft: `3px solid ${SEVERITY_COLOR[item.severity ?? 'info']}`,
              background: 'var(--card-border)',
              fontSize: '13px',
            }}
          >
            <span style={{ flexShrink: 0 }}>{TYPE_ICON[item.type]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: 'var(--fg)' }}>{item.message}</span>
              {item.actor && (
                <span style={{ color: 'var(--muted)', marginLeft: '6px' }}>— {item.actor}</span>
              )}
            </div>
            <span style={{ color: 'var(--muted)', flexShrink: 0, fontSize: '11px' }}>
              {new Date(item.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
