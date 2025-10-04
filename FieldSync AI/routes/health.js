const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { getCacheStats, clearExpiredCache } = require('../middleware/cache');
const { healthCheckError } = require('../middleware/errorHandler');

// Basic health check endpoint
router.get('/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      ...healthStatus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Detailed system status endpoint
router.get('/status', async (req, res) => {
  const startTime = Date.now();
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {}
  };

  // Check database connection
  try {
    const dbStart = Date.now();
    await sequelize.authenticate();
    status.services.database = {
      status: 'healthy',
      latency: `${Date.now() - dbStart}ms`,
      connection: 'active'
    };
  } catch (error) {
    status.services.database = healthCheckError('database', error);
    status.status = 'degraded';
  }

  // Check cache system
  try {
    const cacheStats = await getCacheStats();
    status.services.cache = {
      status: 'healthy',
      ...cacheStats
    };
  } catch (error) {
    status.services.cache = healthCheckError('cache', error);
    status.status = 'degraded';
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  status.services.memory = {
    status: 'healthy',
    heap_used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heap_total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
  };

  // CPU usage (basic)
  const cpuUsage = process.cpuUsage();
  status.services.cpu = {
    status: 'healthy',
    user: cpuUsage.user,
    system: cpuUsage.system
  };

  // Response time
  status.response_time = `${Date.now() - startTime}ms`;

  res.json({
    success: true,
    ...status
  });
});

// Database-specific health check
router.get('/health/database', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Test connection
    await sequelize.authenticate();
    
    // Test query
    const result = await sequelize.query('SELECT 1 as test', { 
      type: sequelize.QueryTypes.SELECT 
    });
    
    const latency = Date.now() - startTime;
    
    // Get connection pool info
    const pool = sequelize.connectionManager.pool;
    
    res.json({
      success: true,
      status: 'healthy',
      latency: `${latency}ms`,
      connection: 'active',
      pool: {
        size: pool?.size || 0,
        available: pool?.available || 0,
        using: pool?.using || 0,
        waiting: pool?.waiting || 0
      },
      test_query: result[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cache-specific health check
router.get('/health/cache', async (req, res) => {
  try {
    const stats = await getCacheStats();
    
    res.json({
      success: true,
      status: 'healthy',
      ...stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// System metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      arch: process.arch,
      node_version: process.version,
      pid: process.pid
    };

    // Add database metrics if available
    try {
      const pool = sequelize.connectionManager.pool;
      metrics.database = {
        pool_size: pool?.size || 0,
        pool_available: pool?.available || 0,
        pool_using: pool?.using || 0,
        pool_waiting: pool?.waiting || 0
      };
    } catch (error) {
      metrics.database = { error: 'Unable to fetch database metrics' };
    }

    // Add cache metrics if available
    try {
      metrics.cache = await getCacheStats();
    } catch (error) {
      metrics.cache = { error: 'Unable to fetch cache metrics' };
    }

    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cache maintenance endpoint
router.post('/maintenance/cache/cleanup', async (req, res) => {
  try {
    const deletedCount = await clearExpiredCache();
    
    res.json({
      success: true,
      message: 'Cache cleanup completed',
      deleted_entries: deletedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Cache cleanup failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness probe (for Kubernetes/Docker)
router.get('/ready', async (req, res) => {
  try {
    // Check if all critical services are ready
    await sequelize.authenticate();
    
    res.json({
      success: true,
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Liveness probe (for Kubernetes/Docker)
router.get('/live', (req, res) => {
  res.json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;