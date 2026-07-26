/**
 * Agent OS Certification Test Suite
 *
 * Certifies the Agent module lifecycle:
 * 1.  agents and agent_memory tables exist
 * 2.  Agent registration persists a record
 * 3.  Agent retrieval returns the agent
 * 4.  Agent listing is tenant-scoped
 * 5.  Agent listing filters by type
 * 6.  Agent memory storage (remember) works
 * 7.  Agent memory recall returns entries
 * 8.  Agent deactivation sets isActive = false
 * 9.  Deactivated agent excluded from active listing
 * 10. Cross-tenant isolation — org B cannot see org A agents
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { AgentRegistryService, AgentMemoryService } from '@galaxy/agents';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3101-4000-8000-310000000001';
const orgIdB = '00000000-3101-4000-8000-310000000002';
const actorId = '00000000-3101-4000-8000-310000000010';

let sharedAgentId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Agent Test Org A', 'agent-test-a', 'starter', 'active'),
            ($2, 'Agent Test Org B', 'agent-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new AgentRegistryService(pool);
  const agent = await svc.registerAgent({
    organizationId: orgId,
    name: 'Shared Cert Agent',
    agentType: 'executive_copilot',
    capabilities: ['read_workflows', 'read_analytics'],
    automationDomains: ['hr'],
    createdBy: actorId,
  });
  sharedAgentId = agent.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM agent_memory WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM agents WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Agent OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. agents and agent_memory tables exist', async () => {
    for (const table of ['agents', 'agent_memory']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Agent registration ─────────────────────────────────────────────────
  it('2. Agent registration persists a record', async () => {
    const svc = new AgentRegistryService(pool);

    const agent = await svc.registerAgent({
      organizationId: orgId,
      name: 'Compliance Bot',
      agentType: 'compliance_copilot',
      capabilities: ['read_workflows', 'assess_risk'],
      automationDomains: ['governance'],
      createdBy: actorId,
    });

    expect(agent.id).toBeTruthy();
    expect(agent.organizationId).toBe(orgId);
    expect(agent.name).toBe('Compliance Bot');
    expect(agent.agentType).toBe('compliance_copilot');
    expect(agent.isActive).toBe(true);
  });

  // ── 3. Agent retrieval ────────────────────────────────────────────────────
  it('3. Agent retrieval returns the agent', async () => {
    const svc = new AgentRegistryService(pool);

    const agent = await svc.getAgent(orgId, sharedAgentId);
    expect(agent).not.toBeNull();
    expect(agent?.id).toBe(sharedAgentId);
    expect(agent?.organizationId).toBe(orgId);
  });

  // ── 4. Agent listing ──────────────────────────────────────────────────────
  it('4. Agent listing is tenant-scoped', async () => {
    const svc = new AgentRegistryService(pool);

    const agents = await svc.listAgents(orgId);
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
    for (const a of agents) {
      expect(a.organizationId).toBe(orgId);
    }
  });

  // ── 5. Agent listing by type ──────────────────────────────────────────────
  it('5. Agent listing filters by type', async () => {
    const svc = new AgentRegistryService(pool);

    const agents = await svc.listAgents(orgId, { agentType: 'executive_copilot' });
    expect(Array.isArray(agents)).toBe(true);
    for (const a of agents) {
      expect(a.agentType).toBe('executive_copilot');
    }
  });

  // ── 6. Agent memory storage ───────────────────────────────────────────────
  it('6. Agent memory storage works', async () => {
    const svc = new AgentMemoryService(pool);

    const memory = await svc.remember(orgId, sharedAgentId, 'episodic', 'last_action', {
      action: 'reviewed_report',
      timestamp: new Date().toISOString(),
    });

    expect(memory.id).toBeTruthy();
    expect(memory.organizationId).toBe(orgId);
    expect(memory.agentId).toBe(sharedAgentId);
    expect(memory.memoryType).toBe('episodic');
    expect(memory.key).toBe('last_action');
  });

  // ── 7. Agent memory recall ────────────────────────────────────────────────
  it('7. Agent memory recall returns entries', async () => {
    const svc = new AgentMemoryService(pool);

    const memories = await svc.recall(orgId, sharedAgentId, 'episodic');
    expect(Array.isArray(memories)).toBe(true);
    expect(memories.length).toBeGreaterThan(0);
    expect(memories.some((m) => m.key === 'last_action')).toBe(true);
  });

  // ── 8. Agent deactivation ─────────────────────────────────────────────────
  it('8. Agent deactivation sets isActive = false', async () => {
    const svc = new AgentRegistryService(pool);

    const agent = await svc.registerAgent({
      organizationId: orgId,
      name: 'Deactivate Me',
      agentType: 'custom',
      capabilities: [],
      automationDomains: [],
      createdBy: actorId,
    });

    const deactivated = await svc.deactivateAgent(orgId, agent.id);
    expect(deactivated.isActive).toBe(false);
  });

  // ── 9. Active listing excludes deactivated ────────────────────────────────
  it('9. Active listing excludes deactivated agents', async () => {
    const svc = new AgentRegistryService(pool);

    const active = await svc.listAgents(orgId, { isActive: true });
    expect(active.every((a) => a.isActive)).toBe(true);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A agents', async () => {
    const svc = new AgentRegistryService(pool);

    const agentsB = await svc.listAgents(orgIdB);
    const leaked = agentsB.some((a) => a.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
