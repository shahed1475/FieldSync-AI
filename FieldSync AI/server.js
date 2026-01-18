const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
require('dotenv').config();

// Import middleware
const { 
  apiLimiter, 
  authLimiter, 
  queryLimiter, 
  sanitizeInput, 
  requestSizeLimiter, 
  sqlInjectionProtection,
  xssProtection,
  hppProtection,
  corsOptions
} = require('./middleware/security');

const { 
  performanceMonitoring,
  errorTracking,
  healthCheck,
  detailedHealthCheck,
  metricsCollection,
  getMetrics,
  requestId
} = require('./middleware/monitoring');

const { logger, requestLogger } = require('./config/logger');
const sslConfig = require('./config/ssl');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Request ID middleware (first)
app.use(requestId);

// HTTPS redirect middleware (if SSL is enabled)
app.use(sslConfig.getHttpsRedirectMiddleware());

// Security headers middleware
app.use(sslConfig.getSecurityHeadersMiddleware());

// Logging middleware
app.use(requestLogger);
app.use(morgan('combined', { stream: logger.stream }));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors(corsOptions));
app.use(xssProtection);
app.use(hppProtection);
app.use(compression());

// Body parsing middleware with size limits
app.use(requestSizeLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization and SQL injection protection
app.use(sanitizeInput);
app.use(sqlInjectionProtection);

// Performance and metrics monitoring
app.use(performanceMonitoring);
app.use(metricsCollection);

// Health check endpoints
app.get('/health', healthCheck);
app.get('/health/detailed', detailedHealthCheck);
app.get('/health/ssl', (req, res) => {
  res.json(sslConfig.getHealthStatus());
});
app.get('/metrics', getMetrics);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes with rate limiting
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/users', apiLimiter, require('./routes/users'));
app.use('/api/organizations', apiLimiter, require('./routes/organizations'));
app.use('/api/data-sources', apiLimiter, require('./routes/dataSources'));
app.use('/api/queries', queryLimiter, require('./routes/queries'));
app.use('/api/dashboards', apiLimiter, require('./routes/dashboards'));
app.use('/api/insights', apiLimiter, require('./routes/insights'));
app.use('/api/analytics', apiLimiter, require('./routes/analytics'));
app.use('/api/integrations', apiLimiter, require('./routes/integrations'));
app.use('/api/ai', queryLimiter, require('./routes/ai'));
app.use('/api/visualization', apiLimiter, require('./routes/visualization'));

// Serve static files from root directory for development
app.use(express.static(__dirname));

// Default route for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard-builder.html'));
});

// Error handling middleware (must be last)
app.use(errorTracking);

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  const server = global.server;
  if (server) {
    server.close((err) => {
      if (err) {
        logger.error('Error during server shutdown:', err);
        process.exit(1);
      }
      
      logger.info('Server closed successfully');
      
      // Close database connections, cleanup resources, etc.
      // Add any cleanup logic here
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    });
    
    // Force close after 30 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
};

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Initialize database connection
    const { testConnection } = require('./config/database');
    logger.info('Testing database connection...');
    
    try {
      await testConnection();
      logger.info('Database connection established successfully');
    } catch (dbError) {
      logger.warn('Database connection failed, continuing with mock database:', dbError.message);
    }
    
    // Initialize SSL configuration
    await sslConfig.initialize();
    
    let server;
    
    if (sslConfig.isEnabled) {
      // Create HTTPS server
      server = sslConfig.createHttpsServer(app);
      
      // Also create HTTP server for redirects
      const httpServer = http.createServer((req, res) => {
        const httpsUrl = `https://${req.headers.host}${req.url}`;
        res.writeHead(301, { Location: httpsUrl });
        res.end();
      });
      
      httpServer.listen(80, () => {
        logger.info('HTTP redirect server running on port 80');
      });
      
      server.listen(PORT, () => {
        logger.info(`FieldSync AI HTTPS server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`Health check available at: https://localhost:${PORT}/health`);
        logger.info(`SSL health check available at: https://localhost:${PORT}/health/ssl`);
        logger.info(`Metrics available at: https://localhost:${PORT}/metrics`);
        
        // Notify PM2 that the app is ready
        if (process.send) {
          process.send('ready');
        }
      });
    } else {
      // Create HTTP server
      server = http.createServer(app);
      
      server.listen(PORT, () => {
        logger.info(`FieldSync AI HTTP server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`Health check available at: http://localhost:${PORT}/health`);
        logger.info(`Metrics available at: http://localhost:${PORT}/metrics`);
        
        // Notify PM2 that the app is ready
        if (process.send) {
          process.send('ready');
        }
      });
    }
    
    // Store server reference for graceful shutdown
    global.server = server;
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
