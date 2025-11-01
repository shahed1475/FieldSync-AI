/**
 * Notification Service
 * Unified notification delivery across multiple channels
 * Supports: Email, Slack, Microsoft Teams, Twilio SMS/WhatsApp
 */

import nodemailer, { Transporter } from 'nodemailer';
import { WebClient } from '@slack/web-api';
import * as twilio from 'twilio';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { SecureVault } from './securevault.service';
import { AuditService } from './audit.service';
import {
  NotificationChannel,
  NotificationMessage,
  NotificationDelivery,
  EmailOptions,
  SlackMessageOptions,
  TeamsMessageOptions,
  TwilioSMSOptions,
  TwilioWhatsAppOptions,
  SeverityLevel,
} from '../types';

export interface NotificationServiceConfig {
  enableEmail?: boolean;
  enableSlack?: boolean;
  enableTeams?: boolean;
  enableSMS?: boolean;
  enableWhatsApp?: boolean;
}

/**
 * NotificationService - Multi-channel notification delivery
 */
export class NotificationService {
  private logger: Logger;
  private vault: SecureVault;
  private auditService: AuditService;
  private config: NotificationServiceConfig;

  // Email
  private emailTransporter?: Transporter;

  // Slack
  private slackClient?: WebClient;

  // Twilio
  private twilioClient?: twilio.Twilio;

  constructor(
    vault: SecureVault,
    auditService: AuditService,
    config?: NotificationServiceConfig,
    logger?: Logger
  ) {
    this.logger = logger || new Logger();
    this.vault = vault;
    this.auditService = auditService;
    this.config = {
      enableEmail: config?.enableEmail ?? true,
      enableSlack: config?.enableSlack ?? true,
      enableTeams: config?.enableTeams ?? true,
      enableSMS: config?.enableSMS ?? false,
      enableWhatsApp: config?.enableWhatsApp ?? false,
    };
  }

  /**
   * Initialize notification service and all connectors
   */
  async initialize(): Promise<void> {
    try {
      if (this.config.enableEmail) {
        await this.initializeEmail();
      }

      if (this.config.enableSlack) {
        await this.initializeSlack();
      }

      if (this.config.enableTeams) {
        await this.initializeTeams();
      }

      if (this.config.enableSMS || this.config.enableWhatsApp) {
        await this.initializeTwilio();
      }

      this.logger.info('NotificationService initialized successfully', {
        enabledChannels: Object.entries(this.config)
          .filter(([_, enabled]) => enabled)
          .map(([channel]) => channel),
      });
    } catch (error) {
      this.logger.error('Failed to initialize NotificationService', error as Error);
      throw error;
    }
  }

  /**
   * Initialize Email (Nodemailer)
   */
  private async initializeEmail(): Promise<void> {
    try {
      const emailService = process.env.EMAIL_SERVICE || 'gmail';
      const emailHost = process.env.EMAIL_HOST;
      const emailPort = parseInt(process.env.EMAIL_PORT || '587', 10);
      const emailSecure = process.env.EMAIL_SECURE === 'true';
      const emailUser = await this.vault.getCredential('email_user');
      const emailPassword = await this.vault.getCredential('email_password');

      if (!emailUser || !emailPassword) {
        this.logger.warn('Email credentials not found in vault, email notifications disabled');
        this.config.enableEmail = false;
        return;
      }

      this.emailTransporter = nodemailer.createTransport({
        service: emailHost ? undefined : emailService,
        host: emailHost,
        port: emailPort,
        secure: emailSecure,
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      });

      // Verify connection
      await this.emailTransporter.verify();
      this.logger.info('Email transporter initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize email', error as Error);
      this.config.enableEmail = false;
    }
  }

  /**
   * Initialize Slack
   */
  private async initializeSlack(): Promise<void> {
    try {
      const slackToken = await this.vault.getCredential('slack_bot_token');

      if (!slackToken) {
        this.logger.warn('Slack token not found in vault, Slack notifications disabled');
        this.config.enableSlack = false;
        return;
      }

      this.slackClient = new WebClient(slackToken);

      // Test authentication
      await this.slackClient.auth.test();
      this.logger.info('Slack client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Slack', error as Error);
      this.config.enableSlack = false;
    }
  }

  /**
   * Initialize Microsoft Teams
   */
  private async initializeTeams(): Promise<void> {
    try {
      // Teams uses webhook URLs, no initialization needed
      const teamsWebhookUrl = await this.vault.getCredential('teams_webhook_url');

      if (!teamsWebhookUrl) {
        this.logger.warn('Teams webhook URL not found in vault, Teams notifications disabled');
        this.config.enableTeams = false;
        return;
      }

      this.logger.info('Teams webhook initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Teams', error as Error);
      this.config.enableTeams = false;
    }
  }

  /**
   * Initialize Twilio (SMS/WhatsApp)
   */
  private async initializeTwilio(): Promise<void> {
    try {
      const accountSid = await this.vault.getCredential('twilio_account_sid');
      const authToken = await this.vault.getCredential('twilio_auth_token');

      if (!accountSid || !authToken) {
        this.logger.warn('Twilio credentials not found in vault, SMS/WhatsApp notifications disabled');
        this.config.enableSMS = false;
        this.config.enableWhatsApp = false;
        return;
      }

      this.twilioClient = twilio.default(accountSid, authToken);
      this.logger.info('Twilio client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Twilio', error as Error);
      this.config.enableSMS = false;
      this.config.enableWhatsApp = false;
    }
  }

