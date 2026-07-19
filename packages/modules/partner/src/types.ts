export type PartnerType = 'reseller' | 'isv' | 'si' | 'technology';

export type PartnerTier = 'registered' | 'silver' | 'gold' | 'platinum';

export type PartnerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Partner {
  id: string;
  organizationId: string;
  name: string;
  type: PartnerType;
  tier: PartnerTier;
  status: PartnerStatus;
  contactEmail: string;
  contactName: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface PartnerRow {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  tier: string;
  status: string;
  contact_email: string;
  contact_name: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export type DealStage =
  | 'registered'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export interface Deal {
  id: string;
  partnerId: string;
  customerOrgName: string;
  customerEmail: string;
  dealValue: number;
  stage: DealStage;
  commissionRate: number;
  commissionAmount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DealRow {
  id: string;
  partner_id: string;
  customer_org_name: string;
  customer_email: string;
  deal_value: string;
  stage: string;
  commission_rate: string;
  commission_amount: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type CommissionStatus = 'pending' | 'approved' | 'paid';

export interface PartnerCommission {
  id: string;
  partnerId: string;
  dealId: string;
  amount: number;
  status: CommissionStatus;
  period: string;
  createdAt: string;
}

export interface PartnerCommissionRow {
  id: string;
  partner_id: string;
  deal_id: string;
  amount: string;
  status: string;
  period: string;
  created_at: string;
}

export interface PublisherAnalytics {
  organizationId: string;
  totalEarnings: number;
  pendingPayouts: number;
  totalItems: number;
  totalInstalls: number;
  averageRating: number;
  reviewCount: number;
}

export interface PublisherPayout {
  id: string;
  organizationId: string;
  amount: number;
  status: 'pending' | 'processing' | 'settled' | 'failed';
  period: string;
  settledAt: string | null;
  createdAt: string;
}

export interface PublisherPayoutRow {
  id: string;
  organization_id: string;
  amount: string;
  status: string;
  period: string;
  settled_at: string | null;
  created_at: string;
}
