export { PartnerService } from './partners/PartnerService.js';
export type {
  RegisterPartnerInput,
  ListPartnersOptions,
  UpdatePartnerProfileInput,
} from './partners/PartnerService.js';

export { PublisherPortalService } from './publisher/PublisherPortalService.js';
export type { PublisherOnboardingInput } from './publisher/PublisherPortalService.js';

export { PartnerDealService } from './deals/PartnerDealService.js';
export type { RegisterDealInput } from './deals/PartnerDealService.js';

export type {
  Partner,
  PartnerRow,
  PartnerType,
  PartnerTier,
  PartnerStatus,
  Deal,
  DealRow,
  DealStage,
  PartnerCommission,
  PartnerCommissionRow,
  CommissionStatus,
  PublisherAnalytics,
  PublisherPayout,
  PublisherPayoutRow,
} from './types.js';
