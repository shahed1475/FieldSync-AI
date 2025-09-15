// Load environment variables first
require('dotenv').config();

// Add comprehensive error handling at startup
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('🚀 Starting ClaimFlow AI server...');
console.log('📁 Working directory:', process.cwd());
console.log('🔧 Node version:', process.version);

// Import core dependencies
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
console.log('✅ Core dependencies loaded successfully');

// Import middleware
const { securityMiddleware, securityHeaders, securityErrorHandler } = require('./src/middleware/security');
const IntegrationMiddleware = require('./src/middleware/integrationMiddleware');
const { errorHandler } = require('./src/middleware/errorHandler');
const { auditMiddleware } = require('./src/middleware/audit');
console.log('✅ Middleware loaded successfully');

// Import routes
const authRoutes = require('./src/routes/auth');
const authorizationRoutes = require('./src/routes/authorization');
const notificationRoutes = require('./src/routes/notifications');
const complianceRoutes = require('./src/routes/compliance');
const patientRoutes = require('./src/routes/patients');
const providerRoutes = require('./src/routes/providers');
const userRoutes = require('./src/routes/users');
const documentRoutes = require('./src/routes/documents');
const backupRoutes = require('./src/routes/backup');
console.log('✅ Routes loaded successfully');

// Import database connection
const { pool } = require('./src/database/connection');

// Import services
const ComplianceService = require('./src/services/complianceService');
const NotificationService = require('./src/services/notificationService');
const WorkflowEngine = require('./src/services/workflowEngine');
const AIProcessingPipeline = require('./src/services/aiProcessingPipeline');
const CollectiveLearningEngine = require('./src/services/collectiveLearningEngine');
const AnalyticsReportingService = require('./src/services/analyticsReportingService');
const PerformanceOptimizationService = require('./src/services/performanceOptimizationService');
const PracticeEfficiencyService = require('./src/services/practiceEfficiencyService');
const PayerTrendsService = require('./src/services/payerTrendsService');
console.log('✅ Services loaded successfully');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
let integrationMiddleware;
let complianceService;
let notificationService;
let workflowEngine;
let aiProcessingPipeline;
let learningEngine;
let analyticsService;
let performanceService;
let efficiencyService;
let trendsService;

async function initializeServices() {
  try {
    console.log('Initializing services...');
    
    // Initialize core services
    complianceService = new ComplianceService();
    await complianceService.initialize();
    
    notificationService = new NotificationService(pool);
    await notificationService.initialize();
    
    workflowEngine = new WorkflowEngine(pool);
    await workflowEngine.initialize();
    
    // Initialize AI Processing Pipeline
    aiProcessingPipeline = new AIProcessingPipeline(pool);
    await aiProcessingPipeline.initialize();
    console.log('AI Processing Pipeline initialized');
    
    // Initialize advanced AI services
    learningEngine = new CollectiveLearningEngine(pool);
    await learningEngine.initialize();
    
    analyticsService = new AnalyticsReportingService(pool);
    await analyticsService.initialize();
    
    performanceService = new PerformanceOptimizationService(pool);
    await performanceService.initialize();
    
    efficiencyService = new PracticeEfficiencyService(pool);
    await efficiencyService.initialize();
    
    trendsService = new PayerTrendsService(pool);
    await trendsService.initialize();
    
    console.log('Advanced AI services initialized');
    
    // Initialize integration middleware
    integrationMiddleware = new IntegrationMiddleware({
      complianceService,
      workflowEngine,
      notificationService,
      aiProcessingPipeline
    });
    await integrationMiddleware.initialize();
    
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Security middleware (applied first)
app.use(securityHeaders);
app.use(securityMiddleware.helmet);
app.use(securityMiddleware.cors);

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression and logging
app.use(compression());
app.use(morgan('combined', {
  stream: fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' })
}));
app.use(morgan('dev')); // Console logging for development

// Rate limiting (general)
app.use(securityMiddleware.rateLimiters.general);

// Audit logging middleware
app.use(auditMiddleware);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const pipelineHealth = aiProcessingPipeline ? await aiProcessingPipeline.getPipelineHealth() : { status: 'inactive' };
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        compliance: complianceService ? 'active' : 'inactive',
        workflow: workflowEngine ? 'active' : 'inactive',
        notifications: notificationService ? 'active' : 'inactive',
        ai_pipeline: pipelineHealth.status
      },
      ai_pipeline_details: pipelineHealth,
      advanced_services: {
        collective_learning: learningEngine ? 'active' : 'inactive',
        analytics: analyticsService ? 'active' : 'inactive',
        performance: performanceService ? 'active' : 'inactive',
        efficiency: efficiencyService ? 'active' : 'inactive',
        trends: trendsService ? 'active' : 'inactive'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// AI Processing endpoints
app.post('/api/ai/process-document', async (req, res) => {
  try {
    const { documentPath, submissionId, payerType } = req.body;
    
    if (!documentPath || !submissionId) {
      return res.status(400).json({
        error: 'Document path and submission ID are required'
      });
    }

    const result = await aiProcessingPipeline.processSubmission({
      submissionId,
      documentPath,
      payerType: payerType || 'generic',
      userId: req.user?.id,
      metadata: req.body.metadata || {}
    });

    res.json({
      success: true,
      jobId: result.jobId,
      status: result.status,
      stages: result.stages
    });
  } catch (error) {
    console.error('Document processing error:', error);
    res.status(500).json({
      error: 'Failed to process document',
      details: error.message
    });
  }
});

app.get('/api/ai/job/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await aiProcessingPipeline.getJobStatus(jobId);
    
    res.json(status);
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      details: error.message
    });
  }
});

