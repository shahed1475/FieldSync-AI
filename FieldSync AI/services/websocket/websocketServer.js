const EventEmitter = require('events');

/**
 * Simple WebSocket-like server using Server-Sent Events (SSE)
 * This provides real-time updates without requiring the ws package
 */
class WebSocketServer extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.clients = new Map();
        this.isInitialized = false;
    }

    initialize() {
        if (this.isInitialized) return;

        // Add SSE endpoint to the Express app
        this.server.on('request', (req, res) => {
            if (req.url === '/api/events' && req.method === 'GET') {
                this.handleSSEConnection(req, res);
            }
        });

        this.isInitialized = true;
        console.log('WebSocket-like server initialized using Server-Sent Events');
    }

    handleSSEConnection(req, res) {
        const clientId = this.generateClientId();
        
        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Store client connection
        const client = {
            id: clientId,
            response: res,
            subscriptions: new Set(),
            lastPing: Date.now()
        };

        this.clients.set(clientId, client);

        // Send initial connection message
        this.sendToClient(clientId, {
            type: 'connection',
            data: { clientId, timestamp: new Date().toISOString() }
        });

        // Handle client disconnect
        req.on('close', () => {
            this.clients.delete(clientId);
            console.log(`Client ${clientId} disconnected`);
        });

        // Send periodic ping to keep connection alive
        const pingInterval = setInterval(() => {
            if (this.clients.has(clientId)) {
                this.sendToClient(clientId, { type: 'ping', data: { timestamp: Date.now() } });
            } else {
                clearInterval(pingInterval);
            }
        }, 30000); // Ping every 30 seconds

        console.log(`Client ${clientId} connected via SSE`);
    }

    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.response) {
            try {
                const data = `data: ${JSON.stringify(message)}\n\n`;
                client.response.write(data);
                client.lastPing = Date.now();
            } catch (error) {
                console.error(`Error sending message to client ${clientId}:`, error);
                this.clients.delete(clientId);
            }
        }
    }

    broadcast(message) {
        for (const [clientId] of this.clients) {
            this.sendToClient(clientId, message);
        }
    }

    // Integration status updates
    broadcastIntegrationStatus(dataSourceId, status, details = {}) {
        const message = {
            type: 'integration_status',
            data: {
                dataSourceId,
                status,
                details,
                timestamp: new Date().toISOString()
            }
        };
        this.broadcast(message);
    }

    // Sync progress updates
    broadcastSyncProgress(dataSourceId, progress, details = {}) {
        const message = {
            type: 'sync_progress',
            data: {
                dataSourceId,
                progress,
                details,
                timestamp: new Date().toISOString()
            }
        };
        this.broadcast(message);
    }

    // Sync completion notification
    broadcastSyncComplete(dataSourceId, result) {
        const message = {
            type: 'sync_complete',
            data: {
                dataSourceId,
                result,
                timestamp: new Date().toISOString()
            }
        };
        this.broadcast(message);
    }

    // Sync error notification
    broadcastSyncError(dataSourceId, error) {
        const message = {
            type: 'sync_error',
            data: {
                dataSourceId,
                error: error.message || error,
                timestamp: new Date().toISOString()
            }
        };
        this.broadcast(message);
    }

    // System notifications
    broadcastSystemNotification(type, message, level = 'info') {
        const notification = {
            type: 'system_notification',
            data: {
                notificationType: type,
                message,
                level,
                timestamp: new Date().toISOString()
            }
        };
        this.broadcast(notification);
    }

    // Data source updates
    broadcastDataSourceUpdate(dataSourceId, updateType, data) {
        const message = {
            type: 'data_source_update',
            data: {
                dataSourceId,
                updateType,
                data,
                timestamp: new Date().toISOString()
            }
        };
        this.broadcast(message);
    }

    // Scheduler notifications
    broadcastSchedulerEvent(eventType, details) {
        const message = {
            type: 'scheduler_event',
            data: {
                eventType,
                details,
                timestamp: new Date().toISOString()
            }
        };
        this.broadcast(message);
    }

    // Get connected clients count
    getConnectedClientsCount() {
        return this.clients.size;
    }

    // Get client info
    getClientInfo() {
        const clientInfo = [];
        for (const [clientId, client] of this.clients) {
            clientInfo.push({
                id: clientId,
                subscriptions: Array.from(client.subscriptions),
                lastPing: client.lastPing,
                connected: Date.now() - client.lastPing < 60000 // Consider connected if pinged within last minute
            });
        }
        return clientInfo;
    }
}

module.exports = WebSocketServer;