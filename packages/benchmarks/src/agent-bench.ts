import { bench, describe } from 'vitest';
import { DAGPlanner, ConsensusEngine, AgentBus } from '@galaxy/agents';
import { WorkflowGeneratorService } from '@galaxy/workflow-generator';
import type { DAGTask } from '@galaxy/agents';

// ---------------------------------------------------------------------------
// DAGPlanner benchmarks
// ---------------------------------------------------------------------------

describe('DAGPlanner', () => {
  const planner = new DAGPlanner();

  const make10Tasks = (): DAGTask[] =>
    Array.from({ length: 10 }, (_, i) => ({
      id: `task-${i}`,
      name: `Task ${i}`,
      agentType: 'operations_copilot',
      input: { index: i },
      // Each task depends on the previous one (linear chain)
      dependsOn: i === 0 ? [] : [`task-${i - 1}`],
    }));

  const make50Tasks = (): DAGTask[] =>
    Array.from({ length: 50 }, (_, i) => ({
      id: `t${i}`,
      name: `Task ${i}`,
      agentType: 'operations_copilot',
      input: { index: i },
      // Fan-in: every task after the first two depends on the first two
      dependsOn: i < 2 ? [] : ['t0', 't1'],
    }));

  bench('build plan with 10 nodes', () => {
    planner.buildPlan('org-bench', make10Tasks(), 'corr-bench-10');
  });

  bench('topological sort 50 nodes', () => {
    planner.buildPlan('org-bench', make50Tasks(), 'corr-bench-50');
  });

  bench('execute empty plan (overhead)', async () => {
    const plan = planner.buildPlan('org-bench', [], 'corr-empty');
    await planner.execute(plan, async () => ({}));
  });
});

// ---------------------------------------------------------------------------
// ConsensusEngine benchmarks
// ---------------------------------------------------------------------------

describe('ConsensusEngine', () => {
  bench('cast vote (in-memory)', () => {
    const engine = new ConsensusEngine();
    const proposal = engine.createProposal(
      'org-bench',
      'approve-purchase',
      { amount: 500 },
      ['agent-1'],
      0.6,
    );
    engine.castVote(proposal.id, 'agent-1', 'approve', 0.9, 'within budget');
  });

  bench('finalize majority session 5 voters', () => {
    const engine = new ConsensusEngine();
    const agents = ['a1', 'a2', 'a3', 'a4', 'a5'];
    const proposal = engine.createProposal(
      'org-bench',
      'deploy-feature',
      { feature: 'loop-v2' },
      agents,
      0.6,
    );
    for (const agentId of agents) {
      engine.castVote(proposal.id, agentId, 'approve', 0.85, 'approved');
    }
  });
});

// ---------------------------------------------------------------------------
// AgentBus benchmarks
// ---------------------------------------------------------------------------

describe('AgentBus', () => {
  bench('publish direct message', () => {
    const bus = new AgentBus();
    const unsubscribe = bus.subscribe({
      agentId: 'receiver',
      organizationId: 'org-bench',
      handler: () => undefined,
    });
    bus.publish('sender', 'receiver', 'org-bench', 'ping', { data: 1 });
    unsubscribe();
  });

  bench('broadcast to 10 subscribers', () => {
    const bus = new AgentBus();
    const unsubs = Array.from({ length: 10 }, (_, i) =>
      bus.subscribe({
        agentId: `agent-${i}`,
        organizationId: 'org-bench',
        handler: () => undefined,
      }),
    );
    // toAgentId = 'broadcast' triggers the broadcast channel
    bus.publish('sender', 'broadcast', 'org-bench', 'announcement', { msg: 'hello' });
    unsubs.forEach((u) => u());
  });

  bench('1000 messages/sec throughput', () => {
    const bus = new AgentBus();
    const unsubscribe = bus.subscribe({
      agentId: 'sink',
      organizationId: 'org-bench',
      handler: () => undefined,
    });
    for (let i = 0; i < 1000; i++) {
      bus.publish('source', 'sink', 'org-bench', 'event', { seq: i });
    }
    unsubscribe();
  });
});

// ---------------------------------------------------------------------------
// WorkflowGeneratorService (NL parsing) benchmarks
// ---------------------------------------------------------------------------

type MockPool = {
  query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

const makePool = (description: string): MockPool => ({
  query: async (_sql: string, _params: unknown[]) => ({
    rows: [
      {
        id: 'req-bench',
        organization_id: 'org-bench',
        natural_language_description: description,
        industry_hint: null,
        status: 'pending',
        generated_workflow: null,
        steps: null,
        error_message: null,
        created_at: new Date(),
        completed_at: null,
      },
    ],
    rowCount: 1,
  }),
});

describe('NLWorkflowParser', () => {
  bench('parse simple 3-step workflow', async () => {
    const description = 'submit form, then review, then approve';
    const svc = new WorkflowGeneratorService(makePool(description) as never);
    await svc.createRequest('org-bench', description);
  });

  bench('parse complex 10-step SOP', async () => {
    const description =
      'receive request, then validate input, then assign reviewer, then conduct review, ' +
      'then escalate if needed, then approve level 1, then approve level 2, then notify requester, ' +
      'then archive document, then close ticket';
    const svc = new WorkflowGeneratorService(makePool(description) as never);
    await svc.createRequest('org-bench', description);
  });
});
