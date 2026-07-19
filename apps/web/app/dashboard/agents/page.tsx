'use client';

import { useState } from 'react';
import {
  useAgentDefinitions,
  useAgentTasks,
  useApiClient,
  useOrganizationId,
} from '../../../lib/api';
import type { AgentDefinition, AgentTask } from '../../../lib/api';

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  paused: '#f59e0b',
  error: '#ef4444',
  pending: '#f59e0b',
  running: '#38bdf8',
  completed: '#22c55e',
  failed: '#ef4444',
};

const AGENT_ICON: Record<string, string> = {
  loop: '🔄',
  approval: '✅',
  notification: '🔔',
  analytics: '📊',
  knowledge: '📚',
  compliance: '🛡️',
  broadcast: '📢',
};

function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = STATUS_COLOR[agent.status] ?? 'var(--muted)';
  const icon = AGENT_ICON[agent.type] ?? '🤖';
  const successRate =
    agent.tasksCompleted + agent.tasksFailed > 0
      ? Math.round((agent.tasksCompleted / (agent.tasksCompleted + agent.tasksFailed)) * 100)
      : null;

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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ fontSize: '24px', flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '4px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700 }}>{agent.name}</span>
            <span
              style={{
                fontSize: '10px',
                color,
                border: `1px solid ${color}`,
                borderRadius: '4px',
                padding: '1px 6px',
                textTransform: 'capitalize',
              }}
            >
              {agent.status}
            </span>
          </div>
          <div
            style={{
              fontSize: '11px',
              color: '#818cf8',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
            }}
          >
            {agent.type}
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Completed</div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#22c55e',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(agent.tasksCompleted)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Failed</div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#ef4444',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(agent.tasksFailed)}
              </div>
            </div>
            {successRate !== null && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Success</div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color:
                      successRate >= 90 ? '#22c55e' : successRate >= 70 ? '#f59e0b' : '#ef4444',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {String(successRate)}%
                </div>
              </div>
            )}
          </div>
          {agent.capabilities.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
              {agent.capabilities.slice(0, 4).map((cap) => (
                <span
                  key={cap}
                  style={{
                    fontSize: '9px',
                    color: '#818cf8',
                    background: 'rgba(99,102,241,0.1)',
                    borderRadius: '3px',
                    padding: '2px 6px',
                  }}
                >
                  {cap}
                </span>
              ))}
              {agent.capabilities.length > 4 && (
                <span style={{ fontSize: '9px', color: 'var(--muted)' }}>
                  +{String(agent.capabilities.length - 4)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function TaskRow({ task }: { task: AgentTask }) {
  const color = STATUS_COLOR[task.status] ?? 'var(--muted)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 14px',
        background: 'var(--mc-bg)',
        border: '1px solid var(--mc-border)',
        borderRadius: '7px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fg)' }}>{task.type}</div>
        <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
          {new Date(task.createdAt).toLocaleString()}
        </div>
      </div>
      <span
        style={{
          fontSize: '10px',
          color,
          border: `1px solid ${color}`,
          borderRadius: '4px',
          padding: '2px 7px',
          textTransform: 'capitalize',
          flexShrink: 0,
        }}
      >
        {task.status}
      </span>
    </div>
  );
}

export default function AgentsPage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const { data: agentsData, isLoading, mutate } = useAgentDefinitions();
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);
  const { data: tasksData, isLoading: tasksLoading } = useAgentTasks(selectedAgent?.id, 20);

  const [showCreate, setShowCreate] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentType, setAgentType] = useState('loop');
  const [caps, setCaps] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const agents = agentsData?.data ?? [];
  const tasks = tasksData?.data ?? [];

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgId || !agentName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await client.post('/api/v1/agents/definitions', {
        body: {
          organizationId: orgId,
          name: agentName.trim(),
          type: agentType,
          capabilities: caps
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean),
        },
      });
      flash('Agent created.');
      setAgentName('');
      setCaps('');
      setShowCreate(false);
      void mutate();
    } catch {
      setCreateError('Failed to create agent.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (agent: AgentDefinition) => {
    const action = agent.status === 'active' ? 'pause' : 'activate';
    try {
      await client.put(`/api/v1/agents/definitions/${agent.id}/${action}`, {});
      flash(`Agent ${action}d.`);
      void mutate();
    } catch {
      flash('Failed to update agent.');
    }
  };

  const AGENT_TYPES = [
    'loop',
    'approval',
    'notification',
    'analytics',
    'knowledge',
    'compliance',
    'broadcast',
  ];

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
              Agent OS
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
              {agents.length} agents · autonomous task execution and governance
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
            {showCreate ? 'Cancel' : '+ New Agent'}
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
              Create Agent
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
                  placeholder="Agent name *"
                  value={agentName}
                  required
                  onChange={(e) => {
                    setAgentName(e.target.value);
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
                  value={agentType}
                  onChange={(e) => {
                    setAgentType(e.target.value);
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
                  {AGENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="Capabilities (comma-separated)"
                value={caps}
                onChange={(e) => {
                  setCaps(e.target.value);
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
                {creating ? 'Creating…' : 'Create Agent'}
              </button>
            </form>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px' }}>
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
              Agents
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
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    selected={selectedAgent?.id === agent.id}
                    onSelect={() => {
                      setSelectedAgent(agent);
                    }}
                  />
                ))}
                {agents.length === 0 && (
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
                    No agents yet.
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            {selectedAgent ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>
                      {selectedAgent.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>
                      Task History
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      void handleToggle(selectedAgent);
                    }}
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${selectedAgent.status === 'active' ? '#f59e0b' : '#22c55e'}`,
                      background: 'transparent',
                      color: selectedAgent.status === 'active' ? '#f59e0b' : '#22c55e',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedAgent.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                </div>
                {tasksLoading ? (
                  <div
                    style={{
                      color: 'var(--muted)',
                      fontSize: '13px',
                      textAlign: 'center',
                      padding: '32px',
                    }}
                  >
                    Loading tasks…
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {tasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                    {tasks.length === 0 && (
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
                        No tasks yet for this agent.
                      </div>
                    )}
                  </div>
                )}
              </>
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
                Select an agent to view task history.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
