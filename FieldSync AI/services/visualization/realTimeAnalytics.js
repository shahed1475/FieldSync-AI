/**
 * Real-Time Analytics Service
 * Handles WebSocket connections, live data streaming, and real-time dashboard updates
 */

const EventEmitter = require('events');
const WebSocket = require('ws');

class RealTimeAnalyticsService extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map();
    this.dataStreams = new Map();
    this.updateIntervals = new Map();
    this.wsServer = null;
    
    this.config = {
      defaultUpdateInterval: 5000, // 5 seconds
      maxConnections: 100,
      heartbeatInterval: 30000, // 30 seconds
      dataRetentionTime: 300000, // 5 minutes
      maxDataPoints: 1000
    };

    this.metrics = {
      connectionsCount: 0,
      messagesPerSecond: 0,
      dataPointsProcessed: 0,
      lastUpdate: null
    };
  }

  /**
   * Initialize WebSocket server
   * @param {Object} server - HTTP server instance
   * @param {Object} options - Configuration options
   */
  initialize(server, options = {}) {
    try {
      this.config = { ...this.config, ...options };
      
      this.wsServer = new WebSocket.Server({ 
        server,
        path: '/ws/analytics',
        maxPayload: 1024 * 1024 // 1MB max payload
      });

      this.wsServer.on('connection', (ws, request) => {
        this.handleConnection(ws, request);
      });

      this.wsServer.on('error', (error) => {
        console.error('WebSocket server error:', error);
        this.emit('error', error);
      });

      // Start heartbeat interval
      this.startHeartbeat();
      
      // Start metrics collection
      this.startMetricsCollection();

      console.log('Real-time analytics service initialized');
      this.emit('initialized');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize real-time analytics:', error);
      return false;
    }
  }

  /**
   * Handle new WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} request - HTTP request object
   */
  handleConnection(ws, request) {
    try {
      const connectionId = this.generateConnectionId();
      const clientInfo = this.extractClientInfo(request);
      
      // Store connection
      this.connections.set(connectionId, {
        ws,
        id: connectionId,
        clientInfo,
        subscriptions: new Set(),
        lastActivity: Date.now(),
        isAlive: true
      });

      this.metrics.connectionsCount++;

      // Set up connection handlers
      ws.on('message', (message) => {
        this.handleMessage(connectionId, message);
      });

      ws.on('close', () => {
        this.handleDisconnection(connectionId);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for connection ${connectionId}:`, error);
        this.handleDisconnection(connectionId);
      });

      ws.on('pong', () => {
        const connection = this.connections.get(connectionId);
        if (connection) {
          connection.isAlive = true;
          connection.lastActivity = Date.now();
        }
      });

      // Send welcome message
      this.sendMessage(connectionId, {
        type: 'connection_established',
        connectionId,
        timestamp: new Date().toISOString(),
        config: {
          updateInterval: this.config.defaultUpdateInterval,
          maxDataPoints: this.config.maxDataPoints
        }
      });

      console.log(`New WebSocket connection established: ${connectionId}`);
      this.emit('connection', { connectionId, clientInfo });

    } catch (error) {
      console.error('Error handling WebSocket connection:', error);
      ws.close();
    }
  }

  /**
   * Handle incoming WebSocket message
   * @param {string} connectionId - Connection identifier
   * @param {Buffer} message - Raw message data
   */
  handleMessage(connectionId, message) {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) return;

      connection.lastActivity = Date.now();
      
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'subscribe':
          this.handleSubscription(connectionId, data);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscription(connectionId, data);
          break;
          
        case 'request_data':
          this.handleDataRequest(connectionId, data);
          break;
          
        case 'update_config':
          this.handleConfigUpdate(connectionId, data);
          break;
          
        case 'ping':
          this.sendMessage(connectionId, { type: 'pong', timestamp: new Date().toISOString() });
          break;
          
        default:
          console.warn(`Unknown message type: ${data.type}`);
      }

      this.metrics.messagesPerSecond++;
      
    } catch (error) {
      console.error(`Error handling message from ${connectionId}:`, error);
      this.sendMessage(connectionId, {
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle client subscription to data streams
   * @param {string} connectionId - Connection identifier
   * @param {Object} data - Subscription data
   */
  handleSubscription(connectionId, data) {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) return;

      const { streamId, filters, updateInterval } = data;
      
      if (!streamId) {
        this.sendMessage(connectionId, {
          type: 'error',
          message: 'Stream ID is required for subscription',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Add subscription
      connection.subscriptions.add(streamId);
      
      // Initialize data stream if it doesn't exist
      if (!this.dataStreams.has(streamId)) {
        this.initializeDataStream(streamId, filters);
      }

      // Set up update interval for this connection
      const interval = updateInterval || this.config.defaultUpdateInterval;
      this.setupUpdateInterval(connectionId, streamId, interval);

      // Send current data
      const currentData = this.dataStreams.get(streamId);
      if (currentData && currentData.data.length > 0) {
        this.sendMessage(connectionId, {
          type: 'data_update',
          streamId,
          data: currentData.data.slice(-50), // Send last 50 points
          timestamp: new Date().toISOString()
        });
      }

      this.sendMessage(connectionId, {
        type: 'subscription_confirmed',
        streamId,
        updateInterval: interval,
        timestamp: new Date().toISOString()
      });

      console.log(`Connection ${connectionId} subscribed to stream ${streamId}`);
      
    } catch (error) {
      console.error(`Error handling subscription for ${connectionId}:`, error);
    }
  }

  /**
   * Handle client unsubscription from data streams
   * @param {string} connectionId - Connection identifier
   * @param {Object} data - Unsubscription data
   */
  handleUnsubscription(connectionId, data) {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) return;

      const { streamId } = data;
      
      if (connection.subscriptions.has(streamId)) {
        connection.subscriptions.delete(streamId);
        
        // Clear update interval
        const intervalKey = `${connectionId}_${streamId}`;
        if (this.updateIntervals.has(intervalKey)) {
          clearInterval(this.updateIntervals.get(intervalKey));
          this.updateIntervals.delete(intervalKey);
        }

        this.sendMessage(connectionId, {
          type: 'unsubscription_confirmed',
          streamId,
          timestamp: new Date().toISOString()
        });

        console.log(`Connection ${connectionId} unsubscribed from stream ${streamId}`);
      }
      
    } catch (error) {
      console.error(`Error handling unsubscription for ${connectionId}:`, error);
    }
  }

  /**
   * Handle data request from client
   * @param {string} connectionId - Connection identifier
   * @param {Object} data - Request data
   */
  handleDataRequest(connectionId, data) {
    try {
      const { streamId, timeRange, limit } = data;
      
      const streamData = this.dataStreams.get(streamId);
      if (!streamData) {
        this.sendMessage(connectionId, {
          type: 'error',
          message: `Stream ${streamId} not found`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      let responseData = streamData.data;

      // Apply time range filter
      if (timeRange) {
        const startTime = new Date(timeRange.start).getTime();
        const endTime = new Date(timeRange.end).getTime();
        responseData = responseData.filter(point => {
          const pointTime = new Date(point.timestamp).getTime();
          return pointTime >= startTime && pointTime <= endTime;
        });
      }

      // Apply limit
      if (limit && limit > 0) {
        responseData = responseData.slice(-limit);
      }

      this.sendMessage(connectionId, {
        type: 'data_response',
        streamId,
        data: responseData,
        totalPoints: responseData.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`Error handling data request for ${connectionId}:`, error);
    }
  }

  /**
   * Initialize a new data stream
   * @param {string} streamId - Stream identifier
   * @param {Object} filters - Stream filters
   */
  initializeDataStream(streamId, filters = {}) {
    try {
      this.dataStreams.set(streamId, {
        id: streamId,
        filters,
        data: [],
        lastUpdate: Date.now(),
        subscribers: new Set()
      });

      // Start generating sample data for demo purposes
      this.startSampleDataGeneration(streamId);
      
      console.log(`Initialized data stream: ${streamId}`);
      
    } catch (error) {
      console.error(`Error initializing data stream ${streamId}:`, error);
    }
  }

  /**
   * Add data point to stream
   * @param {string} streamId - Stream identifier
   * @param {Object} dataPoint - Data point to add
   */
  addDataPoint(streamId, dataPoint) {
    try {
      const stream = this.dataStreams.get(streamId);
      if (!stream) return false;

      // Add timestamp if not present
      if (!dataPoint.timestamp) {
        dataPoint.timestamp = new Date().toISOString();
      }

      stream.data.push(dataPoint);
      stream.lastUpdate = Date.now();

      // Limit data points to prevent memory issues
      if (stream.data.length > this.config.maxDataPoints) {
        stream.data = stream.data.slice(-this.config.maxDataPoints);
      }

      // Broadcast to subscribers
      this.broadcastToSubscribers(streamId, {
        type: 'data_point',
        streamId,
        dataPoint,
        timestamp: new Date().toISOString()
      });

      this.metrics.dataPointsProcessed++;
      this.metrics.lastUpdate = new Date().toISOString();

      return true;
    } catch (error) {
      console.error(`Error adding data point to stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Broadcast message to all subscribers of a stream
   * @param {string} streamId - Stream identifier
   * @param {Object} message - Message to broadcast
   */
  broadcastToSubscribers(streamId, message) {
    try {
      this.connections.forEach((connection, connectionId) => {
        if (connection.subscriptions.has(streamId)) {
          this.sendMessage(connectionId, message);
        }
      });
    } catch (error) {
      console.error(`Error broadcasting to subscribers of ${streamId}:`, error);
    }
  }

  /**
   * Send message to specific connection
   * @param {string} connectionId - Connection identifier
   * @param {Object} message - Message to send
   */
  sendMessage(connectionId, message) {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
        return false;
      }

      connection.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Error sending message to ${connectionId}:`, error);
      return false;
    }
  }

  /**
   * Handle connection disconnection
   * @param {string} connectionId - Connection identifier
   */
  handleDisconnection(connectionId) {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) return;

      // Clear all update intervals for this connection
      connection.subscriptions.forEach(streamId => {
        const intervalKey = `${connectionId}_${streamId}`;
        if (this.updateIntervals.has(intervalKey)) {
          clearInterval(this.updateIntervals.get(intervalKey));
          this.updateIntervals.delete(intervalKey);
        }
      });

      // Remove connection
      this.connections.delete(connectionId);
      this.metrics.connectionsCount--;

      console.log(`Connection ${connectionId} disconnected`);
      this.emit('disconnection', { connectionId });
      
    } catch (error) {
      console.error(`Error handling disconnection for ${connectionId}:`, error);
    }
  }

  /**
   * Setup update interval for connection and stream
   * @param {string} connectionId - Connection identifier
   * @param {string} streamId - Stream identifier
   * @param {number} interval - Update interval in milliseconds
   */
  setupUpdateInterval(connectionId, streamId, interval) {
    try {
      const intervalKey = `${connectionId}_${streamId}`;
      
      // Clear existing interval
      if (this.updateIntervals.has(intervalKey)) {
        clearInterval(this.updateIntervals.get(intervalKey));
      }

      // Set new interval
      const intervalId = setInterval(() => {
        const stream = this.dataStreams.get(streamId);
        const connection = this.connections.get(connectionId);
        
        if (!stream || !connection || connection.ws.readyState !== WebSocket.OPEN) {
          clearInterval(intervalId);
          this.updateIntervals.delete(intervalKey);
          return;
        }

        // Send latest data points
        const recentData = stream.data.slice(-10); // Last 10 points
        if (recentData.length > 0) {
          this.sendMessage(connectionId, {
            type: 'data_update',
            streamId,
            data: recentData,
            timestamp: new Date().toISOString()
          });
        }
      }, interval);

      this.updateIntervals.set(intervalKey, intervalId);
      
    } catch (error) {
      console.error(`Error setting up update interval for ${connectionId}:`, error);
    }
  }

  /**
   * Start sample data generation for demo purposes
   * @param {string} streamId - Stream identifier
   */
  startSampleDataGeneration(streamId) {
    const generateData = () => {
      const baseValue = 100;
      const trend = Math.sin(Date.now() / 60000) * 20; // Slow sine wave
      const noise = (Math.random() - 0.5) * 10; // Random noise
      const spike = Math.random() < 0.05 ? (Math.random() - 0.5) * 50 : 0; // 5% chance of spike
      
      const value = baseValue + trend + noise + spike;
      
      this.addDataPoint(streamId, {
        value: Math.round(value * 100) / 100,
        timestamp: new Date().toISOString(),
        metadata: {
          trend: Math.round(trend * 100) / 100,
          noise: Math.round(noise * 100) / 100,
          spike: Math.round(spike * 100) / 100
        }
      });
    };

    // Generate initial data
    for (let i = 0; i < 50; i++) {
      setTimeout(() => generateData(), i * 100);
    }

    // Continue generating data
    setInterval(generateData, 2000);
  }

  /**
   * Start heartbeat to detect dead connections
   */
  startHeartbeat() {
    setInterval(() => {
      this.connections.forEach((connection, connectionId) => {
        if (!connection.isAlive) {
          console.log(`Terminating dead connection: ${connectionId}`);
          connection.ws.terminate();
          this.handleDisconnection(connectionId);
          return;
        }

        connection.isAlive = false;
        connection.ws.ping();
      });
    }, this.config.heartbeatInterval);
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      // Reset per-second metrics
      this.metrics.messagesPerSecond = 0;
      
      // Emit metrics
      this.emit('metrics', { ...this.metrics });
    }, 1000);
  }

  /**
   * Get current service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeConnections: this.connections.size,
      activeStreams: this.dataStreams.size,
      totalSubscriptions: Array.from(this.connections.values())
        .reduce((total, conn) => total + conn.subscriptions.size, 0)
    };
  }

  /**
   * Generate unique connection ID
   * @returns {string} Connection ID
   */
  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract client information from request
   * @param {Object} request - HTTP request object
   * @returns {Object} Client information
   */
  extractClientInfo(request) {
    return {
      ip: request.socket.remoteAddress,
      userAgent: request.headers['user-agent'],
      origin: request.headers.origin,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Shutdown the service gracefully
   */
  shutdown() {
    try {
      // Clear all intervals
      this.updateIntervals.forEach(intervalId => clearInterval(intervalId));
      this.updateIntervals.clear();

      // Close all connections
      this.connections.forEach((connection, connectionId) => {
        connection.ws.close();
      });
      this.connections.clear();

      // Close WebSocket server
      if (this.wsServer) {
        this.wsServer.close();
      }

      console.log('Real-time analytics service shut down');
      this.emit('shutdown');
      
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}

module.exports = RealTimeAnalyticsService;