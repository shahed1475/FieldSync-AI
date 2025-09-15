const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { validateInput } = require('../middleware/validation');
const NotificationService = require('../services/notificationService');
const { pool } = require('../database/connection');

const router = express.Router();

// Rate limiting
const notificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // 50 requests per minute
  message: 'Too many notification requests'
});

// Initialize notification service
let notificationService;

const initializeNotificationService = async () => {
  try {
    notificationService = new NotificationService(pool);
    await notificationService.initialize();
    console.log('Notification service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize notification service:', error);
  }
};

initializeNotificationService();

// Get in-app notifications for current user
router.get('/in-app', 
  notificationLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      const { page = 1, limit = 20, unread_only = false } = req.query;
      
      const notifications = await notificationService.getInAppNotifications(
        req.user.id, 
        { 
          page: parseInt(page), 
          limit: parseInt(limit), 
          unreadOnly: unread_only === 'true' 
        }
      );
      
      // Get unread count
      const unreadQuery = `
        SELECT COUNT(*) as unread_count
        FROM in_app_notifications
        WHERE user_id = $1 AND read = false
      `;
      
      const unreadResult = await pool.query(unreadQuery, [req.user.id]);
      const unreadCount = parseInt(unreadResult.rows[0].unread_count);
      
      res.json({
        success: true,
        notifications,
        unreadCount,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Failed to get in-app notifications:', error);
      res.status(500).json({ success: false, error: 'Failed to load notifications' });
    }
  }
);

// Mark notification as read
router.patch('/in-app/:id/read', 
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const success = await notificationService.markNotificationAsRead(id, req.user.id);
      
      if (!success) {
        return res.status(404).json({ success: false, error: 'Notification not found' });
      }
      
      res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      res.status(500).json({ success: false, error: 'Failed to update notification' });
    }
  }
);

// Mark all notifications as read
router.patch('/in-app/read-all', 
  authenticateToken,
  async (req, res) => {
    try {
      const query = `
        UPDATE in_app_notifications
        SET read = 1, read_at = datetime('now')
        WHERE user_id = ? AND read = 0
      `;
      
      const result = await pool.query(query, [req.user.id]);
      
      res.json({ 
        success: true, 
        message: `Marked ${result.changes} notifications as read` 
      });
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      res.status(500).json({ success: false, error: 'Failed to update notifications' });
    }
  }
);

