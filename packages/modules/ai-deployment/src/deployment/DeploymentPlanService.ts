import type { Pool } from 'pg';
import type { DeploymentPlan, DeploymentResource, DeploymentResourceType } from '../types.js';

interface PlanRow {
  id: string;
  organization_id: string;
  natural_language_description: string;
  industry_hint: string | null;
  status: string;
  parsed_intent: Record<string, unknown>;
  resources: DeploymentResource[];
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
}

interface ResourceRow {
  id: string;
  deployment_plan_id: string;
  organization_id: string;
  resource_type: string;
  name: string;
  config: Record<string, unknown>;
  status: string;
  created_at: Date;
}

function mapPlan(row: PlanRow): DeploymentPlan {
  return {
    id: row.id,
    organizationId: row.organization_id,
    naturalLanguageDescription: row.natural_language_description,
    status: row.status as DeploymentPlan['status'],
    parsedIntent: row.parsed_intent,
    resources: row.resources,
    createdAt: row.created_at,
    ...(row.industry_hint !== null ? { industryHint: row.industry_hint } : {}),
    ...(row.error_message !== null ? { errorMessage: row.error_message } : {}),
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
  };
}

function mapResource(row: ResourceRow): DeploymentResource {
  return {
    id: row.id,
    deploymentPlanId: row.deployment_plan_id,
    resourceType: row.resource_type as DeploymentResourceType,
    name: row.name,
    config: row.config,
    status: row.status as DeploymentResource['status'],
    createdAt: row.created_at,
  };
}

interface ParsedResource {
  resourceType: DeploymentResourceType;
  name: string;
  config: Record<string, unknown>;
}

function parseDescriptionToResources(description: string): ParsedResource[] {
  const words = description
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 3);

  const departments: ParsedResource[] = words.map((w) => {
    const resource: ParsedResource = {
      resourceType: 'department',
      name: w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() + ' Department',
      config: {},
    };
    return resource;
  });

  const base: ParsedResource[] = [
    {
      resourceType: 'department',
      name: 'Main Department',
      config: {},
    },
    {
      resourceType: 'role',
      name: 'Admin',
      config: { permissions: ['*'] },
    },
    {
      resourceType: 'workflow',
      name: 'Default Workflow',
      config: { steps: [] },
    },
  ];
  return [...base, ...departments];
}

export class DeploymentPlanService {
  constructor(private readonly pool: Pool) {}

  async createPlan(
    orgId: string,
    description: string,
    industryHint?: string,
  ): Promise<DeploymentPlan> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<PlanRow>(
      `INSERT INTO deployment_plans (organization_id, natural_language_description, industry_hint)
       VALUES ($1, $2, $3)
       RETURNING *, resources::jsonb as resources`,
      [orgId, description, industryHint ?? null],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Failed to create deployment plan');
    return mapPlan(row);
  }

  async getPlan(orgId: string, planId: string): Promise<DeploymentPlan> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const planResult = await this.pool.query<PlanRow>(
      `SELECT dp.*,
        COALESCE(
          json_agg(dr.*) FILTER (WHERE dr.id IS NOT NULL),
          '[]'
        ) as resources
       FROM deployment_plans dp
       LEFT JOIN deployment_resources dr ON dr.deployment_plan_id = dp.id
       WHERE dp.id = $1 AND dp.organization_id = $2
       GROUP BY dp.id`,
      [planId, orgId],
    );

    const row = planResult.rows[0];
    if (row === undefined) throw new Error('Deployment plan not found');
    return mapPlan(row);
  }

  async listPlans(orgId: string, limit = 50): Promise<DeploymentPlan[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<PlanRow>(
      `SELECT dp.*,
        COALESCE(
          json_agg(dr.*) FILTER (WHERE dr.id IS NOT NULL),
          '[]'
        ) as resources
       FROM deployment_plans dp
       LEFT JOIN deployment_resources dr ON dr.deployment_plan_id = dp.id
       WHERE dp.organization_id = $1
       GROUP BY dp.id
       ORDER BY dp.created_at DESC
       LIMIT $2`,
      [orgId, limit],
    );

    return result.rows.map(mapPlan);
  }

  async analyzePlan(orgId: string, planId: string): Promise<DeploymentPlan> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    // Set status to analyzing
    await this.pool.query(
      `UPDATE deployment_plans SET status = 'analyzing' WHERE id = $1 AND organization_id = $2`,
      [planId, orgId],
    );

    const planResult = await this.pool.query<{
      natural_language_description: string;
      industry_hint: string | null;
    }>(
      'SELECT natural_language_description, industry_hint FROM deployment_plans WHERE id = $1 AND organization_id = $2',
      [planId, orgId],
    );

    const planData = planResult.rows[0];
    if (planData === undefined) throw new Error('Deployment plan not found');

    const parsedIntent: Record<string, unknown> = {
      description: planData.natural_language_description,
      ...(planData.industry_hint !== null ? { industry: planData.industry_hint } : {}),
    };

    const resourcesToCreate = parseDescriptionToResources(planData.natural_language_description);

    // Set status to provisioning
    await this.pool.query(
      `UPDATE deployment_plans SET status = 'provisioning', parsed_intent = $3
       WHERE id = $1 AND organization_id = $2`,
      [planId, orgId, JSON.stringify(parsedIntent)],
    );

    // Insert resources
    const insertedResources: DeploymentResource[] = [];
    for (const res of resourcesToCreate) {
      const resResult = await this.pool.query<ResourceRow>(
        `INSERT INTO deployment_resources (deployment_plan_id, organization_id, resource_type, name, config, status)
         VALUES ($1, $2, $3, $4, $5, 'created')
         RETURNING *`,
        [planId, orgId, res.resourceType, res.name, JSON.stringify(res.config)],
      );
      const resRow = resResult.rows[0];
      if (resRow !== undefined) {
        insertedResources.push(mapResource(resRow));
      }
    }

    // Set status to complete
    await this.pool.query(
      `UPDATE deployment_plans SET status = 'complete', completed_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [planId, orgId],
    );

    return this.getPlan(orgId, planId);
  }
}
