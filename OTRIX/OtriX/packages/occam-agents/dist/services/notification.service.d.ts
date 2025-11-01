/**
 * Notification Service
 * Unified notification delivery across multiple channels
 * Supports: Email, Slack, Microsoft Teams, Twilio SMS/WhatsApp
 */
import { Logger } from '../utils/logger';
import { SecureVault } from './securevault.service';
import { AuditService } from './audit.service';
import { NotificationChannel, NotificationMessage, NotificationDelivery } from '../types';
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
export declare class NotificationService {
    private logger;
    private vault;
    private auditService;
    private config;
    private emailTransporter?;
    private slackClient?;
    private twilioClient?;
    constructor(vault: SecureVault, auditService: AuditService, config?: NotificationServiceConfig, logger?: Logger);
    /**
     * Initialize notification service and all connectors
     */
    initialize(): Promise<void>;
    /**
     * Initialize Email (Nodemailer)
     */
    private initializeEmail;
    /**
     * Initialize Slack
     */
    private initializeSlack;
    /**
     * Initialize Microsoft Teams
     */
    private initializeTeams;
    /**
     * Initialize Twilio (SMS/WhatsApp)
     */
    private initializeTwilio;
    /**
     * Send notification via specified channel
     */
    sendNotification(channel: NotificationChannel, message: Omit<NotificationMessage, 'messageId' | 'createdAt' | 'channel'>): Promise<NotificationDelivery>;
    /**
     * Send Email
     */
    private sendEmail;
    /**
     * Send Slack message
     */
    private sendSlack;
    /**
     * Send Teams message
     */
    private sendTeams;
    /**
     * Send SMS via Twilio
     */
    private sendSMS;
    /**
     * Send WhatsApp message via Twilio
     */
    private sendWhatsApp;
    /**
     * Get severity color for Teams
     */
    private getSeverityColor;
    /**
     * Check if a channel is enabled
     */
    isChannelEnabled(channel: NotificationChannel): boolean;
}
export default NotificationService;
//# sourceMappingURL=notification.service.d.ts.map