app.get('/api/ai/job/:jobId/results', async (req, res) => {
  try {
    const { jobId } = req.params;
    const results = await aiProcessingPipeline.getJobResults(jobId);
    
    res.json(results);
  } catch (error) {
    console.error('Job results error:', error);
    res.status(500).json({
      error: 'Failed to get job results',
      details: error.message
    });
  }
});

app.post('/api/ai/generate-appeal', async (req, res) => {
  try {
    const { submissionId, denialReason, clinicalData } = req.body;
    
    if (!submissionId || !denialReason) {
      return res.status(400).json({
        error: 'Submission ID and denial reason are required'
      });
    }

    const appeal = await aiProcessingPipeline.generateAppeal({
      submissionId,
      denialReason,
      clinicalData: clinicalData || {},
      userId: req.user?.id
    });

    res.json({
      success: true,
      appealId: appeal.appealId,
      appealLetter: appeal.appealLetter,
      evidence: appeal.evidence,
      confidence: appeal.confidence
    });
  } catch (error) {
    console.error('Appeal generation error:', error);
    res.status(500).json({
      error: 'Failed to generate appeal',
      details: error.message
    });
  }
});

app.get('/api/ai/analytics/dashboard', async (req, res) => {
  try {
    const analytics = await aiProcessingPipeline.getAnalyticsDashboard();
    res.json(analytics);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'Failed to get analytics',
      details: error.message
    });
  }
});

// Advanced AI service endpoints

// Collective Learning Engine endpoints
app.get('/api/ai/collective-learning/insights', async (req, res) => {
  try {
    const insights = await learningEngine.getCollectiveInsights();
    res.json(insights);
  } catch (error) {
    console.error('Collective learning error:', error);
    res.status(500).json({
      error: 'Failed to get collective insights',
      details: error.message
    });
  }
});

app.post('/api/ai/collective-learning/record', async (req, res) => {
  try {
    const { authorizationData, outcome } = req.body;
    await learningEngine.recordLearningData(authorizationData, outcome);
    res.json({ success: true, message: 'Learning data recorded' });
  } catch (error) {
    console.error('Learning data recording error:', error);
    res.status(500).json({
      error: 'Failed to record learning data',
      details: error.message
    });
  }
});

app.get('/api/ai/collective-learning/recommendations', async (req, res) => {
  try {
    const { procedureCode, payerName } = req.query;
    const recommendations = await learningEngine.getRecommendations(procedureCode, payerName);
    res.json(recommendations);
  } catch (error) {
    console.error('Learning recommendations error:', error);
    res.status(500).json({
      error: 'Failed to get recommendations',
      details: error.message
    });
  }
});

// Analytics & Reporting endpoints
app.get('/api/ai/analytics/comprehensive-report', async (req, res) => {
  try {
    const { startDate, endDate, practiceId } = req.query;
    const report = await analyticsService.generateComprehensiveReport({
      startDate,
      endDate,
      practiceId
    });
    res.json(report);
  } catch (error) {
    console.error('Analytics report error:', error);
    res.status(500).json({
      error: 'Failed to generate analytics report',
      details: error.message
    });
  }
});

