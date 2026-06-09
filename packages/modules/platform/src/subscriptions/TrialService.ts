import type { Pool } from 'pg';
import { SubscriptionService } from './SubscriptionService.js';
import type { Subscription } from './SubscriptionService.js';

export class TrialService {
  private readonly subscriptionService: SubscriptionService;

  constructor(private readonly pool: Pool) {
    this.subscriptionService = new SubscriptionService(pool);
  }

  async startTrial(input: {
    organizationId: string;
    planId: string;
    trialDays?: number;
  }): Promise<Subscription> {
    const trialDays = input.trialDays ?? 14;
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    return this.subscriptionService.createSubscription({
      organizationId: input.organizationId,
      planId: input.planId,
      status: 'trialing',
      trialEndsAt: trialEndsAt.toISOString(),
    });
  }

  async getTrialStatus(organizationId: string): Promise<{
    onTrial: boolean;
    daysRemaining: number | null;
    subscription: Subscription | null;
  }> {
    const subscription = await this.subscriptionService.getSubscription(organizationId);

    if (subscription?.status !== 'trialing') {
      return { onTrial: false, daysRemaining: null, subscription };
    }

    const trialEnd = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
    const now = new Date();
    const daysRemaining = trialEnd
      ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    return { onTrial: true, daysRemaining, subscription };
  }

  async convertTrial(organizationId: string): Promise<Subscription | null> {
    const subscription = await this.subscriptionService.getSubscription(organizationId);
    if (subscription?.status !== 'trialing') return null;
    return this.subscriptionService.updateStatus(subscription.id, 'active', organizationId);
  }
}
