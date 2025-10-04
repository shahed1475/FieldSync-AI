const http = require('http');
const url = require('url');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Simple JSON response helper
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Simple request body parser
function parseBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      const parsed = body ? JSON.parse(body) : {};
      callback(null, parsed);
    } catch (error) {
      callback(error, null);
    }
  });
}

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`${new Date().toISOString()} - ${method} ${pathname}`);

  // Routes
  if (pathname === '/health' && method === 'GET') {
    sendJSON(res, 200, {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      message: 'FieldSync AI Backend is running (basic mode)'
    });
  } 
  else if (pathname === '/api/status' && method === 'GET') {
    sendJSON(res, 200, {
      success: true,
      message: 'FieldSync AI Backend is running in basic mode',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      features: {
        database: false,
        authentication: false,
        ssl: false,
        integrations: false
      }
    });
  }
  else if (pathname === '/api/test' && method === 'POST') {
    parseBody(req, (error, body) => {
      if (error) {
        sendJSON(res, 400, {
          success: false,
          error: 'Invalid JSON in request body'
        });
        return;
      }

      sendJSON(res, 200, {
        success: true,
        message: 'Test endpoint working',
        received: body,
        timestamp: new Date().toISOString()
      });
    });
  }
  else if (pathname === '/api/errors/test' && method === 'GET') {
    // Test error handling
    sendJSON(res, 500, {
      success: false,
      error: 'This is a test error',
      timestamp: new Date().toISOString()
    });
  }
  else {
    // 404 handler
    sendJSON(res, 404, {
      success: false,
      message: `Route ${method} ${pathname} not found`,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 FieldSync AI Backend (Basic Mode) running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Status: http://localhost:${PORT}/api/status`);
  console.log(`🧪 Test POST: http://localhost:${PORT}/api/test`);
  console.log(`❌ Test Error: http://localhost:${PORT}/api/errors/test`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('Note: Running in basic mode without external dependencies');
  console.log('This server provides core functionality for testing purposes');
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = server;