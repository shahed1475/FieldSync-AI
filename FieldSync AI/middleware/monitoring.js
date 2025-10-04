const { logger, logPerformance, logApiError } = require('../config/logger');

// Performance monitoring middleware
const performanceMonitoring = (req, res, next) => {
  const start = Date.now();
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    // Log performance metrics
    logPerformance(`${req.method} ${req.originalUrl}`, duration, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      userId: req.user?.id,
      orgId: req.user?.orgId,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    
    // Log slow requests (> 2 seconds)
    if (duration > 2000) {
      logger.warn(`Slow request detected: ${req.method} ${req.originalUrl} took ${duration}ms`, {
        method: req.method,
        url: req.originalUrl,
        duration,
        statusCode: res.statusCode,
        userId: req.user?.id,
        orgId: req.user?.orgId
      });
    }
    
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Error tracking middleware
const errorTracking = (err, req, res, next) => {
  // Log the error
  logApiError(err, req, {
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = 'Database Validation Error';
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    message = 'Resource already exists';
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Invalid reference';
  }

  const errorResponse = {
    success: false,
    message: isDevelopment ? message : 'An error occurred',
    timestamp: new Date().toISOString(),
    requestId: req.id || req.headers['x-request-id']
  };

  // Include error details in development
  if (isDevelopment) {
    errorResponse.error = {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
  }

  res.status(statusCode).json(errorResponse);
};

// Health check endpoint
const healthCheck = (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid
  };

  // Check database connection
  const { sequelize } = require('../models');
  sequelize.authenticate()
    .then(() => {
      healthData.database = 'connected';
      res.json(healthData);
    })
    .catch((error) => {
      healthData.status = 'unhealthy';
      healthData.database = 'disconnected';
      healthData.error = error.message;
      
      logger.error('Health check failed - Database connection error', { error: error.message });
      res.status(503).json(healthData);
    });
};

// Detailed health check with dependencies
const detailedHealthCheck = async (req, res) => {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {}
  };

  try {
    // Database check
    const { sequelize } = require('../models');
    await sequelize.authenticate();
    checks.checks.database = {
      status: 'healthy',
      responseTime: Date.now()
    };
  } catch (error) {
    checks.status = 'unhealthy';
    checks.checks.database = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Memory check
  const memoryUsage = process.memoryUsage();
  const memoryThreshold = 1024 * 1024 * 1024; // 1GB
  checks.checks.memory = {
    status: memoryUsage.heapUsed < memoryThreshold ? 'healthy' : 'warning',
    heapUsed: memoryUsage.heapUsed,
    heapTotal: memoryUsage.heapTotal,
    external: memoryUsage.external
  };

  // Disk space check (simplified)
  checks.checks.disk = {
    status: 'healthy' // In production, implement actual disk space check
  };

  // Response time check
  const start = Date.now();
  setTimeout(() => {
    const responseTime = Date.now() - start;
    checks.checks.responseTime = {
      status: responseTime < 100 ? 'healthy' : 'warning',
      value: responseTime
    };

    const statusCode = checks.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(checks);
  }, 1);
};

// Metrics collection middleware
const metricsCollection = (req, res, next) => {
  // Increment request counter
  if (!global.metrics) {
    global.metrics = {
      requests: 0,
      errors: 0,
      responseTime: [],
      endpoints: {}
    };
  }

  global.metrics.requests++;
  
  const endpoint = `${req.method} ${req.route?.path || req.originalUrl}`;
  if (!global.metrics.endpoints[endpoint]) {
    global.metrics.endpoints[endpoint] = {
      count: 0,
      errors: 0,
      totalTime: 0,
      avgTime: 0
    };
  }
  
  global.metrics.endpoints[endpoint].count++;

  const start = Date.now();
  
  // Override res.end to capture metrics
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    // Update metrics
    global.metrics.responseTime.push(duration);
    global.metrics.endpoints[endpoint].totalTime += duration;
    global.metrics.endpoints[endpoint].avgTime = 
      global.metrics.endpoints[endpoint].totalTime / global.metrics.endpoints[endpoint].count;
    
    // Track errors
    if (res.statusCode >= 400) {
      global.metrics.errors++;
      global.metrics.endpoints[endpoint].errors++;
    }
    
    // Keep only last 1000 response times
    if (global.metrics.responseTime.length > 1000) {
      global.metrics.responseTime = global.metrics.responseTime.slice(-1000);
    }
    
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Metrics endpoint
const getMetrics = (req, res) => {
  const metrics = global.metrics || {
    requests: 0,
    errors: 0,
    responseTime: [],
    endpoints: {}
  };

  const avgResponseTime = metrics.responseTime.length > 0 
    ? metrics.responseTime.reduce((a, b) => a + b, 0) / metrics.responseTime.length 
    : 0;

  const errorRate = metrics.requests > 0 ? (metrics.errors / metrics.requests) * 100 : 0;

  res.json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    requests: {
      total: metrics.requests,
      errors: metrics.errors,
      errorRate: parseFloat(errorRate.toFixed(2))
    },
    performance: {
      avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
      minResponseTime: Math.min(...metrics.responseTime) || 0,
      maxResponseTime: Math.max(...metrics.responseTime) || 0
    },
    endpoints: metrics.endpoints,
    system: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      pid: process.pid,
      version: process.version,
      platform: process.platform
    }
  });
};

// Request ID middleware
const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || 
           `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
};

module.exports = {
  performanceMonitoring,
  errorTracking,
  healthCheck,
  detailedHealthCheck,
  metricsCollection,
  getMetrics,
  requestId
};