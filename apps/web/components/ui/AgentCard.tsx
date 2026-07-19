'use client';

export type AgentState =
  | 'IDLE'
  | 'OBSERVING'
  | 'THINKING'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ESCALATED';

const STATE_COLOR: Record<AgentState, string> = {
  IDLE: '#94a3b8',
  OBSERVING: '#6366f1',
  THINKING: '#a78bfa',
  EXECUTING: '#f59e0b',
  VERIFYING: '#38bdf8',
  COMPLETED: '#22c55e',
  FAILED: '#ef4444',
  ESCALATED: '#f97316',
};

export interface AgentCardProps {
  id: string;
  name: string;
  fullName: string;
  state: AgentState;
  currentTask?: string;
  completedToday: number;
  successRate: number;
  impactTier: 1 | 2 | 3 | 4 | 5;
}

export function AgentCard({
  name,
  fullName,
  state,
  currentTask,
  completedToday,
  successRate,
  impactTier,
}: AgentCardProps) {
  const stateColor = STATE_COLOR[state];
  const tierLabel = ['', 'Monitor', 'Notify', 'Approve', 'Review', 'Board'][impactTier];

  return (
    <div className="mc-card" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fg)' }}>{name}</span>
          <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
            {fullName}
          </span>
        </div>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            background: stateColor + '22',
            color: stateColor,
            border: `1px solid ${stateColor}44`,
          }}
        >
          {state}
        </span>
      </div>

      {currentTask && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--muted)',
            marginTop: '8px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          ↪ {currentTask}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginTop: '12px',
          fontSize: '12px',
          color: 'var(--muted)',
        }}
      >
        <span>
          <strong style={{ color: 'var(--fg)' }}>{completedToday}</strong> done today
        </span>
        <span>
          <strong style={{ color: successRate >= 90 ? '#22c55e' : '#f59e0b' }}>
            {successRate}%
          </strong>{' '}
          success
        </span>
        <span>
          Tier <strong style={{ color: 'var(--fg)' }}>{impactTier}</strong>
          <span style={{ color: 'var(--muted)' }}> ({tierLabel})</span>
        </span>
      </div>
    </div>
  );
}
