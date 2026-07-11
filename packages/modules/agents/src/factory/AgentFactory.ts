import type { Pool } from 'pg';
import type { Agent, AgentCapability, AgentType } from '../types.js';
import { ALL_MANIFESTS } from '../manifests/index.js';

export interface AgentProvisionConfig {
  organizationId: string;
  agentType: AgentType;
  createdBy: string;
  nameOverride?: string;
  configOverride?: Record<string, unknown>;
}

interface AgentConfigRow {
  id: string;
  organization_id: string;
  name: string;
  agent_type: string;
  capabilities: string[];
  automation_domains: string[];
  config: Record<string, unknown>;
  is_active: boolean;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export class AgentFactory {
  constructor(private readonly pool: Pool) {}

  async provision(config: AgentProvisionConfig): Promise<Agent> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      config.organizationId,
    ]);

    const manifest = ALL_MANIFESTS.find((m) => m.agentType === config.agentType);
    if (!manifest) {
      throw new Error(`No manifest found for agent type: ${config.agentType}`);
    }

    const name = config.nameOverride ?? manifest.name;
    const agentConfig: Record<string, unknown> = {
      manifestId: manifest.id,
      defaultStrategy: manifest.defaultStrategy,
      maxConcurrentTasks: manifest.maxConcurrentTasks,
      requiresHumanApprovalFor: manifest.requiresHumanApprovalFor,
      impactTier: manifest.impactTier,
      ...(config.configOverride ?? {}),
    };

    const result = await this.pool.query<AgentConfigRow>(
      `INSERT INTO agent_configs
         (id, organization_id, name, agent_type, capabilities, automation_domains,
          config, is_active, version, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, 1, $7, NOW(), NOW())
       RETURNING *`,
      [
        config.organizationId,
        name,
        manifest.agentType,
        JSON.stringify(manifest.capabilities),
        JSON.stringify(manifest.automationDomains),
        JSON.stringify(agentConfig),
        config.createdBy,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to provision agent — INSERT returned no row');

    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      agentType: row.agent_type as AgentType,
      capabilities: row.capabilities as AgentCapability[],
      automationDomains: row.automation_domains,
      config: row.config,
      isActive: row.is_active,
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(manifest.fullName ? { description: manifest.description } : {}),
    };
  }
}