app.get('/api/ai/analytics/dashboard', async (req, res) => {
  try {
    const { practiceId, timeframe } = req.query;
    const dashboard = await analyticsService.generateDashboard(practiceId, timeframe);
    res.json(dashboard);
  } catch (error) {
    console.error('Analytics dashboard error:', error);
    res.status(500).json({
      error: 'Failed to generate dashboard',
      details: error.message
    });
  }
});

app.get('/api/ai/analytics/payer-performance', async (req, res) => {
  try {
    const { payerId, timeframe } = req.query;
    const performance = await analyticsService.calculatePayerPerformance(payerId, timeframe);
    res.json(performance);
  } catch (error) {
    console.error('Payer performance error:', error);
    res.status(500).json({
      error: 'Failed to calculate payer performance',
      details: error.message
    });
  }
});

// Performance Optimization endpoints
app.get('/api/ai/performance/optimization-recommendations', async (req, res) => {
  try {
    const { practiceId } = req.query;
    const recommendations = await performanceService.getOptimizationRecommendations(practiceId);
    res.json(recommendations);
  } catch (error) {
    console.error('Performance optimization error:', error);
    res.status(500).json({
      error: 'Failed to get optimization recommendations',
      details: error.message
    });
  }
});

app.get('/api/ai/performance/metrics', async (req, res) => {
  try {
    const { timeframe } = req.query;
    const metrics = await performanceService.getPerformanceMetrics(timeframe);
    res.json(metrics);
  } catch (error) {
    console.error('Performance metrics error:', error);
    res.status(500).json({
      error: 'Failed to get performance metrics',
      details: error.message
    });
  }
});

app.post('/api/ai/performance/optimize-operation', async (req, res) => {
  try {
    const { operationType, parameters } = req.body;
    const result = await performanceService.optimizeOperation(operationType, parameters);
    res.json(result);
  } catch (error) {
    console.error('Operation optimization error:', error);
    res.status(500).json({
      error: 'Failed to optimize operation',
      details: error.message
    });
  }
});

app.get('/api/ai/efficiency/practice-insights', async (req, res) => {
  try {
    const { practiceId } = req.query;
    const insights = await efficiencyService.getPracticeEfficiencyInsights(practiceId);
    res.json(insights);
  } catch (error) {
    console.error('Practice efficiency error:', error);
    res.status(500).json({
      error: 'Failed to get practice efficiency insights',
      details: error.message
    });
  }
});

// Payer Trends Analysis endpoints
app.get('/api/ai/trends/payer-analysis', async (req, res) => {
  try {
    const { payerName, timeframe } = req.query;
    const trends = await trendsService.getTrendsReport(payerName, timeframe);
    res.json(trends);
  } catch (error) {
    console.error('Payer trends error:', error);
    res.status(500).json({
      error: 'Failed to get payer trends',
      details: error.message
    });
  }
});

app.get('/api/ai/trends/competitive-analysis', async (req, res) => {
  try {
    const analysis = await trendsService.generateCompetitiveAnalysis();
    res.json(analysis);
  } catch (error) {
    console.error('Competitive analysis error:', error);
    res.status(500).json({
      error: 'Failed to generate competitive analysis',
      details: error.message
    });
  }
});

app.get('/api/ai/trends/predictive-insights', async (req, res) => {
  try {
    const { payerName, procedureCode } = req.query;
    const insights = await trendsService.generatePredictiveInsights();
    res.json(insights);
  } catch (error) {
    console.error('Predictive insights error:', error);
    res.status(500).json({
      error: 'Failed to generate predictive insights',
      details: error.message
    });
  }
});

// API routes with integrated security and compliance
app.use('/api/auth', securityMiddleware.rateLimiters.auth, authRoutes);

// AI Processing Pipeline routes
app.use('/api/ai', 
  integrationMiddleware ? integrationMiddleware.getAuthorizationMiddleware() : [],
  (req, res, next) => {
    req.services = {
      complianceService,
      workflowEngine,
      notificationService,
      aiProcessingPipeline,
      learningEngine,
      analyticsService,
      performanceService,
      efficiencyService,
      trendsService
    };
    next();
  }
);

// Authorization routes with full integration middleware
app.use('/api/authorizations', 
  integrationMiddleware ? integrationMiddleware.getAuthorizationMiddleware() : [],
  authorizationRoutes
);

