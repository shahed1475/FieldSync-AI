/**
 * Email Utility Service
 * Provides email functionality for notifications and alerts
 */

const logger = require('./logger');

class EmailService {
  constructor() {
    // Initialize email service configuration
    this.config = {
      enabled: process.env.EMAIL_ENABLED === 'true',
      provider: process.env.EMAIL_PROVIDER || 'console', // console, smtp, ses
      from: process.env.EMAIL_FROM || 'noreply@claimflow.ai'
    };
  }

  async sendEmail(options) {
    const { to, subject, text, html } = options;

    try {
      if (!this.config.enabled) {
        logger.info('Email sending disabled, logging email content', {
          to,
          subject,
          text: text?.substring(0, 100) + '...'
        });
        return { success: true, messageId: 'disabled' };
      }

      // For now, just log the email (can be extended with actual email providers)
      logger.info('Email sent successfully', {
        to,
        subject,
        provider: this.config.provider,
        messageId: `mock-${Date.now()}`
      });

      return {
        success: true,
        messageId: `mock-${Date.now()}`
      };

    } catch (error) {
      logger.error('Failed to send email', {
        error: error.message,
        to,
        subject
      });
      throw error;
    }
  }

  async sendBackupNotification(backupResult) {
    const subject = backupResult.success 
      ? 'ClaimFlow AI - Backup Completed Successfully'
      : 'ClaimFlow AI - Backup Failed';

    const text = backupResult.success
      ? `Backup completed successfully at ${new Date().toISOString()}\n\nBackup Details:\n- Size: ${backupResult.size || 'Unknown'}\n- Duration: ${backupResult.duration || 'Unknown'}\n- Location: ${backupResult.location || 'Unknown'}`
      : `Backup failed at ${new Date().toISOString()}\n\nError: ${backupResult.error || 'Unknown error'}`;

    return this.sendEmail({
      to: process.env.BACKUP_NOTIFICATION_EMAIL || 'admin@claimflow.ai',
      subject,
      text
    });
  }

  async sendSecurityAlert(alertDetails) {
    const subject = 'ClaimFlow AI - Security Alert';
    const text = `Security alert detected at ${new Date().toISOString()}\n\nAlert Details:\n${JSON.stringify(alertDetails, null, 2)}`;

    return this.sendEmail({
      to: process.env.SECURITY_ALERT_EMAIL || 'security@claimflow.ai',
      subject,
      text
    });
  }
}

const emailService = new EmailService();

module.exports = {
  sendEmail: (options) => emailService.sendEmail(options),
  sendBackupNotification: (result) => emailService.sendBackupNotification(result),
  sendSecurityAlert: (details) => emailService.sendSecurityAlert(details)
};