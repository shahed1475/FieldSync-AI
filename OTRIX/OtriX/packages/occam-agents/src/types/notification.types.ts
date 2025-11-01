/**
 * OCCAM Notification Types
 * Defines notification channels, messages, and delivery tracking
 */

import { SeverityLevel } from './status.types';

export type NotificationChannel =
  | 'email'
  | 'slack'
  | 'teams'
  | 'sms'
  | 'whatsapp';

export interface NotificationConfig {
  channels: NotificationChannel[];
  recipients: NotificationRecipient[];
  templates: NotificationTemplate[];
  retryPolicy: RetryPolicy;
}

export interface NotificationRecipient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  slackUserId?: string;
  teamsUserId?: string;
  preferredChannels: NotificationChannel[];
  severity: SeverityLevel[];
}

export interface NotificationTemplate {
  templateId: string;
  name: string;
  channel: NotificationChannel;
  severity: SeverityLevel;
  subject?: string;
  body: string;
  variables: string[];
}

export interface NotificationMessage {
  messageId: string;
  channel: NotificationChannel;
  severity: SeverityLevel;
  recipient: string;
  subject?: string;
  body: string;
  metadata: Record<string, any>;
  createdAt: Date;
  scheduledFor?: Date;
}

export interface NotificationDelivery {
  deliveryId: string;
  messageId: string;
  channel: NotificationChannel;
  recipient: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  attemptCount: number;
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
  metadata: Record<string, any>;
}

export interface RetryPolicy {
  maxAttempts: number;
  retryDelayMs: number;
  exponentialBackoff: boolean;
  maxDelayMs: number;
}

export interface EmailOptions {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SlackMessageOptions {
  channel: string;
  text: string;
  blocks?: any[];
  thread_ts?: string;
  attachments?: any[];
}

export interface TeamsMessageOptions {
  webhookUrl: string;
  title: string;
  text: string;
  themeColor?: string;
  sections?: any[];
}

export interface TwilioSMSOptions {
  to: string;
  from: string;
  body: string;
}

export interface TwilioWhatsAppOptions {
  to: string; // format: whatsapp:+1234567890
  from: string; // format: whatsapp:+1234567890
  body: string;
}
