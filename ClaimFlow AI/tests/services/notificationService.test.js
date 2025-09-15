const NotificationService = require('../../src/services/notificationService');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Mock dependencies
jest.mock('nodemailer');
jest.mock('twilio');
jest.mock('node-cron');

describe('NotificationService', () => {
  let notificationService;
  let mockPool;
  let mockQuery;
  let mockEmailTransporter;
  let mockTwilioClient;

  beforeEach(() => {
    mockQuery = jest.fn();
    mockPool = {
      query: mockQuery,
      connect: jest.fn(),
      end: jest.fn()
    };

    mockEmailTransporter = {
      sendMail: jest.fn(),
      verify: jest.fn().mockResolvedValue(true)
    };
    nodemailer.createTransporter = jest.fn().mockReturnValue(mockEmailTransporter);

    mockTwilioClient = {
      messages: {
        create: jest.fn()
      }
    };
    twilio.mockReturnValue(mockTwilioClient);

    notificationService = new NotificationService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize notification service successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Templates query
      
      await notificationService.initialize();
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM notification_templates')
      );
      expect(mockEmailTransporter.verify).toHaveBeenCalled();
    });

    it('should handle email configuration errors', async () => {
      mockEmailTransporter.verify.mockRejectedValueOnce(new Error('SMTP connection failed'));
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      await notificationService.initialize();
      
      // Should continue initialization despite email error
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should load notification templates', async () => {
      const mockTemplates = [
        {
          template_name: 'authorization_approved',
          template_type: 'email',
          subject: 'Authorization Approved',
          body_template: 'Your authorization {{authId}} has been approved.',
          variables: ['authId']
        }
      ];
      
      mockQuery.mockResolvedValueOnce({ rows: mockTemplates });
      
      await notificationService.initialize();
      
      expect(notificationService.templates).toHaveProperty('authorization_approved');
      expect(notificationService.templates.authorization_approved).toHaveProperty('email');
    });
  });

  describe('sendNotification', () => {
    const mockRecipient = {
      userId: 'user-123',
      email: 'test@example.com',
      phone: '+1234567890',
      name: 'John Doe'
    };

    const mockData = {
      authorizationId: 'auth-001',
      patientName: 'Jane Smith',
      procedureCode: '70553',
      status: 'approved'
    };

    beforeEach(() => {
      // Mock template loading
      notificationService.templates = {
        authorization_approved: {
          email: {
            subject: 'Authorization Approved - {{authorizationId}}',
            body_template: 'Dear {{recipientName}}, your authorization {{authorizationId}} for {{patientName}} has been {{status}}.'
          },
          sms: {
            body_template: 'Authorization {{authorizationId}} {{status}}. Patient: {{patientName}}'
          },
          in_app: {
            title: 'Authorization {{status}}',
            body_template: 'Authorization {{authorizationId}} has been {{status}}'
          }
        }
      };

      // Mock database operations
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'notif-001' }] }) // Insert notification
        .mockResolvedValueOnce({ rows: [] }); // Insert log
    });

    it('should send email notification successfully', async () => {
      mockEmailTransporter.sendMail.mockResolvedValueOnce({ messageId: 'email-123' });
      
      const result = await notificationService.sendNotification(
        'authorization_approved',
        mockRecipient,
        mockData,
        { channels: ['email'] }
      );
      
      expect(result).toBeDefined();
      expect(mockEmailTransporter.sendMail).toHaveBeenCalledWith({
        from: process.env.SMTP_FROM,
        to: mockRecipient.email,
        subject: 'Authorization Approved - auth-001',
        html: expect.stringContaining('Dear John Doe')
      });
    });

    it('should send SMS notification successfully', async () => {
      mockTwilioClient.messages.create.mockResolvedValueOnce({ sid: 'sms-123' });
      
      const result = await notificationService.sendNotification(
        'authorization_approved',
        mockRecipient,
        mockData,
        { channels: ['sms'] }
      );
      
      expect(result).toBeDefined();
      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: mockRecipient.phone,
        body: expect.stringContaining('Authorization auth-001 approved')
      });
    });

    it('should send in-app notification successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'in-app-001' }] });
      
      const result = await notificationService.sendNotification(
        'authorization_approved',
        mockRecipient,
        mockData,
        { channels: ['in_app'] }
      );
      
      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO in_app_notifications'),
        expect.arrayContaining([mockRecipient.userId])
      );
    });

    it('should send to multiple channels', async () => {
      mockEmailTransporter.sendMail.mockResolvedValueOnce({ messageId: 'email-123' });
      mockTwilioClient.messages.create.mockResolvedValueOnce({ sid: 'sms-123' });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'in-app-001' }] });
      
      const result = await notificationService.sendNotification(
        'authorization_approved',
        mockRecipient,
        mockData,
        { channels: ['email', 'sms', 'in_app'] }
      );
      
      expect(result).toBeDefined();
      expect(mockEmailTransporter.sendMail).toHaveBeenCalled();
      expect(mockTwilioClient.messages.create).toHaveBeenCalled();
    });

    it('should handle email sending failures', async () => {
      mockEmailTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP error'));
      
      const result = await notificationService.sendNotification(
        'authorization_approved',
        mockRecipient,
        mockData,
        { channels: ['email'] }
      );
      
      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notification_logs'),
        expect.arrayContaining(['failed'])
      );
    });

    it('should handle SMS sending failures', async () => {
      mockTwilioClient.messages.create.mockRejectedValueOnce(new Error('Twilio error'));
      
      const result = await notificationService.sendNotification(
        'authorization_approved',
        mockRecipient,
        mockData,
        { channels: ['sms'] }
      );
      
      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notification_logs'),
        expect.arrayContaining(['failed'])
      );
    });

    it('should handle missing templates', async () => {
      await expect(
        notificationService.sendNotification(
          'non_existent_template',
          mockRecipient,
          mockData
        )
      ).rejects.toThrow('Template not found');
    });

    it('should validate recipient data', async () => {
      const invalidRecipient = { userId: 'user-123' }; // Missing email/phone
      
      await expect(
        notificationService.sendNotification(
          'authorization_approved',
          invalidRecipient,
          mockData,
          { channels: ['email'] }
        )
      ).rejects.toThrow('Email address required');
    });
  });

  describe('template processing', () => {
    it('should replace template variables correctly', () => {
      const template = 'Hello {{name}}, your order {{orderId}} is {{status}}.';
      const variables = {
        name: 'John',
        orderId: '12345',
        status: 'ready'
      };
      
      const result = notificationService.processTemplate(template, variables);
      
      expect(result).toBe('Hello John, your order 12345 is ready.');
    });

    it('should handle missing variables', () => {
      const template = 'Hello {{name}}, your order {{orderId}} is {{status}}.';
      const variables = {
        name: 'John',
        orderId: '12345'
        // status is missing
      };
      
      const result = notificationService.processTemplate(template, variables);
      
      expect(result).toBe('Hello John, your order 12345 is {{status}}.');
    });

    it('should handle nested object variables', () => {
      const template = 'Patient {{patient.name}} has appointment with {{provider.name}}.';
      const variables = {
        patient: { name: 'Jane Doe' },
        provider: { name: 'Dr. Smith' }
      };
      
      const result = notificationService.processTemplate(template, variables);
      
      expect(result).toBe('Patient Jane Doe has appointment with Dr. Smith.');
    });
  });

  describe('getInAppNotifications', () => {
    it('should retrieve in-app notifications for user', async () => {
      const mockNotifications = [
        {
          id: 'notif-001',
          title: 'Authorization Approved',
          message: 'Your authorization has been approved',
          read: false,
          created_at: new Date()
        }
      ];
      
      mockQuery.mockResolvedValueOnce({ rows: mockNotifications });
      
      const result = await notificationService.getInAppNotifications('user-123');
      
      expect(result).toEqual(mockNotifications);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM in_app_notifications'),
        expect.arrayContaining(['user-123'])
      );
    });

    it('should support pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      await notificationService.getInAppNotifications('user-123', {
        page: 2,
        limit: 10
      });
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining(['user-123', 10, 10]) // limit, offset
      );
    });

    it('should filter unread notifications only', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      await notificationService.getInAppNotifications('user-123', {
        unreadOnly: true
      });
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('read = false'),
        expect.arrayContaining(['user-123'])
      );
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'notif-001' }] });
      
      const result = await notificationService.markNotificationAsRead('notif-001', 'user-123');
      
      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE in_app_notifications'),
        expect.arrayContaining(['notif-001', 'user-123'])
      );
    });

    it('should handle non-existent notifications', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      const result = await notificationService.markNotificationAsRead('invalid-id', 'user-123');
      
      expect(result).toBe(false);
    });
  });

  describe('queue processing', () => {
    beforeEach(() => {
      notificationService.queue = [
        {
          id: 'queue-001',
          type: 'authorization_approved',
          recipient: { email: 'test@example.com' },
          data: { authId: 'auth-001' },
          attempts: 0,
          maxAttempts: 3
        }
      ];
    });

    it('should process queued notifications', async () => {
      mockEmailTransporter.sendMail.mockResolvedValueOnce({ messageId: 'email-123' });
      mockQuery.mockResolvedValue({ rows: [] });
      
      await notificationService.processQueue();
      
      expect(notificationService.queue).toHaveLength(0);
      expect(mockEmailTransporter.sendMail).toHaveBeenCalled();
    });

    it('should retry failed notifications', async () => {
      mockEmailTransporter.sendMail.mockRejectedValueOnce(new Error('Temporary failure'));
      mockQuery.mockResolvedValue({ rows: [] });
      
      await notificationService.processQueue();
      
      expect(notificationService.queue[0].attempts).toBe(1);
      expect(notificationService.queue).toHaveLength(1); // Still in queue for retry
    });

    it('should remove notifications after max attempts', async () => {
      notificationService.queue[0].attempts = 3;
      mockEmailTransporter.sendMail.mockRejectedValueOnce(new Error('Permanent failure'));
      mockQuery.mockResolvedValue({ rows: [] });
      
      await notificationService.processQueue();
      
      expect(notificationService.queue).toHaveLength(0); // Removed after max attempts
    });
  });

  describe('scheduled notifications', () => {
    it('should send expiring authorization notifications', async () => {
      const mockExpiringAuths = [
        {
          id: 'auth-001',
          patient_name: 'John Doe',
          provider_email: 'provider@example.com',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day
        }
      ];
      
      mockQuery.mockResolvedValueOnce({ rows: mockExpiringAuths });
      mockEmailTransporter.sendMail.mockResolvedValueOnce({ messageId: 'email-123' });
      
      await notificationService.sendExpiringAuthorizationNotifications();
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('expires_at BETWEEN')
      );
      expect(mockEmailTransporter.sendMail).toHaveBeenCalled();
    });

    it('should send pending authorization reminders', async () => {
      const mockPendingAuths = [
        {
          id: 'auth-002',
          patient_name: 'Jane Smith',
          provider_email: 'provider@example.com',
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
        }
      ];
      
      mockQuery.mockResolvedValueOnce({ rows: mockPendingAuths });
      mockEmailTransporter.sendMail.mockResolvedValueOnce({ messageId: 'email-124' });
      
      await notificationService.sendPendingAuthorizationReminders();
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('current_state = \'pending_review\'')
      );
      expect(mockEmailTransporter.sendMail).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection lost'));
      
      await expect(
        notificationService.sendNotification('test', {}, {})
      ).rejects.toThrow('Database connection lost');
    });

    it('should handle invalid notification types', async () => {
      await expect(
        notificationService.sendNotification(null, {}, {})
      ).rejects.toThrow('Notification type is required');
    });

    it('should handle malformed recipient data', async () => {
      await expect(
        notificationService.sendNotification('test', null, {})
      ).rejects.toThrow('Recipient is required');
    });
  });

  describe('performance', () => {
    it('should process notifications within reasonable time', async () => {
      const startTime = Date.now();
      
      mockEmailTransporter.sendMail.mockResolvedValueOnce({ messageId: 'email-123' });
      mockQuery.mockResolvedValue({ rows: [] });
      
      await notificationService.sendNotification(
        'authorization_approved',
        { email: 'test@example.com', userId: 'user-123' },
        { authId: 'auth-001' }
      );
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500); // Should complete within 500ms
    });
  });
});