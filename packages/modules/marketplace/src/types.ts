export type MarketplaceItemCategory = 'workflow' | 'agent' | 'template' | 'integration' | 'report';

export type MarketplaceItemStatus = 'draft' | 'pending_review' | 'published' | 'suspended';

export type PricingModel = 'free' | 'one_time' | 'subscription' | 'usage_based';

export interface MarketplaceItem {
  id: string;
  organizationId: string;
  publisherId: string;
  name: string;
  slug: string;
  description: string;
  category: MarketplaceItemCategory;
  status: MarketplaceItemStatus;
  pricingModel: PricingModel;
  priceAmount: number;
  priceCurrency: string;
  tags: string[];
  metadata: Record<string, unknown>;
  installCount: number;
  averageRating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PublisherStatus = 'pending' | 'approved' | 'suspended';

export interface Publisher {
  id: string;
  organizationId: string;
  displayName: string;
  email: string;
  status: PublisherStatus;
  verifiedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type InstallationStatus = 'active' | 'inactive' | 'uninstalled';

export interface Installation {
  id: string;
  organizationId: string;
  marketplaceItemId: string;
  installedBy: string;
  status: InstallationStatus;
  installedAt: string;
  uninstalledAt: string | null;
  config: Record<string, unknown>;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: string;
  organizationId: string;
  marketplaceItemId: string;
  authorId: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceBilling {
  id: string;
  organizationId: string;
  installationId: string;
  marketplaceItemId: string;
  periodStart: string;
  periodEnd: string;
  usageUnits: number;
  feeAmount: number;
  feeCurrency: string;
  status: 'pending' | 'invoiced' | 'paid';
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceItemRow {
  id: string;
  organization_id: string;
  publisher_id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  status: string;
  pricing_model: string;
  price_amount: string;
  price_currency: string;
  tags: string[];
  metadata: Record<string, unknown>;
  install_count: string;
  average_rating: string;
  review_count: string;
  created_at: string;
  updated_at: string;
}

export interface PublisherRow {
  id: string;
  organization_id: string;
  display_name: string;
  email: string;
  status: string;
  verified_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InstallationRow {
  id: string;
  organization_id: string;
  marketplace_item_id: string;
  installed_by: string;
  status: string;
  installed_at: string;
  uninstalled_at: string | null;
  config: Record<string, unknown>;
}

export interface ReviewRow {
  id: string;
  organization_id: string;
  marketplace_item_id: string;
  author_id: string;
  rating: string;
  title: string;
  body: string;
  status: string;
  moderated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceBillingRow {
  id: string;
  organization_id: string;
  installation_id: string;
  marketplace_item_id: string;
  period_start: string;
  period_end: string;
  usage_units: string;
  fee_amount: string;
  fee_currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}