// Notification routes
app.use('/api/notifications', 
  integrationMiddleware ? integrationMiddleware.getAuthorizationMiddleware() : [],
  notificationRoutes
);

// Compliance and reporting routes
app.use('/api/compliance', 
  integrationMiddleware ? integrationMiddleware.getReportingMiddleware() : [],
  complianceRoutes
);

// Patient data routes (high security)
app.use('/api/patients', 
  integrationMiddleware ? integrationMiddleware.getAuthorizationMiddleware() : [],
  patientRoutes
);

// Provider routes
app.use('/api/providers', 
  integrationMiddleware ? integrationMiddleware.getAuthorizationMiddleware() : [],
  providerRoutes
);

// User management routes (admin only)
app.use('/api/users', 
  integrationMiddleware ? integrationMiddleware.getAdminMiddleware() : [],
  userRoutes
);

// Document upload routes
app.use('/api/documents', 
  securityMiddleware.rateLimiters.upload,
  integrationMiddleware ? integrationMiddleware.getAuthorizationMiddleware() : [],
  documentRoutes
);

// Backup routes (admin only)
app.use('/api/backup', 
  integrationMiddleware ? integrationMiddleware.getAdminMiddleware() : [],
  backupRoutes
);

// Serve static files (if any)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Serve React app for any non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handling middleware (must be last)
app.use(securityErrorHandler);
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close database connections
  if (complianceService && complianceService.pool) {
    await complianceService.pool.end();
  }
  
  if (workflowEngine && workflowEngine.pool) {
    await workflowEngine.pool.end();
  }
  
  // Stop notification service
  if (notificationService) {
    await notificationService.shutdown();
  }
  
  // Stop AI processing pipeline
  if (aiProcessingPipeline) {
    await aiProcessingPipeline.shutdown();
  }
  
  // Stop advanced AI services
  if (learningEngine) {
    await learningEngine.shutdown();
  }
  
  if (analyticsService) {
    await analyticsService.shutdown();
  }
  
  if (performanceService) {
    await performanceService.shutdown();
  }
  
  if (efficiencyService) {
    await efficiencyService.shutdown();
  }
  
  if (trendsService) {
    await trendsService.shutdown();
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Close database connections
  if (complianceService && complianceService.pool) {
    await complianceService.pool.end();
  }
  
  if (workflowEngine && workflowEngine.pool) {
    await workflowEngine.pool.end();
  }
  
  // Stop notification service
  if (notificationService) {
    await notificationService.shutdown();
  }
  
  // Stop AI processing pipeline
  if (aiProcessingPipeline) {
    await aiProcessingPipeline.shutdown();
  }
  
  process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log to file
  fs.appendFileSync(
    path.join(logsDir, 'rejections.log'),
    `${new Date().toISOString()} - Unhandled Rejection: ${reason}\n`
  );
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Log to file
  fs.appendFileSync(
    path.join(logsDir, 'exceptions.log'),
    `${new Date().toISOString()} - Uncaught Exception: ${error.stack}\n`
  );
  process.exit(1);
});

// Start server
async function startServer() {
  try {
    // Initialize all services first
    await initializeServices();
    
    // Start the server
    const server = app.listen(PORT, () => {
      console.log(`\n🚀 ClaimFlow AI Authorization System`);
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔒 Security: Enhanced with HIPAA compliance`);
      console.log(`📊 Monitoring: Audit logging enabled`);
      console.log(`🔔 Notifications: Real-time system active`);
      console.log(`⚡ Workflow Engine: Initialized and ready`);
      console.log(`\n📋 Available endpoints:`);
      console.log(`   GET  /health - Health check`);
      console.log(`   POST /api/auth/* - Authentication`);
      console.log(`   *    /api/authorizations/* - Authorization workflow`);
      console.log(`   *    /api/notifications/* - Notification system`);
      console.log(`   *    /api/compliance/* - Compliance reporting`);
      console.log(`   *    /api/patients/* - Patient data (HIPAA protected)`);
      console.log(`   *    /api/providers/* - Provider management`);
      console.log(`   *    /api/users/* - User management (admin)`);
      console.log(`   *    /api/documents/* - Document management`);
      console.log(`   *    /api/backup/* - Backup operations (admin)`);
      console.log(`\n✅ System ready for authorization processing\n`);
    });
    
    // Set server timeout
    server.timeout = 30000; // 30 seconds
    
    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Export app for testing
module.exports = { app, startServer };

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}