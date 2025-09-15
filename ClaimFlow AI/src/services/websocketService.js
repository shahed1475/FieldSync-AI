const WebSocket = require('ws');
const { logger } = require('../utils/logger');
const { getClient } = require('../database/connection');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map();
    this.dashboardDataCache = {
      stats: null,
      claims: null,
      recentActivities: null,
      lastUpdate: null
    };
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ server });
    
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      
      // Store client connection
      this.clients.set(clientId, {
        ws,
        userId: null,
        subscriptions: new Set(['dashboard']) // Default subscription to dashboard updates
      });
      
      logger.info(`WebSocket client connected: ${clientId}`);
      
      // Send current dashboard data to new client
      this.sendDashboardData(clientId);
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(clientId, data);
        } catch (error) {
          logger.error('Invalid WebSocket message:', error);
        }
      });
      
      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info(`WebSocket client disconnected: ${clientId}`);
      });
      
      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });
    });
    
    // Start periodic data updates
    this.startPeriodicUpdates();
    
    logger.info('WebSocket service initialized');
  }
  
  generateClientId() {
    return Math.random().toString(36).substring(2, 15);
  }
  
  handleClientMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    switch (data.type) {
      case 'subscribe':
        if (data.channel) {
          client.subscriptions.add(data.channel);
          logger.info(`Client ${clientId} subscribed to ${data.channel}`);
        }
        break;
        
      case 'unsubscribe':
        if (data.channel) {
          client.subscriptions.delete(data.channel);
          logger.info(`Client ${clientId} unsubscribed from ${data.channel}`);
        }
        break;
        
      case 'auth':
        client.userId = data.userId;
        logger.info(`Client ${clientId} authenticated as user ${data.userId}`);
        break;
    }
  }
  
  async fetchDashboardData() {
    try {
      const client = getClient();
      
      // Fetch dashboard statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total_authorizations,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied,
          AVG(CASE WHEN status = 'approved' AND approved_at IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (approved_at - created_at))/3600 END) as avg_approval_time
        FROM authorizations 
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      `;
      
      const statsResult = await client.query(statsQuery);
      
      // Fetch recent claims data for chart
      const claimsQuery = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count
        FROM authorizations 
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `;
      
      const claimsResult = await client.query(claimsQuery);
      
      // Fetch recent activities
      const activitiesQuery = `
        SELECT 
          a.id,
          a.status,
          a.created_at,
          a.updated_at,
          p.first_name || ' ' || p.last_name as patient_name,
          pr.name as practice_name
        FROM authorizations a
        LEFT JOIN patients p ON a.patient_id = p.id
        LEFT JOIN practices pr ON a.practice_id = pr.id
        ORDER BY a.updated_at DESC
        LIMIT 10
      `;
      
      const activitiesResult = await client.query(activitiesQuery);
      
      // Update cache
      this.dashboardDataCache = {
        stats: statsResult.rows[0],
        claims: claimsResult.rows,
        recentActivities: activitiesResult.rows,
        lastUpdate: new Date().toISOString()
      };
      
      return this.dashboardDataCache;
    } catch (error) {
      logger.error('Error fetching dashboard data:', error);
      return null;
    }
  }
  
  async sendDashboardData(clientId = null) {
    const data = await this.fetchDashboardData();
    if (!data) return;
    
    const message = {
      type: 'dashboard_update',
      data,
      timestamp: new Date().toISOString()
    };
    
    if (clientId) {
      // Send to specific client
      const client = this.clients.get(clientId);
      if (client && client.subscriptions.has('dashboard')) {
        this.sendToClient(clientId, message);
      }
    } else {
      // Broadcast to all subscribed clients
      this.broadcast('dashboard', message);
    }
  }
  
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Error sending message to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    }
  }
  
  broadcast(channel, message) {
    let sentCount = 0;
    
    this.clients.forEach((client, clientId) => {
      if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          logger.error(`Error broadcasting to client ${clientId}:`, error);
          this.clients.delete(clientId);
        }
      }
    });
    
    logger.info(`Broadcasted ${message.type} to ${sentCount} clients on channel ${channel}`);
  }
  
  startPeriodicUpdates() {
    // Update dashboard data every 30 seconds
    setInterval(() => {
      this.sendDashboardData();
    }, 30000);
    
    logger.info('Started periodic dashboard updates (30s interval)');
  }
  
  // Method to trigger immediate update when data changes
  async triggerDashboardUpdate() {
    await this.sendDashboardData();
  }
  
  // Method to send custom real-time updates
  sendCustomUpdate(channel, data) {
    const message = {
      type: 'custom_update',
      channel,
      data,
      timestamp: new Date().toISOString()
    };
    
    this.broadcast(channel, message);
  }
  
  getConnectedClientsCount() {
    return this.clients.size;
  }
  
  getClientsByChannel(channel) {
    let count = 0;
    this.clients.forEach(client => {
      if (client.subscriptions.has(channel)) {
        count++;
      }
    });
    return count;
  }
}

module.exports = new WebSocketService();