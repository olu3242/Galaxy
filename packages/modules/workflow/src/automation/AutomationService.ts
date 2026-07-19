import type { Pool } from 'pg';

interface AutomationRow {
  id: string;
  name: string;
  trigger_event: string;
  trigger_conditions: unknown[];
  actions: unknown[];
  is_active: boolean;
  created_at: string;
}

interface AutomationExecutionRow {
  id: string;
  status: string;
}

function evaluateConditions(conditions: unknown[], eventData: Record<string, unknown>): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((cond) => {
    if (typeof cond !== 'object' || cond === null) return true;
    const c = cond as Record<string, unknown>;
    const field = c.field;
    const operator = c.operator;
    const value = c.value;
    if (typeof field !== 'string') return true;
    const actual = eventData[field];
    if (operator === 'equals') return actual === value;
    if (operator === 'not_equals') return actual !== value;
    if (operator === 'contains' && typeof actual === 'string' && typeof value === 'string')
      return actual.includes(value);
    if (operator === 'exists') return actual !== undefined && actual !== null;
    return true;
  });
}

export class AutomationService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async evaluateTriggers(
    organizationId: string,
    eventType: string,
    eventData: Record<string, unknown>,
  ): Promise<{ automationId: string; matched: boolean }[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AutomationRow>(
      `SELECT id, name, trigger_event, trigger_conditions, actions, is_active, created_at
       FROM automations WHERE organization_id = $1 AND trigger_event = $2 AND is_active = true`,
      [organizationId, eventType],
    );
    return result.rows.map((row) => {
      const conditions = Array.isArray(row.trigger_conditions) ? row.trigger_conditions : [];
      const matched = evaluateConditions(conditions, eventData);
      return { automationId: row.id, matched };
    });
  }

  async executeAutomation(
    organizationId: string,
    automationId: string,
    eventData: Record<string, unknown>,
    correlationId: string,
  ): Promise<{ executionId: string; status: string }> {
    await this.setTenantContext(organizationId);
    const insertResult = await this.pool.query<AutomationExecutionRow>(
      `INSERT INTO automation_executions
         (organization_id, automation_id, trigger_event_type, trigger_data, status, correlation_id, started_at)
       SELECT $1, $2, a.trigger_event, $3, 'running', $4, NOW()
       FROM automations a WHERE a.organization_id = $1 AND a.id = $2
       RETURNING id, status`,
      [organizationId, automationId, JSON.stringify(eventData), correlationId],
    );
    const execRow = insertResult.rows[0];
    if (!execRow) throw new Error(`Automation not found: ${automationId}`);
    const executionId = execRow.id;
    await this.pool.query(
      `UPDATE automation_executions SET status = 'completed', completed_at = NOW(), result = '{"success": true}'::jsonb
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, executionId],
    );
    return { executionId, status: 'completed' };
  }

  async listAutomations(
    organizationId: string,
    opts?: { isActive?: boolean },
  ): Promise<
    { id: string; name: string; triggerEvent: string; isActive: boolean; createdAt: string }[]
  > {
    await this.setTenantContext(organizationId);
    const conditions = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    if (opts?.isActive !== undefined) {
      conditions.push(`is_active = $2`);
      params.push(opts.isActive);
    }
    const result = await this.pool.query<AutomationRow>(
      `SELECT id, name, trigger_event, is_active, created_at FROM automations WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params,
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      triggerEvent: row.trigger_event,
      isActive: row.is_active,
      createdAt: row.created_at,
    }));
  }
}
