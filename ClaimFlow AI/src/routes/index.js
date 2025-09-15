const express = require('express');
const { logger } = require('../utils/logger');

const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const practicesRoutes = require('./practices');
const providersRoutes = require('./providers');
const patientsRoutes = require('./patients');
const authorizationsRoutes = require('./authorizations');
const documentsRoutes = require('./documents');

// API version and health check
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'ClaimFlow AI API v1',
    version: '1.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/v1/auth',
      practices: '/api/v1/practices',
      providers: '/api/v1/providers',
      patients: '/api/v1/patients',
      authorizations: '/api/v1/authorizations',
      documents: '/api/v1/documents'
    }
  });
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const { supabase } = require('../database/connection');
    
    // Test database connection
    const { data, error } = await supabase
      .from('system_config')
      .select('config_key')
      .limit(1);
    
    const dbStatus = error ? 'error' : 'healthy';
    
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      services: {
        database: {
          status: dbStatus,
          message: error ? error.message : 'Connected'
        },
        encryption: {
          status: process.env.ENCRYPTION_KEY ? 'configured' : 'missing',
          message: process.env.ENCRYPTION_KEY ? 'Encryption key configured' : 'Encryption key not configured'
        },
        storage: {
          status: process.env.DOCUMENT_STORAGE_PATH ? 'configured' : 'default',
          message: process.env.DOCUMENT_STORAGE_PATH ? 'Custom storage path configured' : 'Using default storage path'
        }
      }
    };
    
    // Set overall status based on critical services
    if (dbStatus === 'error' || !process.env.ENCRYPTION_KEY) {
      healthCheck.status = 'unhealthy';
    }
    
    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthCheck);
    
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message,
      correlationId: req.correlationId
    });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/practices', practicesRoutes);
router.use('/providers', providersRoutes);
router.use('/patients', patientsRoutes);
router.use('/authorizations', authorizationsRoutes);
router.use('/documents', documentsRoutes);

// 404 handler for API routes
router.use('*', (req, res) => {
  logger.warn('API endpoint not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    correlationId: req.correlationId
  });
  
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
    available_endpoints: {
      auth: '/api/v1/auth',
      practices: '/api/v1/practices',
      patients: '/api/v1/patients',
      authorizations: '/api/v1/authorizations',
      documents: '/api/v1/documents'
    }
  });
});

module.exports = router;