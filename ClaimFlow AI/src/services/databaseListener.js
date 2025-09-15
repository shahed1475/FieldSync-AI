const { getClient } = require('../database/connection');
const { logger } = require('../utils/logger');
const websocketService = require('./websocketService');

class DatabaseListener {
  constructor() {
    this.client = null;
    this.isListening = false;
  }

  async initialize() {
    try {
      this.client = getClient();
      
      // Create notification functions and triggers for real-time updates
      await this.createNotificationTriggers();
      
      // Start listening for database notifications
      await this.startListening();
      
      logger.info('Database listener initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database listener:', error);
      throw error;
    }
  }

  async createNotificationTriggers() {
    try {
      // Create notification function
      const createNotificationFunction = `
        CREATE OR REPLACE FUNCTION notify_dashboard_change()
        RETURNS TRIGGER AS $$
        BEGIN
          -- Notify about authorization changes
          IF TG_TABLE_NAME = 'authorizations' THEN
            PERFORM pg_notify('dashboard_update', json_build_object(
              'table', TG_TABLE_NAME,
              'operation', TG_OP,
              'id', COALESCE(NEW.id, OLD.id),
              'status', CASE WHEN NEW IS NOT NULL THEN NEW.status ELSE NULL END,
              'timestamp', NOW()
            )::text);
          END IF;
          
          -- Notify about patient changes
          IF TG_TABLE_NAME = 'patients' THEN
            PERFORM pg_notify('dashboard_update', json_build_object(
              'table', TG_TABLE_NAME,
              'operation', TG_OP,
              'id', COALESCE(NEW.id, OLD.id),
              'timestamp', NOW()
            )::text);
          END IF;
          
          RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
      `;
      
      await this.client.query(createNotificationFunction);
      
      // Create triggers for authorizations table
      const authorizationTrigger = `
        DROP TRIGGER IF EXISTS authorization_change_trigger ON authorizations;
        CREATE TRIGGER authorization_change_trigger
        AFTER INSERT OR UPDATE OR DELETE ON authorizations
        FOR EACH ROW EXECUTE FUNCTION notify_dashboard_change();
      `;
      
      await this.client.query(authorizationTrigger);
      
      // Create triggers for patients table
      const patientTrigger = `
        DROP TRIGGER IF EXISTS patient_change_trigger ON patients;
        CREATE TRIGGER patient_change_trigger
        AFTER INSERT OR UPDATE OR DELETE ON patients
        FOR EACH ROW EXECUTE FUNCTION notify_dashboard_change();
      `;
      
      await this.client.query(patientTrigger);
      
      logger.info('Database notification triggers created successfully');
    } catch (error) {
      logger.error('Failed to create notification triggers:', error);
      throw error;
    }
  }

  async startListening() {
    try {
      // Listen for dashboard updates
      await this.client.query('LISTEN dashboard_update');
      
      // Set up notification handler
      this.client.on('notification', async (msg) => {
        try {
          const payload = JSON.parse(msg.payload);
          await this.handleDatabaseNotification(msg.channel, payload);
        } catch (error) {
          logger.error('Error processing database notification:', error);
        }
      });
      
      this.isListening = true;
      logger.info('Started listening for database notifications');
    } catch (error) {
      logger.error('Failed to start database listening:', error);
      throw error;
    }
  }

  async handleDatabaseNotification(channel, payload) {
    logger.info(`Database notification received on ${channel}:`, payload);
    
    switch (channel) {
      case 'dashboard_update':
        // Trigger dashboard data refresh
        await websocketService.triggerDashboardUpdate();
        
        // Send specific update notification
        websocketService.sendCustomUpdate('dashboard', {
          type: 'data_change',
          table: payload.table,
          operation: payload.operation,
          id: payload.id,
          status: payload.status,
          timestamp: payload.timestamp
        });
        break;
        
      default:
        logger.warn(`Unhandled notification channel: ${channel}`);
    }
  }

  async stopListening() {
    try {
      if (this.client && this.isListening) {
        await this.client.query('UNLISTEN *');
        this.isListening = false;
        logger.info('Stopped listening for database notifications');
      }
    } catch (error) {
      logger.error('Error stopping database listener:', error);
    }
  }

  // Method to manually trigger dashboard update
  async triggerManualUpdate() {
    try {
      await websocketService.triggerDashboardUpdate();
      logger.info('Manual dashboard update triggered');
    } catch (error) {
      logger.error('Error triggering manual update:', error);
    }
  }

  // Health check method
  isHealthy() {
    return this.client && this.isListening;
  }

  // Get listener status
  getStatus() {
    return {
      isListening: this.isListening,
      hasClient: !!this.client,
      connectedClients: websocketService.getConnectedClientsCount(),
      dashboardSubscribers: websocketService.getClientsByChannel('dashboard')
    };
  }
}

module.exports = new DatabaseListener();