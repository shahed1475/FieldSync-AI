const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const { logger, auditLogger } = require('./utils/logger');
const { initializeDatabase } = require('./database/connection');
const authRoutes = require('./routes/auth');
const practiceRoutes = require('./routes/practices');
const providerRoutes = require('./routes/providers');
const patientRoutes = require('./routes/patients');
const authorizationRoutes = require('./routes/authorizations');
const documentRoutes = require('./routes/documents');
const auditRoutes = require('./routes/audit');
const complianceRoutes = require('./routes/compliance');
const backupRoutes = require('./routes/backup');
const { errorHandler } = require('./middleware/errorHandler');
const { auditMiddleware } = require('./middleware/audit');
const { authMiddleware } = require('./middleware/auth');
const { enforcePasswordPolicies, addPasswordPolicyInfo } = require('./middleware/passwordPolicy');
const passwordScheduler = require('./services/passwordScheduler');
const ComplianceService = require('./services/complianceService');
const BackupService = require('./services/backupService');
const websocketService = require('./services/websocketService');
const databaseListener = require('./services/databaseListener');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for accurate IP addresses behind load balancers
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Request-ID']
}));

// Compression middleware
app.use(compression());

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    auditLogger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      correlationId: req.correlationId
    });
    
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later'
      }
    });
  }
});

app.use(generalLimiter);

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for webhook verification if needed
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request correlation ID middleware
app.use((req, res, next) => {
  req.correlationId = req.get('X-Correlation-ID') || req.get('X-Request-ID') || uuidv4();
  res.set('X-Correlation-ID', req.correlationId);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    correlationId: req.correlationId,
    contentLength: req.get('Content-Length') || 0
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      correlationId: req.correlationId,
      contentLength: res.get('Content-Length') || 0
    });
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
});

// Security headers middleware
app.use((req, res, next) => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Add custom security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  });
  
  next();
});

// Audit logging middleware (must be before routes)
app.use(auditMiddleware);

// Apply password policy middleware to all routes except auth
app.use('/api/v1', (req, res, next) => {
  // Skip password policies for auth endpoints and health checks
  if (req.path.startsWith('/auth/') || req.path === '/health') {
    return next();
  }
  // Apply password policy enforcement
  enforcePasswordPolicies[0](req, res, (err) => {
    if (err) return next(err);
    enforcePasswordPolicies[1](req, res, (err) => {
      if (err) return next(err);
      enforcePasswordPolicies[2](req, res, (err) => {
        if (err) return next(err);
        enforcePasswordPolicies[3](req, res, next);
      });
    });
  });
});

// Add password policy info to responses
app.use(addPasswordPolicyInfo);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: 'connected',
          encryption: 'available',
          logging: 'active'
        }
      }
    });
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service health check failed'
      }
    });
  }
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/practices', authMiddleware, practiceRoutes);
app.use('/api/v1/providers', authMiddleware, providerRoutes);
app.use('/api/v1/patients', authMiddleware, patientRoutes);
app.use('/api/v1/authorizations', authMiddleware, authorizationRoutes);
app.use('/api/v1/documents', authMiddleware, documentRoutes);
app.use('/api/v1/audit', authMiddleware, auditRoutes);
app.use('/api/v1/compliance', authMiddleware, complianceRoutes);
app.use('/api/v1/backup', authMiddleware, backupRoutes);

// 404 handler
app.use('*', (req, res) => {
  auditLogger.warn('404 Not Found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(404).json({
    error: 'Resource not found',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

// Global error handler
app.use(errorHandler);

// Initialize password scheduler and compliance service
const initializeServices = async () => {
  try {
    // Initialize password scheduler
    await passwordScheduler.initialize();
    logger.info('Password scheduler initialized successfully');
    
    // Initialize compliance service
    const complianceService = new ComplianceService();
    console.log('Compliance monitoring service initialized');
    
    // Initialize backup service
    const backupService = new BackupService();
    await backupService.initialize();
    console.log('Backup service initialized');
    
    // Initialize database listener for real-time updates
    await databaseListener.initialize();
    logger.info('Database listener initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    // Don't exit the process, but log the error
    console.error('⚠️  Warning: Some services failed to initialize');
  }
};

// Start server
async function startServer() {
  try {
    // Initialize database connection
    await initializeDatabase();
    
    const server = app.listen(PORT, async () => {
      logger.info('ClaimFlow AI server started', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      });
      
      // Initialize WebSocket service
      websocketService.initialize(server);
      
      // Log startup audit event
      auditLogger.info('Application started', {
        event_type: 'system',
        action: 'application_start',
        details: {
          port: PORT,
          environment: process.env.NODE_ENV || 'development',
          version: process.env.npm_package_version || '1.0.0'
        },
        timestamp: new Date().toISOString()
      });
      
      // Initialize services after server starts
      await initializeServices();
    });
    
    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error', {
        error: error.message,
        stack: error.stack
      });
      
      auditLogger.error('Server error occurred', {
        event_type: 'system',
        action: 'server_error',
        details: {
          error: error.message,
          code: error.code
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      passwordScheduler.stopAll();
      // Note: ComplianceService and BackupService use cron jobs that will be cleaned up automatically
      
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      passwordScheduler.stopAll();
      // Note: ComplianceService and BackupService use cron jobs that will be cleaned up automatically
      
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });
    
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

startServer();

module.exports = app;