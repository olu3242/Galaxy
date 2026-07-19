import type { Pool } from 'pg';

export type LifecyclePhase =
  | 'OBSERVE'
  | 'UNDERSTAND'
  | 'RETRIEVE_CONTEXT'
  | 'REASON'
  | 'PLAN'
  | 'DELEGATE'
  | 'EXECUTE'
  | 'VERIFY'
  | 'LEARN'
  | 'OPTIMIZE'
  | 'REPORT';

export interface LifecyclePhaseEntry {
  phase: LifecyclePhase;
  enteredAt: string;
  exitedAt?: string;
  durationMs?: number;
  observations?: string;
  result?: unknown;
}

export interface LifecycleTrace {
  executionId: string;
  agentType: string;
  organizationId: string;
  correlationId: string;
  phases: LifecyclePhaseEntry[];
  totalDurationMs: number;
  outcome: 'completed' | 'failed' | 'delegated' | 'escalated';
}

export interface LifecycleContext {
  executionId: string;
  agentType: string;
  organizationId: string;
  correlationId: string;
  input: Record<string, unknown>;
  phaseResults: Partial<Record<LifecyclePhase, unknown>>;
  currentPhase: LifecyclePhase;
}

export type PhaseHandler = (ctx: LifecycleContext) => Promise<unknown>;

export interface LifecycleRunParams {
  executionId: string;
  agentType: string;
  organizationId: string;
  correlationId: string;
  input: Record<string, unknown>;
  handlers: Partial<Record<LifecyclePhase, PhaseHandler>>;
}

const ORDERED_PHASES: LifecyclePhase[] = [
  'OBSERVE',
  'UNDERSTAND',
  'RETRIEVE_CONTEXT',
  'REASON',
  'PLAN',
  'DELEGATE',
  'EXECUTE',
  'VERIFY',
  'LEARN',
  'OPTIMIZE',
  'REPORT',
];

export class AgentLifecycleManager {
  constructor(private readonly pool: Pool) {}

  async run(params: LifecycleRunParams): Promise<LifecycleTrace> {
    const { executionId, agentType, organizationId, correlationId, input, handlers } = params;

    const startMs = Date.now();
    const phases: LifecyclePhaseEntry[] = [];

    const trace: LifecycleTrace = {
      executionId,
      agentType,
      organizationId,
      correlationId,
      phases,
      totalDurationMs: 0,
      outcome: 'completed',
    };

    const ctx: LifecycleContext = {
      executionId,
      agentType,
      organizationId,
      correlationId,
      input,
      phaseResults: {},
      currentPhase: 'OBSERVE',
    };

    try {
      for (const phase of ORDERED_PHASES) {
        ctx.currentPhase = phase;
        await this.enterPhase(trace, phase);

        const handler = handlers[phase];
        let result: unknown = undefined;

        if (handler !== undefined) {
          result = await handler(ctx);
        }

        ctx.phaseResults[phase] = result;
        await this.exitPhase(trace, phase, result);
      }

      trace.totalDurationMs = Date.now() - startMs;
      trace.outcome = 'completed';
    } catch (err: unknown) {
      trace.totalDurationMs = Date.now() - startMs;

      // Exit the current phase with failure
      const lastPhase = phases[phases.length - 1];
      if (lastPhase !== undefined && lastPhase.exitedAt === undefined) {
        const now = new Date().toISOString();
        lastPhase.exitedAt = now;
        lastPhase.durationMs =
          new Date(now).getTime() - new Date(lastPhase.enteredAt).getTime();
        lastPhase.result = { error: err instanceof Error ? err.message : String(err) };
      }

      trace.outcome = 'failed';
      await this.persistTrace(trace);
      throw err;
    }

    await this.persistTrace(trace);
    return trace;
  }

  private async enterPhase(trace: LifecycleTrace, phase: LifecyclePhase): Promise<void> {
    trace.phases.push({
      phase,
      enteredAt: new Date().toISOString(),
    });
  }

  private async exitPhase(
    trace: LifecycleTrace,
    phase: LifecyclePhase,
    result: unknown,
  ): Promise<void> {
    const entry = trace.phases.find((p) => p.phase === phase && p.exitedAt === undefined);
    if (entry === undefined) return;

    const now = new Date().toISOString();
    entry.exitedAt = now;
    entry.durationMs = new Date(now).getTime() - new Date(entry.enteredAt).getTime();
    entry.result = result;
  }

  private async persistTrace(trace: LifecycleTrace): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      trace.organizationId,
    ]);

    await this.pool.query(
      `INSERT INTO agent_lifecycle_traces
         (organization_id, execution_id, agent_type, correlation_id, phases,
          total_duration_ms, outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (execution_id) DO UPDATE
         SET phases = EXCLUDED.phases,
             total_duration_ms = EXCLUDED.total_duration_ms,
             outcome = EXCLUDED.outcome`,
      [
        trace.organizationId,
        trace.executionId,
        trace.agentType,
        trace.correlationId,
        JSON.stringify(trace.phases),
        trace.totalDurationMs,
        trace.outcome,
      ],
    );
  }
}