// Get notification preferences
router.get('/preferences', 
  authenticateToken,
  async (req, res) => {
    try {
      const query = `
        SELECT 
          notification_preferences,
          email_notifications,
          sms_notifications,
          in_app_notifications
        FROM users
        WHERE id = ?
      `;
      
      const result = await pool.query(query, [req.user.id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      const preferences = result.rows[0];
      
      res.json({
        success: true,
        preferences: {
          types: preferences.notification_preferences || [],
          email: preferences.email_notifications !== false,
          sms: preferences.sms_notifications === true,
          inApp: preferences.in_app_notifications !== false
        }
      });
    } catch (error) {
      console.error('Failed to get notification preferences:', error);
      res.status(500).json({ success: false, error: 'Failed to load preferences' });
    }
  }
);

// Update notification preferences
router.put('/preferences', 
  authenticateToken,
  validateInput({
    types: { required: false, type: 'array' },
    email: { required: false, type: 'boolean' },
    sms: { required: false, type: 'boolean' },
    inApp: { required: false, type: 'boolean' }
  }),
  auditLog('notification_preferences_update'),
  async (req, res) => {
    try {
      const { types, email, sms, inApp } = req.body;
      
      const updateQuery = `
        UPDATE users
        SET 
          notification_preferences = COALESCE(?, notification_preferences),
          email_notifications = COALESCE(?, email_notifications),
          sms_notifications = COALESCE(?, sms_notifications),
          in_app_notifications = COALESCE(?, in_app_notifications),
          updated_at = datetime('now')
        WHERE id = ?
      `;
      
      await pool.query(updateQuery, [
        types ? JSON.stringify(types) : null,
        email,
        sms,
        inApp,
        req.user.id
      ]);
      
      // Get updated preferences
      const selectQuery = `
        SELECT notification_preferences, email_notifications, sms_notifications, in_app_notifications
        FROM users WHERE id = ?
      `;
      const result = await pool.query(selectQuery, [req.user.id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      const preferences = result.rows[0];
      
      res.json({
        success: true,
        preferences: {
          types: preferences.notification_preferences || [],
          email: preferences.email_notifications !== false,
          sms: preferences.sms_notifications === true,
          inApp: preferences.in_app_notifications !== false
        },
        message: 'Notification preferences updated successfully'
      });
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
      res.status(500).json({ success: false, error: 'Failed to update preferences' });
    }
  }
);

// Send test notification (admin only)
router.post('/test', 
  authenticateToken,
  requireRole(['admin']),
  validateInput({
    type: { required: true, type: 'string' },
    recipient: { required: true, type: 'object' },
    data: { required: false, type: 'object' }
  }),
  auditLog('test_notification_send'),
  async (req, res) => {
    try {
      const { type, recipient, data = {} } = req.body;
      
      const notificationId = await notificationService.sendNotification(
        type,
        recipient,
        data,
        { maxAttempts: 1 }
      );
      
      res.json({
        success: true,
        notificationId,
        message: 'Test notification sent successfully'
      });
    } catch (error) {
      console.error('Failed to send test notification:', error);
      res.status(500).json({ success: false, error: 'Failed to send test notification' });
    }
  }
);

// Get notification templates (admin only)
router.get('/templates', 
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const query = `
        SELECT 
          id,
          template_name,
          template_type,
          subject,
          body_template,
          variables,
          active,
          created_at,
          updated_at
        FROM notification_templates
        ORDER BY template_name, template_type
      `;
      
      const result = await pool.query(query);
      
      res.json({
        success: true,
        templates: result.rows
      });
    } catch (error) {
      console.error('Failed to get notification templates:', error);
      res.status(500).json({ success: false, error: 'Failed to load templates' });
    }
  }
);

// Create or update notification template (admin only)
router.put('/templates/:name/:type', 
  authenticateToken,
  requireRole(['admin']),
  validateInput({
    subject: { required: true, type: 'string' },
    body_template: { required: true, type: 'string' },
    variables: { required: false, type: 'array' },
    active: { required: false, type: 'boolean' }
  }),
  auditLog('notification_template_update'),
  async (req, res) => {
    try {
      const { name, type } = req.params;
      const { subject, body_template, variables = [], active = true } = req.body;
      
      const upsertQuery = `
        INSERT INTO notification_templates (
          template_name, template_type, subject, body_template, 
          variables, active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (template_name, template_type)
        DO UPDATE SET
          subject = EXCLUDED.subject,
          body_template = EXCLUDED.body_template,
          variables = EXCLUDED.variables,
          active = EXCLUDED.active,
          updated_at = NOW()
        RETURNING *
      `;
      
      const result = await pool.query(upsertQuery, [
        name,
        type,
        subject,
        body_template,
        JSON.stringify(variables),
        active
      ]);
      
      // Reload templates in notification service
      await notificationService.loadTemplates();
      
      res.json({
        success: true,
        template: result.rows[0],
        message: 'Notification template updated successfully'
      });
    } catch (error) {
      console.error('Failed to update notification template:', error);
      res.status(500).json({ success: false, error: 'Failed to update template' });
    }
  }
);

// Get notification logs (admin only)
router.get('/logs', 
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, type, status } = req.query;
      const offset = (page - 1) * limit;
      
      let whereConditions = ['1=1'];
      let queryParams = [];
      
      if (type) {
        whereConditions.push('type = ?');
        queryParams.push(type);
      }
      
      if (status) {
        whereConditions.push('status = ?');
        queryParams.push(status);
      }
      
      const whereClause = whereConditions.join(' AND ');
      
      const query = `
        SELECT 
          id,
          notification_id,
          type,
          recipients,
          status,
          error_message,
          attempts,
          created_at
        FROM notification_logs
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      queryParams.push(limit, offset);
      
      const result = await pool.query(query, queryParams);
      
      // Get total count separately for SQLite
      const countQuery = `SELECT COUNT(*) as total FROM notification_logs WHERE ${whereClause}`;
      const countResult = await pool.query(countQuery, queryParams.slice(0, -2)); // Remove limit and offset
      const total = countResult.rows[0]?.total || 0;
      
      res.json({
        success: true,
        logs: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Failed to get notification logs:', error);
      res.status(500).json({ success: false, error: 'Failed to load notification logs' });
    }
  }
);

// Get notification statistics (admin only)
router.get('/stats', 
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const { period = '7d' } = req.query;
      
      let dateFilter = '';
      switch (period) {
        case '24h':
          dateFilter = "created_at >= datetime('now', '-1 day')";
          break;
        case '7d':
          dateFilter = "created_at >= datetime('now', '-7 days')";
          break;
        case '30d':
          dateFilter = "created_at >= datetime('now', '-30 days')";
          break;
        default:
          dateFilter = "created_at >= datetime('now', '-7 days')";
      }
      
      const statsQuery = `
        SELECT 
          COUNT(*) as total_notifications,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_notifications,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_notifications,
          COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued_notifications,
          COUNT(DISTINCT type) as unique_types,
          AVG(attempts) as avg_attempts
        FROM notification_logs
        WHERE ${dateFilter}
      `;
      
      const typeStatsQuery = `
        SELECT 
          type,
          COUNT(*) as count,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
        FROM notification_logs
        WHERE ${dateFilter}
        GROUP BY type
        ORDER BY count DESC
      `;
      
      const [statsResult, typeStatsResult] = await Promise.all([
        pool.query(statsQuery),
        pool.query(typeStatsQuery)
      ]);
      
      res.json({
        success: true,
        period,
        stats: statsResult.rows[0],
        typeStats: typeStatsResult.rows
      });
    } catch (error) {
      console.error('Failed to get notification statistics:', error);
      res.status(500).json({ success: false, error: 'Failed to load notification statistics' });
    }
  }
);

// WebSocket endpoint for real-time notifications
router.ws = (wss) => {
  if (!notificationService) return;
  
  // Listen for in-app notifications
  notificationService.on('inAppNotification', (data) => {
    // Send to specific user via WebSocket
    wss.clients.forEach(client => {
      if (client.userId === data.userId && client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'notification',
          data: data.notification
        }));
      }
    });
  });
};

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Notification route error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;