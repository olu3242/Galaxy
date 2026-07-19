import type { Pool } from 'pg';
import type {
  MarketplaceItem,
  MarketplaceItemRow,
  MarketplaceItemCategory,
  MarketplaceItemStatus,
  PricingModel,
} from '../types.js';

function rowToItem(row: MarketplaceItemRow): MarketplaceItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    publisherId: row.publisher_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category as MarketplaceItemCategory,
    status: row.status as MarketplaceItemStatus,
    pricingModel: row.pricing_model as PricingModel,
    priceAmount: parseFloat(row.price_amount),
    priceCurrency: row.price_currency,
    tags: row.tags,
    metadata: row.metadata,
    installCount: parseInt(row.install_count, 10),
    averageRating: parseFloat(row.average_rating),
    reviewCount: parseInt(row.review_count, 10),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateMarketplaceItemInput {
  organizationId: string;
  publisherId: string;
  name: string;
  slug: string;
  description: string;
  category: MarketplaceItemCategory;
  pricingModel: PricingModel;
  priceAmount: number;
  priceCurrency: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface UpdateMarketplaceItemInput {
  name?: string;
  description?: string;
  pricingModel?: PricingModel;
  priceAmount?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export class MarketplaceItemService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createItem(input: CreateMarketplaceItemInput): Promise<MarketplaceItem> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<MarketplaceItemRow>(
      `INSERT INTO marketplace_items
        (organization_id, publisher_id, name, slug, description, category, status,
         pricing_model, price_amount, price_currency, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        input.organizationId,
        input.publisherId,
        input.name,
        input.slug,
        input.description,
        input.category,
        input.pricingModel,
        input.priceAmount,
        input.priceCurrency,
        input.tags,
        JSON.stringify(input.metadata),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create marketplace item');
    return rowToItem(row);
  }

  async getItem(organizationId: string, itemId: string): Promise<MarketplaceItem | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<MarketplaceItemRow>(
      'SELECT * FROM marketplace_items WHERE id = $1 AND organization_id = $2',
      [itemId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToItem(row) : null;
  }

  async listItems(
    organizationId: string,
    options: {
      category?: MarketplaceItemCategory;
      status?: MarketplaceItemStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<MarketplaceItem[]> {
    await this.setTenantContext(organizationId);
    const params: unknown[] = [organizationId];
    let sql = 'SELECT * FROM marketplace_items WHERE organization_id = $1';
    if (options.category !== undefined) {
      params.push(options.category);
      sql += ` AND category = $${String(params.length)}`;
    }
    if (options.status !== undefined) {
      params.push(options.status);
      sql += ` AND status = $${String(params.length)}`;
    }
    sql += ' ORDER BY created_at DESC';
    if (options.limit !== undefined) {
      params.push(options.limit);
      sql += ` LIMIT $${String(params.length)}`;
    }
    if (options.offset !== undefined) {
      params.push(options.offset);
      sql += ` OFFSET $${String(params.length)}`;
    }
    const result = await this.pool.query<MarketplaceItemRow>(sql, params);
    return result.rows.map(rowToItem);
  }

  async updateItem(
    organizationId: string,
    itemId: string,
    input: UpdateMarketplaceItemInput,
  ): Promise<MarketplaceItem | null> {
    await this.setTenantContext(organizationId);
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${String(params.length)}`);
    }
    if (input.description !== undefined) {
      params.push(input.description);
      sets.push(`description = $${String(params.length)}`);
    }
    if (input.pricingModel !== undefined) {
      params.push(input.pricingModel);
      sets.push(`pricing_model = $${String(params.length)}`);
    }
    if (input.priceAmount !== undefined) {
      params.push(input.priceAmount);
      sets.push(`price_amount = $${String(params.length)}`);
    }
    if (input.tags !== undefined) {
      params.push(input.tags);
      sets.push(`tags = $${String(params.length)}`);
    }
    if (input.metadata !== undefined) {
      params.push(JSON.stringify(input.metadata));
      sets.push(`metadata = $${String(params.length)}`);
    }

    if (sets.length === 0) return this.getItem(organizationId, itemId);

    sets.push(`updated_at = NOW()`);
    params.push(itemId);
    params.push(organizationId);
    const result = await this.pool.query<MarketplaceItemRow>(
      `UPDATE marketplace_items SET ${sets.join(', ')} WHERE id = $${String(params.length - 1)} AND organization_id = $${String(params.length)} RETURNING *`,
      params,
    );
    const row = result.rows[0];
    return row ? rowToItem(row) : null;
  }

  async publishItem(organizationId: string, itemId: string): Promise<MarketplaceItem | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<MarketplaceItemRow>(
      `UPDATE marketplace_items SET status = 'pending_review', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'draft'
       RETURNING *`,
      [itemId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToItem(row) : null;
  }

  async deleteItem(organizationId: string, itemId: string): Promise<boolean> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query(
      `DELETE FROM marketplace_items WHERE id = $1 AND organization_id = $2 AND status = 'draft'`,
      [itemId, organizationId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
