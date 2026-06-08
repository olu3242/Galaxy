import type { NotificationChannel } from '../types.js';
import type { NotificationPreferenceService } from './NotificationPreferenceService.js';
import type { NotificationService, CreateNotificationInput } from './NotificationService.js';

export interface DispatchInput {
  organizationId: string;
  recipientId: string;
  notificationType: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  actorId: string;
  correlationId: string;
  channels?: NotificationChannel[];
}

/**
 * NotificationDispatcher — routes notifications to correct delivery channels
 * based on member preferences.
 */
export class NotificationDispatcher {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  async dispatch(input: DispatchInput): Promise<void> {
    const channels: NotificationChannel[] = input.channels ?? ['in_app'];

    for (const channel of channels) {
      const pref = await this.preferenceService.get(
        input.organizationId,
        input.recipientId,
        channel,
        input.notificationType,
      );

      // If no preference exists, default to enabled
      if (pref !== null && !pref.isEnabled) {
        continue;
      }

      const createInput: CreateNotificationInput = {
        organizationId: input.organizationId,
        recipientId: input.recipientId,
        channel,
        title: input.title,
        body: input.body,
        data: input.data,
        actorId: input.actorId,
        correlationId: input.correlationId,
      };

      await this.notificationService.create(createInput);
    }
  }
}
