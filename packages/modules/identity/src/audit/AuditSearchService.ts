import type { Pool } from 'pg';

export interface AuditLogDoc {
  id: number;
  organizationId: string;
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  correlationId: string;
  causationId: string | null;
  createdAt: string;
}

export interface AuditSearchQuery {
  organizationId: string;
  q?: string;
  actorType?: string;
  action?: string;
  resourceType?: string;
  from?: string;
  to?: string;
  size?: number;
  from_offset?: number;
}

export interface AuditSearchResult {
  hits: AuditLogDoc[];
  total: number;
  source: 'elasticsearch' | 'postgres';
}

interface ElasticsearchHit {
  _source: AuditLogDoc;
}

interface ElasticsearchResponse {
  hits: {
    total: { value: number };
    hits: ElasticsearchHit[];
  };
}

export class AuditSearchService {
  private readonly esUrl: string | null;

  constructor(
    private readonly pool: Pool,
    elasticsearchUrl?: string,
  ) {
    this.esUrl = elasticsearchUrl ?? process.env.ELASTICSEARCH_URL ?? null;
  }

  private readonly indexName = 'galaxy_audit_logs';

  async indexDocument(doc: AuditLogDoc): Promise<void> {
    if (!this.esUrl) return;

    const url = `${this.esUrl}/${this.indexName}/_doc/${String(doc.id)}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });

    if (!response.ok && response.status !== 409) {
      const body = await response.text();
      throw new Error(`Elasticsearch index error ${String(response.status)}: ${body}`);
    }
  }

  async search(query: AuditSearchQuery): Promise<AuditSearchResult> {
    if (this.esUrl) {
      return this.searchElasticsearch(query);
    }
    return this.searchPostgres(query);
  }

  private async searchElasticsearch(query: AuditSearchQuery): Promise<AuditSearchResult> {
    const must: unknown[] = [{ term: { organizationId: query.organizationId } }];

    if (query.q) {
      must.push({
        multi_match: {
          query: query.q,
          fields: ['action', 'actorType', 'resourceType', 'resourceId', 'actorId'],
        },
      });
    }

    if (query.actorType) must.push({ term: { actorType: query.actorType } });
    if (query.action) must.push({ term: { action: query.action } });
    if (query.resourceType) must.push({ term: { resourceType: query.resourceType } });

    if (query.from ?? query.to) {
      const range: Record<string, string> = {};
      if (query.from) range.gte = query.from;
      if (query.to) range.lte = query.to;
      must.push({ range: { createdAt: range } });
    }

    const esQuery = {
      query: { bool: { must } },
      sort: [{ createdAt: 'desc' }],
      size: query.size ?? 50,
      from: query.from_offset ?? 0,
    };

    const url = `${String(this.esUrl)}/${this.indexName}/_search`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(esQuery),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Elasticsearch search error ${String(response.status)}: ${body}`);
    }

    const result = (await response.json()) as ElasticsearchResponse;
    return {
      hits: result.hits.hits.map((h) => h._source),
      total: result.hits.total.value,
      source: 'elasticsearch',
    };
  }

  private async searchPostgres(query: AuditSearchQuery): Promise<AuditSearchResult> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      query.organizationId,
    ]);

    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [query.organizationId];
    let idx = 2;

    if (query.q) {
      conditions.push(
        `(action ILIKE $${String(idx)} OR resource_type ILIKE $${String(idx)} OR actor_id::text ILIKE $${String(idx)})`,
      );
      params.push(`%${query.q}%`);
      idx++;
    }

    if (query.actorType) {
      conditions.push(`actor_type = $${String(idx)}`);
      params.push(query.actorType);
      idx++;
    }

    if (query.action) {
      conditions.push(`action = $${String(idx)}`);
      params.push(query.action);
      idx++;
    }

    if (query.resourceType) {
      conditions.push(`resource_type = $${String(idx)}`);
      params.push(query.resourceType);
      idx++;
    }

    if (query.from) {
      conditions.push(`created_at >= $${String(idx)}`);
      params.push(query.from);
      idx++;
    }

    if (query.to) {
      conditions.push(`created_at <= $${String(idx)}`);
      params.push(query.to);
      idx++;
    }

    const size = query.size ?? 50;
    const offset = query.from_offset ?? 0;

    params.push(size, offset);

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE ${conditions.join(' AND ')}`,
      params.slice(0, params.length - 2),
    );

    const dataResult = await this.pool.query<{
      id: number;
      organization_id: string;
      actor_type: string;
      actor_id: string | null;
      action: string;
      resource_type: string | null;
      resource_id: string | null;
      ip_address: string | null;
      correlation_id: string;
      causation_id: string | null;
      created_at: string;
    }>(
      `SELECT id, organization_id, actor_type, actor_id, action, resource_type, resource_id,
              ip_address, correlation_id, causation_id, created_at
       FROM audit_logs WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${String(idx)} OFFSET $${String(idx + 1)}`,
      params,
    );

    const hits: AuditLogDoc[] = dataResult.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ipAddress: row.ip_address,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      createdAt: row.created_at,
    }));

    return {
      hits,
      total: parseInt(countResult.rows[0]?.count ?? '0', 10),
      source: 'postgres',
    };
  }

  async ensureIndex(): Promise<void> {
    if (!this.esUrl) return;

    const mappings = {
      mappings: {
        properties: {
          id: { type: 'long' },
          organizationId: { type: 'keyword' },
          actorType: { type: 'keyword' },
          actorId: { type: 'keyword' },
          action: { type: 'keyword' },
          resourceType: { type: 'keyword' },
          resourceId: { type: 'keyword' },
          ipAddress: { type: 'keyword' },
          correlationId: { type: 'keyword' },
          causationId: { type: 'keyword' },
          createdAt: { type: 'date' },
        },
      },
    };

    const url = `${this.esUrl}/${this.indexName}`;
    const checkRes = await fetch(url, { method: 'HEAD' });
    if (checkRes.status === 404) {
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappings),
      });
    }
  }
}
