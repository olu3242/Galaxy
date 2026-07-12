import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('org_hierarchy_nodes')
    .ifNotExists()
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn.sql('gen_random_uuid()')))
    .addColumn('organization_id', 'uuid', (c) =>
      c.notNull().references('organizations.id').onDelete('cascade'),
    )
    .addColumn('parent_id', 'uuid', (c) =>
      c.references('org_hierarchy_nodes.id').onDelete('set null'),
    )
    .addColumn('level', 'varchar(32)', (c) => c.notNull())
    .addColumn('name', 'varchar(255)', (c) => c.notNull())
    .addColumn('code', 'varchar(64)')
    .addColumn('metadata', 'jsonb', (c) => c.notNull().defaultTo('{}'))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .execute();

  await db.schema
    .createIndex('idx_org_hierarchy_nodes_org')
    .ifNotExists()
    .on('org_hierarchy_nodes')
    .columns(['organization_id', 'level', 'is_active'])
    .execute();

  await db.schema
    .createTable('abac_policies')
    .ifNotExists()
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn.sql('gen_random_uuid()')))
    .addColumn('organization_id', 'uuid', (c) =>
      c.notNull().references('organizations.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (c) => c.notNull())
    .addColumn('description', 'text')
    .addColumn('resource', 'varchar(128)', (c) => c.notNull())
    .addColumn('action', 'varchar(128)', (c) => c.notNull())
    .addColumn('conditions', 'jsonb', (c) => c.notNull().defaultTo('[]'))
    .addColumn('effect', 'varchar(8)', (c) => c.notNull())
    .addColumn('priority', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .execute();

  await db.schema
    .createIndex('idx_abac_policies_lookup')
    .ifNotExists()
    .on('abac_policies')
    .columns(['organization_id', 'resource', 'action', 'is_active'])
    .execute();

  await db.schema
    .createTable('delegations')
    .ifNotExists()
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn.sql('gen_random_uuid()')))
    .addColumn('organization_id', 'uuid', (c) =>
      c.notNull().references('organizations.id').onDelete('cascade'),
    )
    .addColumn('delegator_id', 'uuid', (c) => c.notNull())
    .addColumn('delegatee_id', 'uuid', (c) => c.notNull())
    .addColumn('role_id', 'uuid')
    .addColumn('permissions', 'text[]', (c) => c.notNull().defaultTo('{}'))
    .addColumn('reason', 'varchar(64)', (c) => c.notNull())
    .addColumn('start_at', 'timestamptz', (c) => c.notNull())
    .addColumn('end_at', 'timestamptz', (c) => c.notNull())
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('approved_by', 'uuid')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .execute();

  await db.schema
    .createIndex('idx_delegations_delegatee')
    .ifNotExists()
    .on('delegations')
    .columns(['organization_id', 'delegatee_id', 'is_active'])
    .execute();

  await db.schema
    .createTable('approval_rules')
    .ifNotExists()
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn.sql('gen_random_uuid()')))
    .addColumn('organization_id', 'uuid', (c) =>
      c.notNull().references('organizations.id').onDelete('cascade'),
    )
    .addColumn('workflow_type', 'varchar(128)')
    .addColumn('department_id', 'uuid')
    .addColumn('min_amount', 'numeric')
    .addColumn('max_amount', 'numeric')
    .addColumn('min_risk_score', 'numeric')
    .addColumn('max_risk_score', 'numeric')
    .addColumn('required_role', 'varchar(128)', (c) => c.notNull())
    .addColumn('tier', 'smallint', (c) => c.notNull())
    .addColumn('requires_multiple_approvers', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('approver_count', 'integer', (c) => c.notNull().defaultTo(1))
    .addColumn('escalation_after_hours', 'integer', (c) => c.notNull().defaultTo(24))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .execute();

  await db.schema
    .createIndex('idx_approval_rules_lookup')
    .ifNotExists()
    .on('approval_rules')
    .columns(['organization_id', 'workflow_type', 'tier'])
    .execute();

  await db.schema
    .createTable('agent_permission_profiles')
    .ifNotExists()
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(db.fn.sql('gen_random_uuid()')))
    .addColumn('organization_id', 'uuid', (c) =>
      c.notNull().references('organizations.id').onDelete('cascade'),
    )
    .addColumn('agent_type', 'varchar(64)', (c) => c.notNull())
    .addColumn('agent_name', 'varchar(255)', (c) => c.notNull())
    .addColumn('allowed_tools', 'text[]', (c) => c.notNull().defaultTo('{}'))
    .addColumn('accessible_knowledge_sources', 'text[]', (c) => c.notNull().defaultTo('{}'))
    .addColumn('writable_resources', 'text[]', (c) => c.notNull().defaultTo('{}'))
    .addColumn('approval_limits', 'jsonb', (c) => c.notNull().defaultTo('{}'))
    .addColumn('escalation_rules', 'jsonb', (c) => c.notNull().defaultTo('[]'))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(db.fn.sql('NOW()')))
    .execute();

  await db.schema
    .createIndex('idx_agent_permission_profiles_type')
    .ifNotExists()
    .on('agent_permission_profiles')
    .columns(['organization_id', 'agent_type', 'is_active'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('agent_permission_profiles').ifExists().execute();
  await db.schema.dropTable('approval_rules').ifExists().execute();
  await db.schema.dropTable('delegations').ifExists().execute();
  await db.schema.dropTable('abac_policies').ifExists().execute();
  await db.schema.dropTable('org_hierarchy_nodes').ifExists().execute();
}