  /**
   * Send notification via specified channel
   */
  async sendNotification(
    channel: NotificationChannel,
    message: Omit<NotificationMessage, 'messageId' | 'createdAt' | 'channel'>
  ): Promise<NotificationDelivery> {
    const messageId = uuidv4();
    const delivery: NotificationDelivery = {
      deliveryId: uuidv4(),
      messageId,
      channel,
      recipient: message.recipient,
      status: 'pending',
      attemptCount: 0,
      metadata: message.metadata,
    };

    try {
      switch (channel) {
        case 'email':
          await this.sendEmail({
            from: process.env.EMAIL_FROM || message.metadata.from,
            to: message.recipient,
            subject: message.subject || 'OCCAM Notification',
            html: message.body,
          });
          break;

        case 'slack':
          await this.sendSlack({
            channel: message.recipient,
            text: message.body,
            blocks: message.metadata.blocks,
          });
          break;

        case 'teams':
          await this.sendTeams({
            webhookUrl: message.recipient,
            title: message.subject || 'OCCAM Notification',
            text: message.body,
            themeColor: this.getSeverityColor(message.severity),
          });
          break;

        case 'sms':
          await this.sendSMS({
            to: message.recipient,
            from: message.metadata.from || process.env.TWILIO_PHONE_NUMBER || '',
            body: message.body,
          });
          break;

        case 'whatsapp':
          await this.sendWhatsApp({
            to: message.recipient,
            from: message.metadata.from || process.env.TWILIO_WHATSAPP_NUMBER || '',
            body: message.body,
          });
          break;

        default:
          throw new Error(`Unsupported notification channel: ${channel}`);
      }

      delivery.status = 'sent';
      delivery.sentAt = new Date();
      delivery.attemptCount = 1;

      await this.auditService.logNotificationSent(
        messageId,
        channel,
        message.recipient,
        message.severity,
        true
      );

      this.logger.info(`Notification sent via ${channel}`, {
        messageId,
        recipient: message.recipient,
      });
    } catch (error) {
      delivery.status = 'failed';
      delivery.attemptCount = 1;
      delivery.failureReason = (error as Error).message;

      await this.auditService.logNotificationSent(
        messageId,
        channel,
        message.recipient,
        message.severity,
        false,
        (error as Error).message
      );

      this.logger.error(`Failed to send notification via ${channel}`, error as Error, {
        messageId,
        recipient: message.recipient,
      });
    }

    return delivery;
  }

  /**
   * Send Email
   */
  private async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.config.enableEmail || !this.emailTransporter) {
      throw new Error('Email notifications are disabled');
    }

    await this.emailTransporter.sendMail(options);
  }

  /**
   * Send Slack message
   */
  private async sendSlack(options: SlackMessageOptions): Promise<void> {
    if (!this.config.enableSlack || !this.slackClient) {
      throw new Error('Slack notifications are disabled');
    }

    await this.slackClient.chat.postMessage({
      channel: options.channel,
      text: options.text,
      blocks: options.blocks,
      thread_ts: options.thread_ts,
      attachments: options.attachments,
    });
  }

  /**
   * Send Teams message
   */
  private async sendTeams(options: TeamsMessageOptions): Promise<void> {
    if (!this.config.enableTeams) {
      throw new Error('Teams notifications are disabled');
    }

    const webhookUrl = options.webhookUrl;

    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: options.title,
      themeColor: options.themeColor || '0078D4',
      title: options.title,
      text: options.text,
      sections: options.sections || [],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Teams webhook request failed: ${response.statusText}`);
    }
  }

  /**
   * Send SMS via Twilio
   */
  private async sendSMS(options: TwilioSMSOptions): Promise<void> {
    if (!this.config.enableSMS || !this.twilioClient) {
      throw new Error('SMS notifications are disabled');
    }

    await this.twilioClient.messages.create(options);
  }

  /**
   * Send WhatsApp message via Twilio
   */
  private async sendWhatsApp(options: TwilioWhatsAppOptions): Promise<void> {
    if (!this.config.enableWhatsApp || !this.twilioClient) {
      throw new Error('WhatsApp notifications are disabled');
    }

    await this.twilioClient.messages.create(options);
  }

  /**
   * Get severity color for Teams
   */
  private getSeverityColor(severity: SeverityLevel): string {
    const colors: Record<SeverityLevel, string> = {
      info: '0078D4', // Blue
      warning: 'FFA500', // Orange
      critical: 'FF0000', // Red
    };

    return colors[severity] || colors.info;
  }

  /**
   * Check if a channel is enabled
   */
  isChannelEnabled(channel: NotificationChannel): boolean {
    switch (channel) {
      case 'email':
        return this.config.enableEmail ?? false;
      case 'slack':
        return this.config.enableSlack ?? false;
      case 'teams':
        return this.config.enableTeams ?? false;
      case 'sms':
        return this.config.enableSMS ?? false;
      case 'whatsapp':
        return this.config.enableWhatsApp ?? false;
      default:
        return false;
    }
  }
}

export default NotificationService;
