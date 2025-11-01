"use strict";
/**
 * Notification Service
 * Unified notification delivery across multiple channels
 * Supports: Email, Slack, Microsoft Teams, Twilio SMS/WhatsApp
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const web_api_1 = require("@slack/web-api");
const twilio = __importStar(require("twilio"));
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
/**
 * NotificationService - Multi-channel notification delivery
 */
class NotificationService {
    constructor(vault, auditService, config, logger) {
        this.logger = logger || new logger_1.Logger();
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
    async initialize() {
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
        }
        catch (error) {
            this.logger.error('Failed to initialize NotificationService', error);
            throw error;
        }
    }
    /**
     * Initialize Email (Nodemailer)
     */
    async initializeEmail() {
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
            this.emailTransporter = nodemailer_1.default.createTransport({
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
        }
        catch (error) {
            this.logger.error('Failed to initialize email', error);
            this.config.enableEmail = false;
        }
    }
    /**
     * Initialize Slack
     */
    async initializeSlack() {
        try {
            const slackToken = await this.vault.getCredential('slack_bot_token');
            if (!slackToken) {
                this.logger.warn('Slack token not found in vault, Slack notifications disabled');
                this.config.enableSlack = false;
                return;
            }
            this.slackClient = new web_api_1.WebClient(slackToken);
            // Test authentication
            await this.slackClient.auth.test();
            this.logger.info('Slack client initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize Slack', error);
            this.config.enableSlack = false;
        }
    }
    /**
     * Initialize Microsoft Teams
     */
    async initializeTeams() {
        try {
            // Teams uses webhook URLs, no initialization needed
            const teamsWebhookUrl = await this.vault.getCredential('teams_webhook_url');
            if (!teamsWebhookUrl) {
                this.logger.warn('Teams webhook URL not found in vault, Teams notifications disabled');
                this.config.enableTeams = false;
                return;
            }
            this.logger.info('Teams webhook initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize Teams', error);
            this.config.enableTeams = false;
        }
    }
    /**
     * Initialize Twilio (SMS/WhatsApp)
     */
    async initializeTwilio() {
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
        }
        catch (error) {
            this.logger.error('Failed to initialize Twilio', error);
            this.config.enableSMS = false;
            this.config.enableWhatsApp = false;
        }
    }
    /**
     * Send notification via specified channel
     */
    async sendNotification(channel, message) {
        const messageId = (0, uuid_1.v4)();
        const delivery = {
            deliveryId: (0, uuid_1.v4)(),
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
            await this.auditService.logNotificationSent(messageId, channel, message.recipient, message.severity, true);
            this.logger.info(`Notification sent via ${channel}`, {
                messageId,
                recipient: message.recipient,
            });
        }
        catch (error) {
            delivery.status = 'failed';
            delivery.attemptCount = 1;
            delivery.failureReason = error.message;
            await this.auditService.logNotificationSent(messageId, channel, message.recipient, message.severity, false, error.message);
            this.logger.error(`Failed to send notification via ${channel}`, error, {
                messageId,
                recipient: message.recipient,
            });
        }
        return delivery;
    }
    /**
     * Send Email
     */
    async sendEmail(options) {
        if (!this.config.enableEmail || !this.emailTransporter) {
            throw new Error('Email notifications are disabled');
        }
        await this.emailTransporter.sendMail(options);
    }
    /**
     * Send Slack message
     */
    async sendSlack(options) {
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
    async sendTeams(options) {
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
    async sendSMS(options) {
        if (!this.config.enableSMS || !this.twilioClient) {
            throw new Error('SMS notifications are disabled');
        }
        await this.twilioClient.messages.create(options);
    }
    /**
     * Send WhatsApp message via Twilio
     */
    async sendWhatsApp(options) {
        if (!this.config.enableWhatsApp || !this.twilioClient) {
            throw new Error('WhatsApp notifications are disabled');
        }
        await this.twilioClient.messages.create(options);
    }
    /**
     * Get severity color for Teams
     */
    getSeverityColor(severity) {
        const colors = {
            info: '0078D4', // Blue
            warning: 'FFA500', // Orange
            critical: 'FF0000', // Red
        };
        return colors[severity] || colors.info;
    }
    /**
     * Check if a channel is enabled
     */
    isChannelEnabled(channel) {
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
exports.NotificationService = NotificationService;
exports.default = NotificationService;
//# sourceMappingURL=notification.service.js.map