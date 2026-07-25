/**
 * Autonomous Intelligence Certification Test Suite
 *
 * Certifies the Autonomous Intelligence module lifecycle:
 * 1.  autonomous_agents table exists with expected columns
 * 2.  Agent registration creates a retrievable agent record
 * 3.  Agent status transitions are persisted
 * 4.  Agent metrics can be updated
 * 5.  Agent actions can be recorded and completed
 * 6.  Failed actions are recorded with error message
 * 7.  Action history is scoped to the agent
 * 8.  Insights can be recorded and retrieved
 * 9.  Insight application sets appliedAt timestamp
 * 10. Cross-tenant isolation — org B cannot see org A's agents
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import {
  AgentRegistryService,
  AgentActionService,
  AgentInsightService,
} from '@galaxy/autonomous-intelligence';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-1601-4000-8000-160000000001';
const orgIdB = '00000000-1601-4000-8000-160000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'AutoInt Test Org A', 'autoint-test-a', 'starter', 'active'),
            ($2, 'AutoInt Test Org B', 'autoint-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM agent_insights WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM agent_actions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM autonomous_agents WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Autonomous Intelligence Certification', () => {
  // ── 1. Table exists ────────────────────────────────────────────────────────
  it('1. autonomous_agents table exists with expected columns', async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'autonomous_agents' AND table_schema = 'public'`,
    );
    expect(Number(r.rows[0]?.count ?? 0), 'autonomous_agents must have columns').toBeGreaterThan(0);
  });

  // ── 2. Agent registration ─────────────────────────────────────────────────
  it('2. Agent registration creates a retrievable agent record', async () => {
    const svc = new AgentRegistryService(pool);

    const agent = await svc.registerAgent(orgId, 'learning', { threshold: 0.8 });

    expect(agent.id).toBeTruthy();
    expect(agent.organizationId).toBe(orgId);
    expect(agent.agentType).toBe('learning');

    const fetched = await svc.getAgent(orgId, agent.id);
    expect(fetched.id).toBe(agent.id);
  });

  // ── 3. Status transitions ─────────────────────────────────────────────────
  it('3. Agent status transitions are persisted', async () => {
    const svc = new AgentRegistryService(pool);

    const agent = await svc.registerAgent(orgId, 'guardian', {});
    await svc.updateAgentStatus(orgId, agent.id, 'running');
    const running = await svc.getAgent(orgId, agent.id);
    expect(running.status).toBe('running');

    await svc.updateAgentStatus(orgId, agent.id, 'paused');
    const paused = await svc.getAgent(orgId, agent.id);
    expect(paused.status).toBe('paused');
  });

  // ── 4. Metrics update ─────────────────────────────────────────────────────
  it('4. Agent metrics can be updated', async () => {
    const svc = new AgentRegistryService(pool);

    const agent = await svc.registerAgent(orgId, 'intelligence', {});
    await svc.updateAgentMetrics(orgId, agent.id, {
      actionsExecuted: 10,
      successRate: 0.9,
      avgLatencyMs: 250,
    });

    const updated = await svc.getAgent(orgId, agent.id);
    expect(updated.metrics).toBeDefined();
  });

  // ── 5. Action recording and completion ────────────────────────────────────
  it('5. Agent actions can be recorded and completed', async () => {
    const svc = new AgentRegistryService(pool);
    const actionSvc = new AgentActionService(pool);

    const agent = await svc.registerAgent(orgId, 'evolution', { version: '1' });

    const action = await actionSvc.recordAction(orgId, agent.id, 'analyze_workflow', {
      workflowId: 'wf-test-001',
    });
    expect(action.id).toBeTruthy();
    expect(action.status).toBe('pending');

    const completed = await actionSvc.completeAction(orgId, action.id, {
      result: 'analysis_complete',
    });
    expect(completed.status).toBe('completed');
  });

  // ── 6. Failed action recording ────────────────────────────────────────────
  it('6. Failed actions are recorded with error message', async () => {
    const svc = new AgentRegistryService(pool);
    const actionSvc = new AgentActionService(pool);

    const agent = await svc.registerAgent(orgId, 'healing', {});
    const action = await actionSvc.recordAction(orgId, agent.id, 'remediate', {
      target: 'wf-xyz',
    });

    const failed = await actionSvc.failAction(orgId, action.id, 'Target not reachable');
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('Target not reachable');
  });

  // ── 7. Action history scoping ─────────────────────────────────────────────
  it('7. Action history is scoped to the agent', async () => {
    const svc = new AgentRegistryService(pool);
    const actionSvc = new AgentActionService(pool);

    const agent = await svc.registerAgent(orgId, 'learning', { historyTest: true });
    await actionSvc.recordAction(orgId, agent.id, 'pattern_scan', {});

    const history = await actionSvc.getActions(orgId, agent.id, 10);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    for (const a of history) {
      expect(a.agentId).toBe(agent.id);
    }
  });

  // ── 8. Insight recording ──────────────────────────────────────────────────
  it('8. Insights can be recorded and retrieved', async () => {
    const svc = new AgentRegistryService(pool);
    const insightSvc = new AgentInsightService(pool);

    const agent = await svc.registerAgent(orgId, 'intelligence', { insightTest: true });

    const insight = await insightSvc.recordInsight(
      orgId,
      agent.id,
      'bottleneck_detected',
      'Approval step bottleneck',
      'Approval step is causing delays',
      0.87,
      { stepId: 'step-001' },
    );
    expect(insight.id).toBeTruthy();
    expect(insight.confidence).toBeGreaterThan(0);

    const insights = await insightSvc.getInsights(orgId, agent.id, 10);
    expect(Array.isArray(insights)).toBe(true);
    expect(insights.some((i) => i.id === insight.id)).toBe(true);
  });

  // ── 9. Insight application ────────────────────────────────────────────────
  it('9. Insight application sets appliedAt timestamp', async () => {
    const svc = new AgentRegistryService(pool);
    const insightSvc = new AgentInsightService(pool);

    const agent = await svc.registerAgent(orgId, 'learning', { applyTest: true });
    const insight = await insightSvc.recordInsight(
      orgId,
      agent.id,
      'optimization_opportunity',
      'Parallelise steps',
      'Steps 3 and 4 can run in parallel',
      0.92,
      {},
    );

    const applied = await insightSvc.applyInsight(orgId, insight.id);
    expect(applied.appliedAt).toBeDefined();
    expect(applied.appliedAt).not.toBeNull();
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A agents', async () => {
    const svc = new AgentRegistryService(pool);

    await svc.registerAgent(orgId, 'guardian', { isolation: true });

    const agentsB = await svc.listAgents(orgIdB);
    const leaked = agentsB.some((a) => a.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
