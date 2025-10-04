const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Simple HTTP server for testing
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Serve static files
    if (pathname === '/' || pathname === '/integration-manager.html') {
        const filePath = path.join(__dirname, 'integration-manager.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // SSE endpoint for real-time updates
    if (pathname === '/api/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // Send initial connection message
        res.write('data: {"type":"connected","message":"SSE connection established"}\n\n');

        // Send periodic updates
        const interval = setInterval(() => {
            const data = {
                type: 'integration_status',
                dataSourceId: 'test-123',
                status: 'active',
                lastSync: new Date().toISOString(),
                message: 'Integration running smoothly'
            };
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        }, 5000);

        // Clean up on client disconnect
        req.on('close', () => {
            clearInterval(interval);
        });
        return;
    }

    // Mock API endpoints
    if (pathname.startsWith('/api/')) {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            let requestData = {};
            try {
                requestData = body ? JSON.parse(body) : {};
            } catch (e) {
                // Handle non-JSON requests
            }

            // Mock responses based on endpoint
            let response = {};
            
            if (pathname === '/api/data-sources') {
                if (req.method === 'GET') {
                    response = {
                        success: true,
                        data: [
                            {
                                id: 'ds-1',
                                name: 'Google Sheets - Sales Data',
                                type: 'google_sheets',
                                status: 'active',
                                lastSync: new Date().toISOString(),
                                metadata: { sheetId: '1234567890' }
                            },
                            {
                                id: 'ds-2',
                                name: 'QuickBooks - Financial Data',
                                type: 'quickbooks',
                                status: 'inactive',
                                lastSync: new Date(Date.now() - 86400000).toISOString(),
                                metadata: { companyId: 'qb-company-123' }
                            }
                        ]
                    };
                } else if (req.method === 'POST') {
                    response = {
                        success: true,
                        message: 'Data source created successfully',
                        data: {
                            id: 'ds-' + Date.now(),
                            ...requestData,
                            status: 'active',
                            createdAt: new Date().toISOString()
                        }
                    };
                }
            } else if (pathname === '/api/integrations/test-connection') {
                response = {
                    success: Math.random() > 0.3, // 70% success rate
                    message: Math.random() > 0.3 ? 'Connection successful' : 'Connection failed - invalid credentials'
                };
            } else if (pathname === '/api/integrations/sync-data') {
                response = {
                    success: true,
                    message: 'Data synchronization started',
                    syncId: 'sync-' + Date.now()
                };
            } else if (pathname === '/api/integrations/detect-schema') {
                response = {
                    success: true,
                    schema: {
                        tables: [
                            { name: 'customers', columns: ['id', 'name', 'email', 'created_at'] },
                            { name: 'orders', columns: ['id', 'customer_id', 'amount', 'status', 'order_date'] }
                        ]
                    }
                };
            } else {
                response = { success: true, message: 'Mock API response' };
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
        });
        return;
    }

    // 404 for other routes
    res.writeHead(404);
    res.end('Not found');
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Test server running on http://localhost:${PORT}`);
    console.log('SSE WebSocket Server initialized');
    console.log('Sync Scheduler initialized');
    console.log('Integration Manager UI available at: http://localhost:3000');
});