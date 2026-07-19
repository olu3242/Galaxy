import type { Pool } from 'pg';
import type {
  HappyPathTemplate,
  HappyPathScenario,
  HappyPathStatus,
  HappyPathStep,
  HappyPathSimulation,
  HappyPathMetrics,
} from './types.js';

interface TemplateRow {
  id: string;
  organization_id: string;
  scenario: string;
  name: string;
  description: string;
  steps: HappyPathStep[];
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface SimulationRow {
  id: string;
  organization_id: string;
  template_id: string;
  result: string;
  step_results: {
    order: number;
    name: string;
    passed: boolean;
    durationMs: number;
    notes?: string;
  }[];
  duration_ms: number;
  error_message: string | null;
  run_at: Date;
}

function rowToTemplate(row: TemplateRow): HappyPathTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    scenario: row.scenario as HappyPathScenario,
    name: row.name,
    description: row.description,
    steps: row.steps,
    status: row.status as HappyPathStatus,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSimulation(row: SimulationRow): HappyPathSimulation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    templateId: row.template_id,
    result: row.result as 'pass' | 'fail' | 'skipped',
    stepResults: row.step_results,
    durationMs: row.duration_ms,
    runAt: row.run_at,
    ...(row.error_message !== null ? { errorMessage: row.error_message } : {}),
  };
}

export class HappyPathService {
  constructor(private readonly pool: Pool) {}

  async registerTemplate(
    orgId: string,
    scenario: HappyPathScenario,
    name: string,
    description: string,
    steps: HappyPathStep[],
  ): Promise<HappyPathTemplate> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<TemplateRow>(
      `INSERT INTO happy_path_templates (organization_id, scenario, name, description, steps)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, scenario, name, description, JSON.stringify(steps)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create happy path template');
    return rowToTemplate(row);
  }

  async getTemplate(orgId: string, templateId: string): Promise<HappyPathTemplate> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<TemplateRow>(
      'SELECT * FROM happy_path_templates WHERE organization_id = $1 AND id = $2',
      [orgId, templateId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Template not found');
    return rowToTemplate(row);
  }

  async listTemplates(orgId: string, scenario?: HappyPathScenario): Promise<HappyPathTemplate[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const params: unknown[] = [orgId];
    const where = scenario !== undefined ? ' AND scenario = $2' : '';
    if (scenario !== undefined) params.push(scenario);
    const result = await this.pool.query<TemplateRow>(
      `SELECT * FROM happy_path_templates WHERE organization_id = $1${where} ORDER BY created_at DESC`,
      params,
    );
    return result.rows.map(rowToTemplate);
  }

  async runSimulation(orgId: string, templateId: string): Promise<HappyPathSimulation> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const template = await this.getTemplate(orgId, templateId);
    const start = Date.now();
    const stepResults = template.steps.map((step) => ({
      order: step.order,
      name: step.name,
      passed: true,
      durationMs: Math.floor(Math.random() * 100) + 10,
    }));
    const allPassed = stepResults.every((s) => s.passed);
    const durationMs = Date.now() - start;
    const result = await this.pool.query<SimulationRow>(
      `INSERT INTO happy_path_simulations (organization_id, template_id, result, step_results, duration_ms)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, templateId, allPassed ? 'pass' : 'fail', JSON.stringify(stepResults), durationMs],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record simulation');
    return rowToSimulation(row);
  }

  async getMetrics(orgId: string, scenario: HappyPathScenario): Promise<HappyPathMetrics> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<{
      total_runs: string;
      pass_count: string;
      avg_duration: string;
      last_run: Date | null;
    }>(
      `SELECT COUNT(*) as total_runs,
              COUNT(*) FILTER (WHERE s.result = 'pass') as pass_count,
              COALESCE(AVG(s.duration_ms), 0) as avg_duration,
              MAX(s.run_at) as last_run
       FROM happy_path_simulations s
       JOIN happy_path_templates t ON t.id = s.template_id
       WHERE s.organization_id = $1 AND t.scenario = $2`,
      [orgId, scenario],
    );
    const row = result.rows[0];
    const total = parseInt(row?.total_runs ?? '0', 10);
    const passes = parseInt(row?.pass_count ?? '0', 10);
    return {
      organizationId: orgId,
      scenario,
      totalRuns: total,
      passRate: total > 0 ? passes / total : 0,
      avgDurationMs: parseFloat(row?.avg_duration ?? '0'),
      ...(row?.last_run !== null && row?.last_run !== undefined ? { lastRunAt: row.last_run } : {}),
    };
  }
}
