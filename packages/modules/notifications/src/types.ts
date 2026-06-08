export type NotificationChannel = 'in_app' | 'email' | 'whatsapp' | 'sms';

export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';

export interface NotificationTemplateRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  channel: string;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  organization_id: string;
  recipient_id: string;
  template_id: string | null;
  channel: string;
  title: string;
  body: string;
  status: string;
  read_at: string | null;
  data: Record<string, unknown>;
  correlation_id: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferenceRow {
  id: string;
  organization_id: string;
  member_id: string;
  channel: string;
  notification_type: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}
