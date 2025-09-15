const nodemailer = require('nodemailer');
const twilio = require('twilio');
const cron = require('node-cron');
const EventEmitter = require('events');

class NotificationService extends EventEmitter {
  constructor(pool) {
    super();
    this.pool = pool;
    this.emailTransporter = null;
    this.twilioClient = null;
    this.notificationQueue = [];
    this.isProcessing = false;
    this.templates = new Map();
    this.cronJobs = [];
  }

  async initialize() {
    try {
      // Initialize email transporter
      if (process.env.SMTP_HOST) {
        this.emailTransporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          },
          tls: {
            rejectUnauthorized: false
          }
        });

        // Verify email connection
        await this.emailTransporter.verify();
        console.log('Email transporter initialized successfully');
      }

      // Initialize Twilio client
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        console.log('Twilio client initialized successfully');
      }

      // Load notification templates
      await this.loadTemplates();

      // Start notification processing
      this.startNotificationProcessor();

      // Schedule notification checks
      this.scheduleNotificationChecks();

      console.log('Notification service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize notification service:', error);
      throw error;
    }
  }

  async loadTemplates() {
    try {
      const query = `
        SELECT template_name, template_type, subject, body_template, variables
        FROM notification_templates
        WHERE active = true
      `;
      
      const result = await this.pool.query(query);
      
      result.rows.forEach(template => {
        this.templates.set(`${template.template_name}_${template.template_type}`, {
          subject: template.subject,
          body: template.body_template,
          variables: template.variables || []
        });
      });

      // Default templates if none exist in database
      if (this.templates.size === 0) {
        this.loadDefaultTemplates();
      }

      console.log(`Loaded ${this.templates.size} notification templates`);
    } catch (error) {
      console.error('Failed to load notification templates:', error);
      this.loadDefaultTemplates();
    }
  }

  loadDefaultTemplates() {
    // Authorization status update templates
    this.templates.set('auth_status_update_email', {
      subject: 'Authorization Status Update - #{authorizationId}',
      body: `
        <h2>Authorization Status Update</h2>
        <p>Dear #{recipientName},</p>
        <p>The status of authorization request <strong>#{authorizationId}</strong> has been updated.</p>
        <ul>
          <li><strong>Patient:</strong> #{patientName}</li>
          <li><strong>Service:</strong> #{serviceType}</li>
          <li><strong>New Status:</strong> #{status}</li>
          <li><strong>Updated:</strong> #{updatedAt}</li>
        </ul>
        #{notes ? '<p><strong>Notes:</strong> ' + notes + '</p>' : ''}
        <p>You can view the full details in your dashboard.</p>
        <p>Best regards,<br>ClaimFlow AI Team</p>
      `,
      variables: ['recipientName', 'authorizationId', 'patientName', 'serviceType', 'status', 'updatedAt', 'notes']
    });

    this.templates.set('auth_status_update_sms', {
      subject: '',
      body: 'ClaimFlow AI: Authorization #{authorizationId} for #{patientName} status updated to #{status}. Check dashboard for details.',
      variables: ['authorizationId', 'patientName', 'status']
    });

    // Authorization expiring templates
    this.templates.set('auth_expiring_email', {
      subject: 'Authorization Expiring Soon - #{authorizationId}',
      body: `
        <h2>Authorization Expiring Soon</h2>
        <p>Dear #{recipientName},</p>
        <p>Authorization request <strong>#{authorizationId}</strong> is expiring soon.</p>
        <ul>
          <li><strong>Patient:</strong> #{patientName}</li>
          <li><strong>Service:</strong> #{serviceType}</li>
          <li><strong>Due Date:</strong> #{dueDate}</li>
          <li><strong>Days Remaining:</strong> #{daysRemaining}</li>
        </ul>
        <p>Please take action to avoid expiration.</p>
        <p>Best regards,<br>ClaimFlow AI Team</p>
      `,
      variables: ['recipientName', 'authorizationId', 'patientName', 'serviceType', 'dueDate', 'daysRemaining']
    });

    // Authorization approved templates
    this.templates.set('auth_approved_email', {
      subject: 'Authorization Approved - #{authorizationId}',
      body: `
        <h2>Authorization Approved</h2>
        <p>Dear #{recipientName},</p>
        <p>Great news! Authorization request <strong>#{authorizationId}</strong> has been approved.</p>
        <ul>
          <li><strong>Patient:</strong> #{patientName}</li>
          <li><strong>Service:</strong> #{serviceType}</li>
          <li><strong>Approved Date:</strong> #{approvedDate}</li>
          <li><strong>Authorization Number:</strong> #{authNumber}</li>
        </ul>
        <p>You can now proceed with the requested service.</p>
        <p>Best regards,<br>ClaimFlow AI Team</p>
      `,
      variables: ['recipientName', 'authorizationId', 'patientName', 'serviceType', 'approvedDate', 'authNumber']
    });
  }

  async sendNotification(type, recipients, data, options = {}) {
    try {
      const notification = {
        id: Date.now() + Math.random(),
        type,
        recipients: Array.isArray(recipients) ? recipients : [recipients],
        data,
        options,
        attempts: 0,
        maxAttempts: options.maxAttempts || 3,
        createdAt: new Date()
      };

      // Add to queue
      this.notificationQueue.push(notification);

      // Log notification request
      await this.logNotification(notification, 'queued');

      console.log(`Notification queued: ${type} for ${notification.recipients.length} recipients`);
      
      return notification.id;
    } catch (error) {
      console.error('Failed to queue notification:', error);
      throw error;
    }
  }

  async processNotificationQueue() {
    if (this.isProcessing || this.notificationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.notificationQueue.length > 0) {
        const notification = this.notificationQueue.shift();
        await this.processNotification(notification);
        
        // Small delay between notifications
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Error processing notification queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async processNotification(notification) {
    try {
      notification.attempts++;

      for (const recipient of notification.recipients) {
        const methods = recipient.notificationMethods || ['email'];
        
        for (const method of methods) {
          try {
            switch (method) {
              case 'email':
                if (recipient.email) {
                  await this.sendEmail(notification, recipient);
                }
                break;
              case 'sms':
                if (recipient.phone) {
                  await this.sendSMS(notification, recipient);
                }
                break;
              case 'in_app':
                await this.sendInAppNotification(notification, recipient);
                break;
            }
          } catch (methodError) {
            console.error(`Failed to send ${method} notification:`, methodError);
          }
        }
      }

      await this.logNotification(notification, 'sent');
      this.emit('notificationSent', notification);
    } catch (error) {
      console.error('Failed to process notification:', error);
      
      if (notification.attempts < notification.maxAttempts) {
        // Retry later
        setTimeout(() => {
          this.notificationQueue.push(notification);
        }, 5000 * notification.attempts); // Exponential backoff
      } else {
        await this.logNotification(notification, 'failed', error.message);
        this.emit('notificationFailed', notification, error);
      }
    }
  }

  async sendEmail(notification, recipient) {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not configured');
    }

    const template = this.templates.get(`${notification.type}_email`);
    if (!template) {
      throw new Error(`Email template not found for type: ${notification.type}`);
    }

    const subject = this.renderTemplate(template.subject, {
      ...notification.data,
      recipientName: recipient.name
    });

    const html = this.renderTemplate(template.body, {
      ...notification.data,
      recipientName: recipient.name
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@claimflow.ai',
      to: recipient.email,
      subject,
      html,
      ...notification.options.emailOptions
    };

    await this.emailTransporter.sendMail(mailOptions);
    console.log(`Email sent to ${recipient.email}`);
  }

  async sendSMS(notification, recipient) {
    if (!this.twilioClient) {
      throw new Error('Twilio client not configured');
    }

    const template = this.templates.get(`${notification.type}_sms`);
    if (!template) {
      throw new Error(`SMS template not found for type: ${notification.type}`);
    }

    const body = this.renderTemplate(template.body, {
      ...notification.data,
      recipientName: recipient.name
    });

    await this.twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: recipient.phone
    });

    console.log(`SMS sent to ${recipient.phone}`);
  }

  async sendInAppNotification(notification, recipient) {
    try {
      const insertQuery = `
        INSERT INTO in_app_notifications (
          user_id, type, title, message, data, read, created_at
        ) VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
      `;

      const template = this.templates.get(`${notification.type}_email`); // Use email template for in-app
      const title = this.renderTemplate(template?.subject || notification.type, notification.data);
      const message = this.stripHtml(this.renderTemplate(template?.body || 'Notification', notification.data));

      const result = await this.pool.query(insertQuery, [
        recipient.userId,
        notification.type,
        title,
        message,
        JSON.stringify(notification.data)
      ]);

      // Emit real-time notification via WebSocket if available
      this.emit('inAppNotification', {
        userId: recipient.userId,
        notification: {
          id: result.lastID,
          type: notification.type,
          title,
          message,
          data: notification.data,
          createdAt: new Date()
        }
      });

      console.log(`In-app notification sent to user ${recipient.userId}`);
    } catch (error) {
      console.error('Failed to send in-app notification:', error);
      throw error;
    }
  }

  renderTemplate(template, data) {
    let rendered = template;
    
    // Replace variables in format #{variableName}
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`#{${key}}`, 'g');
      rendered = rendered.replace(regex, data[key] || '');
    });

    // Handle conditional expressions like #{notes ? 'Notes: ' + notes : ''}
    rendered = rendered.replace(/#{([^}]+)}/g, (match, expression) => {
      try {
        // Simple evaluation for basic conditionals
        const func = new Function('data', `with(data) { return ${expression}; }`);
        return func(data) || '';
      } catch (error) {
        console.warn('Failed to evaluate template expression:', expression);
        return match;
      }
    });

    return rendered;
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  async logNotification(notification, status, error = null) {
    try {
      const insertQuery = `
        INSERT INTO notification_logs (
          notification_id, type, recipients, status, error_message, 
          attempts, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `;

      await this.pool.query(insertQuery, [
        notification.id,
        notification.type,
        JSON.stringify(notification.recipients),
        status,
        error,
        notification.attempts
      ]);
    } catch (logError) {
      console.error('Failed to log notification:', logError);
    }
  }

  startNotificationProcessor() {
    // Process queue every 5 seconds
    setInterval(() => {
      this.processNotificationQueue();
    }, 5000);
  }

  scheduleNotificationChecks() {
    // Check for expiring authorizations every hour
    const expiringAuthJob = cron.schedule('0 * * * *', async () => {
      await this.checkExpiringAuthorizations();
    });

    // Check for pending authorizations every 4 hours
    const pendingAuthJob = cron.schedule('0 */4 * * *', async () => {
      await this.checkPendingAuthorizations();
    });

    // Daily summary at 8 AM
    const dailySummaryJob = cron.schedule('0 8 * * *', async () => {
      await this.sendDailySummary();
    });

    this.cronJobs.push(expiringAuthJob, pendingAuthJob, dailySummaryJob);
    console.log('Notification cron jobs scheduled');
  }

  async checkExpiringAuthorizations() {
    try {
      const query = `
        SELECT 
          ar.*,
          u.name as provider_name,
          u.email as provider_email,
          u.phone as provider_phone,
          u.notification_preferences
        FROM authorization_requests ar
        JOIN users u ON ar.created_by = u.id
        WHERE ar.status = 'pending' 
        AND ar.due_date <= NOW() + INTERVAL '2 days'
        AND ar.due_date > NOW()
      `;

      const result = await this.pool.query(query);

      for (const auth of result.rows) {
        const daysRemaining = Math.ceil(
          (new Date(auth.due_date) - new Date()) / (1000 * 60 * 60 * 24)
        );

        const recipient = {
          name: auth.provider_name,
          email: auth.provider_email,
          phone: auth.provider_phone,
          userId: auth.created_by,
          notificationMethods: auth.notification_preferences || ['email']
        };

        await this.sendNotification('auth_expiring', recipient, {
          authorizationId: auth.id,
          patientName: auth.patient_name,
          serviceType: auth.service_type,
          dueDate: new Date(auth.due_date).toLocaleDateString(),
          daysRemaining
        });
      }

      console.log(`Checked ${result.rows.length} expiring authorizations`);
    } catch (error) {
      console.error('Failed to check expiring authorizations:', error);
    }
  }

  async checkPendingAuthorizations() {
    try {
      const query = `
        SELECT COUNT(*) as pending_count
        FROM authorization_requests
        WHERE status = 'pending' 
        AND created_at < NOW() - INTERVAL '24 hours'
      `;

      const result = await this.pool.query(query);
      const pendingCount = parseInt(result.rows[0].pending_count);

      if (pendingCount > 0) {
        // Notify administrators about pending authorizations
        const adminQuery = `
          SELECT name, email, phone, notification_preferences
          FROM users
          WHERE role IN ('admin', 'manager')
          AND active = true
        `;

        const adminResult = await this.pool.query(adminQuery);

        for (const admin of adminResult.rows) {
          const recipient = {
            name: admin.name,
            email: admin.email,
            phone: admin.phone,
            notificationMethods: admin.notification_preferences || ['email']
          };

          await this.sendNotification('pending_auth_alert', recipient, {
            pendingCount,
            alertDate: new Date().toLocaleDateString()
          });
        }
      }
    } catch (error) {
      console.error('Failed to check pending authorizations:', error);
    }
  }

  async sendDailySummary() {
    try {
      const summaryQuery = `
        SELECT 
          COUNT(*) as total_today,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_today,
          COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied_today,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_today
        FROM authorization_requests
        WHERE DATE(created_at) = DATE('now')
      `;

      const result = await this.pool.query(summaryQuery);
      const summary = result.rows[0];

      // Send to administrators
      const adminQuery = `
        SELECT name, email, notification_preferences
        FROM users
        WHERE role IN ('admin', 'manager')
        AND active = 1
      `;

      const adminResult = await this.pool.query(adminQuery);

      for (const admin of adminResult.rows) {
        const recipient = {
          name: admin.name,
          email: admin.email,
          notificationMethods: ['email']
        };

        await this.sendNotification('daily_summary', recipient, {
          date: new Date().toLocaleDateString(),
          ...summary
        });
      }
    } catch (error) {
      console.error('Failed to send daily summary:', error);
    }
  }

  async getInAppNotifications(userId, options = {}) {
    try {
      const { page = 1, limit = 20, unreadOnly = false } = options;
      const offset = (page - 1) * limit;

      let whereClause = 'user_id = $1';
      const queryParams = [userId];
      let paramIndex = 2;

      if (unreadOnly) {
        whereClause += ` AND read = false`;
      }

      const query = `
        SELECT id, type, title, message, data, read, created_at
        FROM in_app_notifications
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      queryParams.push(limit, offset);

      const result = await this.pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      console.error('Failed to get in-app notifications:', error);
      throw error;
    }
  }

  async markNotificationAsRead(notificationId, userId) {
    try {
      const query = `
        UPDATE in_app_notifications
        SET read = 1, read_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `;

      const result = await this.pool.query(query, [notificationId, userId]);
      return result.changes > 0;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      // Stop cron jobs
      this.cronJobs.forEach(job => job.destroy());
      this.cronJobs = [];

      // Close email transporter
      if (this.emailTransporter) {
        this.emailTransporter.close();
      }

      console.log('Notification service cleanup completed');
    } catch (error) {
      console.error('Failed to cleanup notification service:', error);
    }
  }
}

module.exports = NotificationService;