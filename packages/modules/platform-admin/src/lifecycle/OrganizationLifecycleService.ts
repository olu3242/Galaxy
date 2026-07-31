import type { Pool } from 'pg';

export type LifecycleStage = 'onboarding' | 'activation' | 'growth' | 'mature' | 'offboarding';

export interface LifecycleState {
  organizationId: string;
  stage: LifecycleStage;
  completedSteps: string[];
  pendingSteps: string[];
  healthScore: number;
  lastActivityAt: string | null;
  updatedAt: string;
}

export class OrganizationLifecycleService {
  constructor(private readonly pool: Pool) {}

  async getLifecycleState(orgId: string): Promise<LifecycleState> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<{
      member_count: string;
      workflow_count: string;
      last_activity: string | null;
    }>(
      `SELECT
         COUNT(DISTINCT m.id)::text AS member_count,
         COUNT(DISTINCT w.id)::text AS workflow_count,
         MAX(al.created_at) AS last_activity
       FROM organizations o
       LEFT JOIN members m ON m.organization_id = o.id
       LEFT JOIN workflows w ON w.organization_id = o.id
       LEFT JOIN audit_logs al ON al.organization_id = o.id
       WHERE o.id = $1`,
      [orgId],
    );

    const row = result.rows[0];
    const memberCount = parseInt(row?.member_count ?? '0', 10);
    const workflowCount = parseInt(row?.workflow_count ?? '0', 10);

    const stage = this.determineStage(memberCount, workflowCount);
    const completedSteps = this.getCompletedSteps(memberCount, workflowCount);
    const pendingSteps = this.getPendingSteps(memberCount, workflowCount);
    const healthScore = Math.min(100, memberCount * 5 + workflowCount * 10);

    return {
      organizationId: orgId,
      stage,
      completedSteps,
      pendingSteps,
      healthScore,
      lastActivityAt: row?.last_activity ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  async startOnboarding(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    await this.pool.query(
      `INSERT INTO audit_logs (organization_id, actor_type, action, resource_type, resource_id, correlation_id)
       VALUES ($1, 'system', 'onboarding_started', 'organization', $1, gen_random_uuid())`,
      [orgId],
    );
  }

  async completeOnboarding(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    await this.pool.query(
      `INSERT INTO audit_logs (organization_id, actor_type, action, resource_type, resource_id, correlation_id)
       VALUES ($1, 'system', 'onboarding_completed', 'organization', $1, gen_random_uuid())`,
      [orgId],
    );
  }

  async triggerOffboarding(orgId: string, _reason: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    await this.pool.query(
      `INSERT INTO audit_logs (organization_id, actor_type, action, resource_type, resource_id, correlation_id)
       VALUES ($1, 'system', 'offboarding_started', 'organization', $1, gen_random_uuid())`,
      [orgId],
    );
  }

  private determineStage(memberCount: number, workflowCount: number): LifecycleStage {
    if (memberCount === 0) return 'onboarding';
    if (memberCount < 5 || workflowCount < 2) return 'activation';
    if (memberCount < 20 || workflowCount < 10) return 'growth';
    return 'mature';
  }

  private getCompletedSteps(memberCount: number, workflowCount: number): string[] {
    const steps: string[] = [];
    if (memberCount > 0) steps.push('first_member_added');
    if (memberCount >= 3) steps.push('team_setup');
    if (workflowCount > 0) steps.push('first_workflow_created');
    if (workflowCount >= 5) steps.push('workflows_operational');
    return steps;
  }

  private getPendingSteps(memberCount: number, workflowCount: number): string[] {
    const steps: string[] = [];
    if (memberCount === 0) steps.push('add_first_member');
    if (memberCount < 3) steps.push('setup_team');
    if (workflowCount === 0) steps.push('create_first_workflow');
    if (workflowCount < 5) steps.push('create_more_workflows');
    return steps;
  }
}
